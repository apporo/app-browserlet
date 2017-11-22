'use strict';

var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var lodash = Devebot.require('lodash');
var debugx = Devebot.require('debug')('appBrowserlet:service');
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

  var descriptors = lodash.keyBy(pluginCfg.routines || []);
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
    debugx.enabled && debugx(' - staticPath: %s', staticPath);
    var browser = run({
      static: staticPath,
      input: descriptor.scriptType || 'html'
    });
    var promise = Promise.resolve(browser);
    return promise;
  }

  var buildScript = function(routineName, data) {
    var descriptor = mappings[routineName];
    var tmplPath = path.join(scriptDir, routineName, 
        descriptor.templatePath || 'views',
        descriptor.templateScript || 'index.ejs');
    var tmpl = fs.readFileSync(tmplPath).toString();
    var text = ejs.render(tmpl, data);
    return Promise.resolve(text);
  }

  var execute = function(routineName, data) {
    var descriptor = mappings[routineName];
    return getBrowser(routineName).then(function(browser) {
      return new Promise(function(onResolved, onRejected) {
        if (descriptor && lodash.isFunction(descriptor.dataTransform)) {
          data = descriptor.dataTransform(data);
        }
        buildScript(routineName, data).then(function(scriptString) {
          var writableStream = new streamBuffers.WritableStreamBuffer();
          browser.pipe(writableStream).on('finish', function() {
            var text = writableStream.getContentsAsString();
            if (lodash.isString(text)) {
              text = text.trim();
            }
            if (descriptor && lodash.isFunction(descriptor.resultTransform)) {
              text = descriptor.resultTransform(text);
            }
            onResolved(text);
          });
          browser.end(scriptString);
        }).catch(function(error) {
          onRejected(error);
        });
      }).finally(function() {
        browser.stop();
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
        paramFields: lodash.isObject(data) ? Object.keys(data) : undefined
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
