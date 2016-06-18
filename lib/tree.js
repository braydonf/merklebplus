'use strict';

var assert = require('assert');
var Node = require('./node');

function Tree(options) {
  assert(options.db, 'db is expected to be a database interface');
  this.db = options.db;
  this.leafSize = options.leafSize || Tree.DEFAULT_LEAF_SIZE;
  this.root = options.root || new Node();
}

Tree.DEFAULT_LEAF_SIZE = 10000;

Tree.prototype.insert = function(key, value) {
};

module.exports = Tree;

