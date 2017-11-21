'use strict';

var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var lodash = Devebot.require('lodash');
var debugx = Devebot.require('debug')('appBrowserlet:service');
var ejs = require('ejs');
var fs = require('fs');
var path = require('path');
var run = require('browser-run');
var streamBuffers = require('stream-buffers');

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
  
  var getBrowser = function(providerName) {
    var staticPath = path.join(scriptDir, providerName, 'public');
    var browser = run({
      static: staticPath,
      input: 'html'
    });
    var promise = Promise.resolve(browser);
    return promise;
  }

  var buildScript = function(providerName, data) {
    var tmpl = fs.readFileSync(path.join(scriptDir, providerName, 'views', 'index.ejs')).toString();
    var text = ejs.render(tmpl, data);
    return Promise.resolve(text);
  }

  var execute = function(providerName, data) {
    return getBrowser(providerName).then(function(browser) {
      return new Promise(function(onResolved, onRejected) {
        buildScript(providerName, data).then(function(scriptString) {
          var writableStream = new streamBuffers.WritableStreamBuffer();
          browser.pipe(writableStream).on('finish', function() {
            var text = writableStream.getContentsAsString();
            onResolved(text.trim());
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

      LX.isEnabledFor('info') && LX.log('info', LT.add({
        message: 'Received a browser-routine request',
        routine: routine,
        paramType: typeof(data),
        paramFields: lodash.isObject(data) ? Object.keys(data) : undefined
      }).toMessage({reset: true}));

      execute(routine, data).then(function(result) {
        res.json({encrypted: result});
      }).catch(function(exception) {
        res.status(exception.status || 404).json(exception);
      }).finally(function() {
        debugx.enabled && debugx(' - POST browser-routine has been done');
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
