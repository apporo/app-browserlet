'use strict';

var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var lodash = Devebot.require('lodash');
var debugx = Devebot.require('debug')('appBrowserlet:service');

var Service = function(params) {
  debugx.enabled && debugx(' + constructor begin ...');

  params = params || {};
  var self = this;

  var logger = params.loggingFactory.getLogger();
  var express = params.webweaverService.express;

  var pluginCfg = params.sandboxConfig;
  var contextPath = pluginCfg.contextPath || '/browserlet';

  self.buildRestRouter = function() {
    var router = express.Router();

    router.route('/:collection/:id').get(function(req, res, next) {
      var id = req.params.id;

      if (lodash.isEmpty(id)) {
        return res.status(404).json({
          status: 404,
          message: 'Invalid Document ID'
        });
      }

      Promise.resolve({}).then(function(result) {
        res.json(result);
      }).catch(function(exception) {
        res.status(exception.status || 404).json(exception);
      }).finally(function() {
        debugx.enabled && debugx(' - GET document operation has been done');
      });
    });

    router.route('/:collection/:id').put(function(req, res, next) {
      var data = req.body;
      var id = req.params.id;

      Promise.resolve({}).then(function(result) {
        res.json(result);
      }).catch(function(exception) {
        res.status(exception.status || 404).json(exception);
      }).finally(function() {
        debugx.enabled && debugx(' - GET document operation has been done');
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
