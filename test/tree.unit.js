'use strict';

var crypto = require('crypto');

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var levelup = require('levelup');
var memdown = require('memdown');
var async = require('async');

var bplus = require('..');
var Tree = bplus.Tree;
var Node = bplus.Node;
var utils = bplus.utils;

describe('B+ Tree', function() {
  var db;
  before(function() {
    db = levelup({db: memdown, keyEncoding: 'binary', valueEncoding: 'binary'});
  });
  describe('@constructor', function() {
    it('will instatiate with db', function() {
      var tree = new Tree({db: db});
      should.exist(tree);
      tree.db.should.equal(db);
      tree.branchingFactor.should.equal(1000);
      tree.keySize.should.equal(8);
      tree.valueSize.should.equal(32);
    });
    it('set the branchingFactor, keySize, valueSize', function() {
      var tree = new Tree({db: db, keySize: 4, valueSize: 64, branchingFactor: 1000000});
      tree.branchingFactor.should.equal(1000000);
      tree.keySize.should.equal(4);
      tree.valueSize.should.equal(64);
    });
  });
  describe('#_maxLeafSize', function() {
    it('will return branchingFactor minus one', function() {
      var tree = new Tree({db: db, branchingFactor: 10});
      tree._maxLeafSize().should.equal(9);
    });
  });
  describe('#_searchLeaf', function() {
    it('will return node if is leaf', function(done) {
      var node = {
        isLeaf: sinon.stub().returns(true)
      };
      var tree = new Tree({db: db});
      var key = new Buffer('993470cf488dedc0', 'hex');
      tree._searchLeaf(key, node, function(err, leaf) {
        if (err) {
          return done(err);
        }
        leaf.should.equal(node);
        done();
      });
    });
    it('will return leaf node from internal node pointer', function(done) {
      var tree = new Tree({db: db, keySize: 8, valueSize: 32});
      var key = new Buffer('993470cf488dedc0', 'hex');
      var value = new Buffer('e44ab75e9ec5d041fec9b9060c9c27fb82a4419058c481f96b7e75bcdafd495c', 'hex');
      var leafNode = new Node({keys: [key], values: [value]});
      var leafNodeBuffer = leafNode.toBuffer();
      var pointer = utils.sha256(leafNodeBuffer);
      var internalNode = {
        isLeaf: sinon.stub().returns(false),
        locatePointer: sinon.stub().returns(pointer)
      };
      db.put(pointer, leafNodeBuffer, function(err) {
        if (err) {
          return done(err);
        }
        tree._searchLeaf(key, internalNode, function(err, leaf) {
          if (err) {
            return done(err);
          }
          leaf.keys[0].should.deep.equal(key);
          leaf.values[0].should.deep.equal(value);
          done();
        });
      });
    });
  });
  describe('#insert', function() {
    beforeEach(function() {
      db = levelup({db: memdown, keyEncoding: 'binary', valueEncoding: 'binary'});
    });
    var pairs = [
      {
        key: new Buffer('9a9a7810c119d74e', 'hex'),
        value: new Buffer('7319f63e4d58f03705ba0c4e7b87655a1fcfcca53e708bb46c79b299aa6961db', 'hex')
      },
      {
        key: new Buffer('883ec10ed332d8b8', 'hex'),
        value: new Buffer('267e6af817bf04ac0b6e521bafcaf5bc1b5fcfdd85bda65b8349043f0dcb5ba6', 'hex')
      },
      {
        key: new Buffer('0b1fc13bb61a0cd2', 'hex'),
        value: new Buffer('601bd6d7a2bc9e0fb51c9c4a61336fd7d073acfba920eaa3da2c6a98621b4151', 'hex')
      },
      {
        key: new Buffer('59968412e744755f', 'hex'),
        value: new Buffer('1135a6c043f2e3945d0476bf43e9f1ce471169683c7fe3247607b5e6c6b4407c', 'hex')
      },
      {
        key: new Buffer('5370a7a5b3d51459', 'hex'),
        value: new Buffer('30efdbcf636ab3c2ab0a723ccfd5eb30e90b390295cc96f8b14f974a9fc51e3e', 'hex')
      }
    ];
    it('will insert key/value pairs until branching factor', function(done) {
      var tree = new Tree({db: db, keySize: 8, valueSize: 32, branchingFactor: 5});
      async.map(pairs, function(pair, next) {
        tree.insert(pair.key, pair.value, next);
      }, function(err) {
        if (err) {
          return done(err);
        }
        done();
      });
    });
    it('will split root leaf node and create a new internal node as root', function(done) {
      var tree = new Tree({db: db, keySize: 8, valueSize: 32, branchingFactor: 4});
      async.mapSeries(pairs, function(pair, next) {
        tree.insert(pair.key, pair.value, function(err, pointer) {
          next(err, pointer);
        });
      }, function(err, results) {
        if (err) {
          return done(err);
        }
        var rootHash = tree.root.hash();
        results[4].should.deep.equal(rootHash);
        async.mapSeries(pairs, function(pair, next) {
          tree.get(pair.key, function(err, value) {
            if (err) {
              return done(err);
            }
            value.should.deep.equal(pair.value);
            next();
          });
        }, done);
      });
    });
    it('insert 32 random items', function(done) {
      var total = 32;
      var testPairs = [];
      for (var i = 0; i < total; i++) {
        testPairs.push({
          key: crypto.randomBytes(8),
          value: crypto.randomBytes(32)
        });
      }
      var tree = new Tree({db: db, keySize: 8, valueSize: 32, branchingFactor: 4});
      async.map(testPairs, function(pair, next) {
        tree.insert(pair.key, pair.value, next);
      }, function(err, results) {
        if (err) {
          return done(err);
        }
        var rootHash = utils.sha256(tree.root.toBuffer());
        results[31].should.deep.equal(rootHash);
        done();
      });
    });
  });
});
