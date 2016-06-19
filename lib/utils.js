'use strict';

var assert = require('assert');
var crypto = require('crypto');

var utils = {};

/**
 * Will hash a buffer using sha256
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
utils.sha256 = function(buffer) {
  var hash = crypto.createHash('sha256');
  hash.update(buffer);
  return hash.digest();
};

/**
 * Asynchronously map over an array
 * @param {Array} array
 * @param {Function} iterator
 * @param {Function} callback
 */
utils.asyncMap = function(array, iterator, callback) {
  var results = new Array(array.length);
  var pending = array.length;
  var error = null;

  if (!pending) {
    return setImmediate(callback);
  }

  function getNext(index) {
    return function next(err, result) {
      assert(pending > 0, 'callback called multiple times');
      if (err) {
        error = err;
      }
      results[index] = result;
      pending -= 1;
      if (!pending) {
        callback(error, results);
      }
    };
  }

  array.forEach(function(item, i) {
    iterator(item, getNext(i));
  });

};

module.exports = utils;
