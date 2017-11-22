'use strict';

var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var loader = Devebot.require('loader');
var lodash = Devebot.require('lodash');
var debugx = Devebot.require('debug')('appBrowserlet:chores');
var fs = require('fs');
var path = require('path');
var util = require('util');

var chores = {};

chores.mappingsLoader = function(mappingsDir, mappings) {
  mappings = mappings || {};
  var dirs;
  try {
    dirs = fs.readdirSync(mappingsDir);
  } catch (err) {
    dirs = [];
  }
  for (var i in dirs) {
    var dirPath = mappingsDir + '/' + dirs[i];
    var descriptorPath = dirPath + '/descriptor.js';
    if (fs.statSync(dirPath).isDirectory() && fs.statSync(descriptorPath).isFile()) {
      mappings[dirs[i]] = {};
      lodash.merge(mappings[dirs[i]], loader(descriptorPath));
    }
  }
  return mappings;
}

module.exports = chores;
