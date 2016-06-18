'use strict';

var chai = require('chai');
var should = chai.should();

var levelup = require('levelup');
var memdown = require('memdown');

var Tree = require('..').Tree;

describe('Tree', function() {
  var db;
  before(function() {
    db = levelup({db: memdown});
  });
  describe('@constructor', function() {
    it('will instatiate', function() {
      var tree = new Tree({db: db});
      should.exist(tree);
    });
  });
});
