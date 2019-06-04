'use strict';

var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var lodash = Devebot.require('lodash');
var debugx = Devebot.require('debug')('appBrowserlet:service');
var Jsonsure = require('jsonsure');
var ejs = require('ejs');
var fs = require('fs');
var path = require('path');
var util = require('util');
var run = require('browser-run');
var streamBuffers = require('stream-buffers');
var chores = require('../utils/chores');

var Service = function(params) {
  debugx.enabled && debugx(' + constructor begin ...');

  params = params || {};
  var self = this;

  var LX = params.loggingFactory.getLogger();
  var LT = params.loggingFactory.getTracer();
  var express = params.webweaverService.express;

  var pluginCfg = params.sandboxConfig;
  var contextPath = pluginCfg.contextPath || '/browserlet';
  var scriptDir = pluginCfg.scriptDir;

  var mappings = chores.mappingsLoader(scriptDir);
  debugx.enabled && debugx(' - mapings has been loaded: %s', JSON.stringify(Object.keys(mappings)));

  var descriptors = lodash.keyBy(pluginCfg.routines || [], 'name');
  lodash.forOwn(mappings, function(mapping, name) {
    lodash.merge(mapping, descriptors[name]);
    mapping.resultTransform = mapping.resultTransform || function(result) {
      return { result: result };
    }
  });
  debugx.enabled && debugx(' - mappings content: %s', util.inspect(mappings));

  var getBrowser = function(routineName) {
    var descriptor = mappings[routineName];
    var staticPath = path.join(scriptDir, routineName, descriptor.staticPath || 'static');
    var sslOpts = descriptor.ssl;
    if (!lodash.isObject(sslOpts)) {
      sslOpts = pluginCfg.ssl;
    }
    var browserCfg = {
      ssl: sslOpts,
      static: staticPath,
      input: descriptor.scriptType || 'html',
      browser: descriptor.browser || 'electron'
    };
    debugx.enabled && debugx(' - browserConfig: %s', JSON.stringify(browserCfg));
    var browser = run(browserCfg);
    return Promise.resolve(browser);
  }

  var validator = new Jsonsure();
  var validateData = function(routineName, data) {
    var descriptor = mappings[routineName];
    if (lodash.isObject(descriptor.dataSchema)) {
      var result = validator.validate(data, descriptor.dataSchema);
      debugx.enabled && debugx(' - validating result: %s', JSON.stringify(result));
      if (result.ok) {
        LX.isEnabledFor('debug') && LX.log('debug', LT.add({
          message: 'validate routine input data: passed',
          routine: routineName,
          validationResult: result.ok
        }).toMessage({reset: true}));
        return Promise.resolve(result);
      } else {
        LX.isEnabledFor('error') && LX.log('error', LT.add({
          message: 'validate routine input data: failed',
          routine: routineName,
          validationResult: result.ok
        }).toMessage({reset: true}));
        return Promise.reject(result);
      }
    }
    return Promise.resolve({ ok: true });
  }

  var buildScript = function(routineName, data) {
    var descriptor = mappings[routineName];
    return Promise.resolve().then(function() {
      if (descriptor.templateText) {
        debugx.enabled && debugx(' - buildScript() - use cached template. length: %s',
            descriptor.templateText.length);
        return descriptor.templateText;
      } else {
        var tmplPath = path.join(scriptDir, routineName, 
        descriptor.templatePath || 'views',
        descriptor.templateScript || 'index.ejs');
        var fs_readFile = Promise.promisify(fs.readFile, {context: fs});
        return fs_readFile(tmplPath).then(function(buff) {
          descriptor.templateText = buff.toString();
          debugx.enabled && debugx(' - buildScript() - rendered template length: %s',
              descriptor.templateText.length);
          return descriptor.templateText;
        });
      }
    }).then(function(tmpl) {
      false && debugx.enabled && debugx(' - buildScript() - template: %s', tmpl);
      var text = ejs.render(tmpl, data);
      debugx.enabled && debugx(' - buildScript() - has done');
      return text;
    });
  }

  var execute = function(routineName, data) {
    var descriptor = mappings[routineName];
    return validateData(routineName, data).then(function() {
      if (descriptor && lodash.isFunction(descriptor.dataTransform)) {
        data = descriptor.dataTransform(data);
      }
      return buildScript(routineName, data);
    }).then(function(scriptString) {
      return getBrowser(routineName).then(function(browser) {
        debugx.enabled && debugx(' - execute() - browser object has been created');
        return new Promise(function(onResolved, onRejected) {
          var writableStream = new streamBuffers.WritableStreamBuffer();
          browser
          .on('error', function(err) {
            onRejected({ errorCode: err.code, errorName: err.name, message: err.message });
          })
          .pipe(writableStream)
          .on('error', function(err) {
            onRejected({ errorCode: err.code, errorName: err.name, message: err.message });
          })
          .on('finish', function() {
            var text = writableStream.getContentsAsString();
            if (lodash.isString(text)) {
              text = text.trim();
            }
            if (descriptor && lodash.isFunction(descriptor.resultTransform)) {
              text = descriptor.resultTransform(text);
            }
            debugx.enabled && debugx(' - execute() - result fields: %s', JSON.stringify(lodash.keys(text)));
            onResolved(text);
          });
          browser.end(scriptString);
        }).finally(function() {
          debugx.enabled && debugx(' - execute() - browser object will be destroyed');
          browser && browser.stop();
        });
      });
    });
  }

  self.buildRestRouter = function() {
    var router = express.Router();

    router.route('/:routine').put(function(req, res, next) {
      var routine = req.params.routine;
      var data = req.body;

      if (mappings[routine] == null) {
        res.status(404).json({
          message: 'Routine not found',
          routine: routine,
          routines: lodash.keys(mappings)
        });
        return;
      }

      LX.isEnabledFor('info') && LX.log('info', LT.add({
        message: 'Received a browser-routine request',
        routine: routine,
        paramType: typeof(data),
        paramFields: lodash.isObject(data) ? Object.keys(data) : undefined,
        requestId: pluginCfg.tracingRequestName && req[pluginCfg.tracingRequestName]
      }).toMessage({reset: true}));

      execute(routine, data).then(function(result) {
        debugx.enabled && debugx(' - Executing browser-routine begin');
        res.json(result);
      }).catch(function(exception) {
        debugx.enabled && debugx(' - Executing browser-routine is failed');
        res.status(exception.status || 404).json(exception);
      }).finally(function() {
        debugx.enabled && debugx(' - Executing browser-routine has been done');
      });
    });

    return router;
  }

  self.getRestRouterLayer = function() {
    return {
      name: 'app-browserlet-rest',
      path: contextPath,
      middleware: self.buildRestRouter(express)
    };
  };

  if (pluginCfg.autowired !== false) {
    params.webweaverService.push([
      params.webweaverService.getJsonBodyParserLayer([
        self.getRestRouterLayer(),
      ])
    ], pluginCfg.priority);
  }

  debugx.enabled && debugx(' - constructor end!');
};

Service.argumentSchema = {
  "properties": {
    "webweaverService": {
      "type": "object"
    }
  }
};

module.exports = Service;
