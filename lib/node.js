'use strict';

var assert = require('assert');

var utils = require('./utils');

function Node(options) {
  if (!options) {
    options = {};
  }

  // serialized properties
  this.keys = options.keys || []; // the key used for sorting
  this.values = options.values || []; // the value for each key an the same index (leaf node)
  this.pointers = options.pointers || []; // the identifiers for child nodes (internal node)

  // properties not serialized
  this.parent = options.parent || null; // the parent of this node (internal node)
  this.pointer = options.pointer || null; // the identifier for this node (internal node)
}

Node.TYPES = {
  INTERNAL: new Buffer('00', 'hex'),
  LEAF: new Buffer('01', 'hex')
};

Node.prototype.hash = function() {
  return utils.sha256(this.toBuffer());
};

Node.prototype.size = function() {
  return this.keys.length;
};

Node.prototype.isLeaf = function() {
  return this.pointers.length > 0 ? false : true;
};

Node.prototype.split = function(branchingFactor) {
  assert(branchingFactor, 'branchingFactor is expected to be a number');
  var halfPosition = Math.floor(branchingFactor / 2);
  if (this.isLeaf()) {
    return {
      left: new Node({
        keys: this.keys.slice(0, halfPosition),
        values: this.values.slice(0, halfPosition)
      }),
      right: new Node({
        keys: this.keys.slice(halfPosition, this.keys.length),
        values: this.values.slice(halfPosition, this.values.length)
      }),
      middleKey: this.keys[halfPosition]
    };
  } else {
    return {
      left: new Node({
        keys: this.keys.slice(0, halfPosition),
        pointers: this.pointers.slice(0, halfPosition + 1)
      }),
      right: new Node({
        keys: this.keys.slice(halfPosition + 1, this.keys.length),
        pointers: this.pointers.slice(halfPosition + 1, this.pointers.length)
      }),
      middleKey: this.keys[halfPosition]
    };
  }
};

/**
 * @param {Buffer} key - The key to search
 */
Node.prototype.search = function(key) {
  var self = this;
  function binarySearch() {
    var max = self.keys.length - 2;
    var min = 0;
    while(min <= max) {
      var position = Math.floor((max + min) / 2);
      var valueCompare = self.keys[position].compare(key);
      if (valueCompare > 0) {
        max = position - 1;
      } else if (valueCompare < 0){
        min = position + 1;
      } else {
        return {
          found: true,
          index: position
        };
      }
    }
    return {
      found: false,
      index: min
    };
  }

  if (self.keys.length > 0) {
    var lastValue = self.keys[self.keys.length - 1];
    var lastValueCompare = lastValue.compare(key);
    if (lastValueCompare < 0) {
      return {
        found: false,
        index: self.keys.length - 1
      };
    } else if (lastValueCompare > 0) {
      return binarySearch();
    } else {
      return {
        found: true,
        index: self.keys.length - 1
      };
    }
    return binarySearch();
  } else {
    return {
      found: false,
      index: 0
    };
  }
};

Node.prototype.searchMatch = function(key) {
  var result = this.search(key);
  if (!result.found) {
    throw new Error('Key not found: ' + key.toString('hex'));
  } else {
    return result.index;
  }
};

Node.prototype.searchLowerBound = function(key) {
  var result = this.search(key);
  if (result.found) {
    throw new Error('Duplicate key exists');
  } else {
    return result.index;
  }
};

Node.prototype.locatePointer = function(key) {
  var result = this.search(key);
  if (result.found || this.keys[result.index].compare(key) < 0) {
    return this.pointers[result.index + 1];
  } else {
    return this.pointers[result.index];
  }
};

Node.prototype.unlinkPointer = function(key, pointer) {
  var leftIndex = this.searchMatch(key);
  var rightIndex = leftIndex + 1;
  if (this.pointers[leftIndex].compare(pointer) === 0) {
    this.pointers.splice(leftIndex, 1);
  } else if (this.pointers[rightIndex].compare(pointer) === 0) {
    this.pointers.splice(rightIndex, 1);
  } else {
    throw new Error('Pointer not connected to key');
  }
};

Node.prototype.relinkPointer = function(key, oldPointer, newPointer) {
  var result = this.search(key);
  var leftIndex = result.index;
  var rightIndex = leftIndex + 1;
  if (this.pointers[leftIndex].compare(oldPointer) === 0) {
    this.pointers[leftIndex] = newPointer;
  } else if (this.pointers[rightIndex].compare(oldPointer) === 0) {
    this.pointers[rightIndex] = newPointer;
  } else {
    throw new Error('Pointer not connected to key');
  }
};

Node.prototype.promoteKey = function(key, leftPointer, rightPointer) {
  var result = this.search(key);
  var pos;
  if (this.keys[result.index].compare(key) > 0) {
    pos = result.index + 1;
  } else if (this.keys[result.index].compare(key) < 0) {
    pos = result.index;
  } else {
    throw new Error('Key already exists');
  }
  this.keys.splice(pos, 0, key);
  this.pointers.slice(pos, 0, leftPointer);
  this.pointers.slice(pos + 1, 0, rightPointer);
  return pos;
};

Node.prototype.get = function(key) {
  var index = this.searchMatch(key);
  return this.values[index];
};

Node.prototype.insert = function(key, value) {
  var lowerIndex;
  try {
    lowerIndex = this.searchLowerBound(key);
  } catch(e) {
    return false;
  }
  var pos = lowerIndex;
  this.keys.splice(pos, 0, key);
  this.values.splice(pos, 0, value);
  return pos;
};

Node.fromBuffer = function(buffer, keySize, valueSize, pointerSize, parent, pointer) {
  var type = buffer.slice(0, 1);
  if (type.compare(Node.TYPES.LEAF) === 0) {
    return Node._fromBufferLeaf(buffer, keySize, valueSize, parent, pointer);
  } else if (type.compare(Node.TYPES.INTERNAL) === 0) {
    return Node._fromBufferInternal(buffer, keySize, pointerSize, parent, pointer);
  } else {
    throw new Error('Unknown node type');
  }
};

Node._fromBufferLeaf = function(buffer, keySize, valueSize, parent, pointer) {
  var result = Node._sliceBuffer(buffer, keySize, valueSize);
  return new Node({keys: result.keys, values: result.values, parent: parent, pointer: pointer});
};

Node._fromBufferInternal = function(buffer, keySize, pointerSize, parent, pointer) {
  var result = Node._sliceNodeBuffer(buffer, keySize, pointerSize);
  return new Node({keys: result.keys, pointers: result.values, parent: parent, pointer: pointer});
};

Node._sliceBuffer = function(buffer, keySize, dataSize) {
  var keys = [];
  var values = [];
  var size = keySize + dataSize;
  var pos = 1;
  while(pos < buffer.length) {
    keys.push(buffer.slice(pos, pos + keySize));
    values.push(buffer.slice(pos + keySize, pos + size));
    pos += size;
  }
  return {
    keys: keys,
    values: values
  };
};

Node.prototype.toBuffer = function() {
  var buffers = [];
  if (this.isLeaf()) {
    buffers.push(Node.TYPES.LEAF);
    for(var i = 0; i < this.keys.length; i++) {
      buffers.push(Buffer.concat([this.keys[i], this.values[i]]));
    }
  } else {
    buffers.push(Node.TYPES.INTERNAL);
    for (var j = 0; j < this.keys.length; j++) {
      buffers.push(Buffer.concat([this.keys[j], this.pointers[j]]));
    }
  }
  return Buffer.concat(buffers);
};

module.exports = Node;
