'use strict';

var Devebot = require('devebot');
var lodash = Devebot.require('lodash');
var debugx =  Devebot.require('debug')('appBrowserlet:trigger');

var Service = function(params) {
  debugx.enabled && debugx(' + constructor begin ...');

  params = params || {};

  var self = this;
  var LX = params.loggingFactory.getLogger();
  var LT = params.loggingFactory.getTracer();
  var pluginCfg = lodash.get(params, ['sandboxConfig'], {});

  self.start = function() {
    return Promise.resolve();
  };

  self.stop = function() {
    return Promise.resolve();
  };

  debugx.enabled && debugx(' - constructor end!');
};

module.exports = Service;
