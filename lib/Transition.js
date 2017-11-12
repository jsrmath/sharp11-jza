// Transition.js

var s11 = require('sharp11');

var Transition = function (from, to, symbol, count) {
  this.from = from;
  this.to = to;
  this.symbol = s11.mehegan.asMehegan(symbol);
  this.count = count || 0;
};

Transition.prototype.toString = function () {
  return this.from.name + ' =[' + this.symbol.toString() + ']=> ' + this.to.name;
};

Transition.prototype.getProbability = function () {
  return this.count / this.from.getTotalCount();
};

module.exports = Transition;
