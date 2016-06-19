'use strict';

var assert = require('assert');

var Node = require('./node');
var utils = require('./utils');

/**
 * A B+ merkle tree for storing large number of fixed size key/value pairs to a database.
 * @param {Object} options
 * @param {Object} options.db - A key/value database to store nodes, must support `put` and `get` methods
 * @param {Number} options.branchingFactor - The number of key/value pairs until a leaf is split
 * @param {Number} options.keySize - The number of bytes of the keys
 * @param {Number} options.valueSize - The number of bytes of the values
 * @param {Node} options.root - The root node
 */
function Tree(options) {
  assert(options.db, 'db is expected to be a database interface');
  this.db = options.db;
  this.branchingFactor = options.branchingFactor || Tree.DEFAULT_BRANCHING_FACTOR;
  this.keySize = options.keySize || Tree.DEFAULT_KEY_SIZE;
  this.valueSize = options.valueSize || Tree.DEFAULT_VALUE_SIZE;
  this.root = options.root || new Node();
}

Tree.DEFAULT_BRANCHING_FACTOR = 1000;
Tree.DEFAULT_KEY_SIZE = 8;
Tree.DEFAULT_VALUE_SIZE = 32;
Tree.POINTER_SIZE = 32;

Tree.prototype._maxLeafSize = function() {
  return this.branchingFactor - 1;
};

Tree.prototype._searchLeaf = function(key, node, callback) {
  var self = this;
  if (node.isLeaf()) {
    return callback(null, node);
  }
  var pointer = node.locatePointer(key);
  this.db.get(pointer, function(err, buffer) {
    if (err) {
      return callback(err);
    }
    var nextNode = Node.fromBuffer(buffer, self.keySize, self.valueSize, Tree.POINTER_SIZE, node, pointer);
    self._searchLeaf(key, nextNode, callback);
  });
};

Tree.prototype._putNode = function(node, callback) {
  var value = node.toBuffer();
  var key = utils.sha256(value);
  this.db.put(key, value, function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, {
      node: node,
      pointer: key,
      value: value
    });
  });
};

Tree.prototype._putNodes = function(nodes, callback) {
  var self = this;
  utils.asyncMap(nodes, function(node, next) {
    self._putNode(node, next);
  }, callback);
};

Tree.prototype._propagateSplitToParent = function(prevNode, newLeft, newRight, middleKey, callback) {

  // The parent node we need to update
  var parent = prevNode.parent;

  // Remove old pointer to leaf from parent
  parent.unlinkPointer(prevNode.keys[0], prevNode.pointer);

  // Insert the new leaf's smallest key and new pointers
  parent.promoteKey(middleKey, newLeft.pointer, newRight.pointer);

  // If the parent is full, split it too
  if (parent.size() > this._maxLeafSize()) {
    this._splitNode(parent, callback);
  } else {
    this._putNode(parent, callback);
  }

};

Tree.prototype._splitNode = function(node, callback) {
  var self = this;

  // Split the node into two new nodes
  var split = node.split(this.branchingFactor);

  // Save the nodes and get back the saved pointers
  this._putNodes([split.left, split.right], function(err, results) {
    if (err) {
      return callback(err);
    }

    var left = results[0];
    var right = results[1];

    if (node.parent) {
      // Update the parent node with the new pointers
      self._propagateSplitToParent(node, left, right, split.middleKey, callback);
    } else {
      // We're splitting the root node so we need to create a new root node
      var rootNode = new Node({keys: [split.middleKey], pointers: [left.pointer, right.pointer]});
      self._putNode(rootNode, function(err, result) {
        if (err) {
          return callback(err);
        }
        self.root = result.node;
        callback(null, result);
      });
    }
  });
};

Tree.prototype._relinkNodeParentPointer = function(node, pointer, callback) {
  var self = this;
  if (node.parent) {
    node.parent.relinkPointer(node.keys[0], node.pointer, pointer);
    this._putNode(node.parent, function(err, result) {
      if (err) {
        return callback(err);
      }
      self._relinkNodeParentPointer(result.node, result.pointer, callback);
    });
  } else {
    this.root = node;
    return callback(null, pointer);
  }
};

Tree.prototype._nodeInsert = function(node, key, value, callback) {
  var self = this;

  this._searchLeaf(key, node, function(err, leaf) {
    if (err) {
      return callback(err);
    }

    // If the bucket is not full (at most b - 1 entries after the insertion), add the record.
    if (leaf.size() <= self._maxLeafSize()) {
      leaf.insert(key, value);
      self._putNode(leaf, function(err, result) {
        if (err) {
          return callback(err);
        }
        self._relinkNodeParentPointer(leaf, result.pointer, callback);
      });
    } else {
      self._splitNode(leaf, function(err, result) {
        if (err) {
          return callback(err);
        }
        self._nodeInsert(result.node, key, value, callback);
      });
    }
  });

};

Tree.prototype.insert = function(key, value, callback) {
  assert(Buffer.isBuffer(key) && key.length === this.keySize, 'key is expected to be a buffer with size ' + this.keySize);
  assert(Buffer.isBuffer(value) && value.length === this.valueSize, 'value is expected to be a buffer with size ' + this.valueSize);
  this._nodeInsert(this.root, key, value, callback);
};

module.exports = Tree;
