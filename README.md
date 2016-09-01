merklebplus
=========

## Description

Prototype implementation of a [B+ tree](https://en.wikipedia.org/wiki/B%2B_tree) that uses cryptographic hash of each node as the identifier. This is useful to be able to validate that two or more databases are identical by comparing the hash of each root node. A proof that a key-value exists within the tree can be provided so that it's not necessary to have an entire copy of the database, yet also verify data integrity.

## Example Usage

```js
var memdown = require('memdown');
var levelup = require('levelup');

var merklebplus = require('merklebplus');
var Tree = merklebplus.Tree;

var db = levelup({db: memdown, keyEncoding: 'binary', valueEncoding: 'binary'});

var tree = new Tree({db: db, keySize: 8, valueSize: 32, branchingFactor: 4});

var key = new Buffer('9a9a7810c119d74e', 'hex');
var value = new Buffer('7319f63e4d58f03705ba0c4e7b87655a1fcfcca53e708bb46c79b299aa6961db', 'hex');

tree.insert(key, value, function(err, rootHash) {
  if (err) {
    throw err;
  }
  tree.get(key, function(err, value) {
    if (err) {
      throw err;
    }
    console.log(value);
  });
});

console.log('rootHash', tree.root.hash());
```

## License

Code released under the [MIT license](LICENSE).

Copyright 2016, Braydon Fuller