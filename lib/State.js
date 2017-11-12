// State.js

var _ = require('underscore');
var s11 = require('sharp11');
var Transition = require('./Transition');
var utilLoader = require('./util');

module.exports = function (symbolCache) {
  var util = utilLoader(symbolCache);

  var State =  function (name, isStart, isEnd) {
    this.name = name;
    this.transitions = [];

    // True if state is an acceptable start state
    this.isStart = !!isStart;

    // True if state is an acceptable end state
    this.isEnd = !!isEnd;
  };

  State.prototype.toString = function () {
    return this.name;
  };

  State.prototype.addTransition = function (symbol, state, count) {
    var transition;

    // Don't add edge if equivalent one already exists
    if (!_.some(this.transitions, function (e) {
      return e.symbol.eq(symbol, symbolCache) && e.to === state;
    })) {
      transition = new Transition(this, state, symbol, count);
      this.transitions.push(transition);
      return transition;
    }
  };

  State.prototype.hasTransition = function (symbol, state) {
    return _.some(this.transitions, function (e) {
      return e.symbol.eq(symbol, symbolCache) && e.to === state;
    });
  };

  State.prototype.getTransitionsByParams = function (params) {
    return util.getTransitionsByParams(this.transitions, params);
  };

  State.prototype.getTransitionByParams = function (params) {
    return _.first(this.getTransitionsByParams(params));
  };

  State.prototype.getTransitionsBySymbol = function (symbol) {
    return _.filter(this.transitions, function (e) {
      return e.symbol.eq(symbol, symbolCache);
    });
  };

  State.prototype.getNextStates = function () {
    return _.pluck(this.getTransitions(), 'to');
  };

  State.prototype.getNextStatesBySymbol = function (symbol) {
    return _.pluck(this.getTransitionsBySymbol(symbol), 'to');
  };

  State.prototype.getTotalCount = function () {
    return util.getTotalCountForTransitions(this.transitions);
  };

  State.prototype.getTransitionsWithProbabilities = function () {
    return util.getTransitionsWithProbabilities(this.transitions);
  };

  State.prototype.getTransitionByProbability = function () {
    return util.getTransitionByProbability(this.getTransitionsWithProbabilities());
  };

  return State;
};