// jzaComponents.js

var _ = require('underscore');
var s11 = require('sharp11');

module.exports = function (symbolCache) {
  // Utility functions

  var getTotalCountForTransitions = function (transitions) {
    return _.reduce(transitions, function (total, t) {
      return total + t.count;
    }, 0);
  };

  var getTransitionByProbability = function (transitions) {
    var probTotal = 0;
    var rand = Math.random();
    var i;

    // To select a random transition given probabilities, pick a random number between 0 and 1
    // and keep summing probabilities of transitions in order until we exceed the number
    for (i = 0; i < transitions.length; i += 1) {
      probTotal += transitions[i].probability;
      if (probTotal >= rand) {
        return transitions[i].transition;
      }
    }

    // All transitions have probability 0
    return null;
  };

  var getTransitionsWithProbabilities = function (transitions) {
    var totalCount = getTotalCountForTransitions(transitions);

    return _.map(transitions, function (t) {
      return {
        transition: t,
        probability: t.count / totalCount
      };
    });
  };

  // Transition

  var Transition = function (from, to, symbol, count) {
    this.from = from;
    this.to = to;
    this.symbol = s11.mehegan.asMehegan(symbol);
    this.count = count || 0;
  };

  Transition.prototype.getProbability = function () {
    return this.count / this.from.getTotalCount();
  };

  // State

  var State = function (name, isStart, isEnd) {
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

  State.prototype.getTransitionsBySymbol = function (symbol) {
    return _.filter(this.transitions, function (e) {
      return e.symbol.eq(symbol, symbolCache);
    });
  };

  State.prototype.getNextStatesBySymbol = function (symbol) {
    return _.pluck(this.getTransitionsBySymbol(symbol), 'to');
  };

  State.prototype.getTotalCount = function () {
    return getTotalCountForTransitions(this.transitions);
  };

  State.prototype.getTransitionsWithProbabilities = function () {
    return getTransitionsWithProbabilities(this.transitions);
  };

  State.prototype.getTransitionByProbability = function () {
    return getTransitionByProbability(this.getTransitionsWithProbabilities());
  };

  // Generated Sequence

  var GeneratedSequence = function (transitions) {
    this.transitions = transitions;
  };

  GeneratedSequence.prototype.getSymbols = function () {
    return _.pluck(this.transitions, 'symbol');
  };

  GeneratedSequence.prototype.getChords = function (key) {
    return _.invoke(this.getSymbols(), 'toChord', key);
  };

  GeneratedSequence.prototype.getStates = function () {
    return _.pluck(this.transitions, 'to');
  };

  GeneratedSequence.prototype.getSymbolStateStrings = function () {
    return _.map(_.zip(this.getSymbols(), this.getStates()), function (arr) {
      return arr.join(': ');
    });
  };

  GeneratedSequence.prototype.getSymbolsCollapsed = function () {
    var symbols = this.getSymbols();
    var symbolsCollapsed = [_.first(symbols)];

    _.each(_.rest(symbols), function (symbol) {
      if (!_.last(symbolsCollapsed).eq(symbol, symbolCache)) {
        symbolsCollapsed.push(symbol);
      }
    });

    return symbolsCollapsed;
  };

  GeneratedSequence.prototype.getChordsCollapsed = function (key) {
    return _.invoke(this.getSymbolsCollapsed(), 'toChord', key);
  };

  GeneratedSequence.prototype.print = function () {
    console.log(this.getSymbolStateStrings().join(' | '));
    console.log(_.pluck(this.getChordsCollapsed(), 'name').toString());
    console.log();
  };

  return {
    State: State,
    Transition: Transition,
    GeneratedSequence: GeneratedSequence,
    getTotalCountForTransitions: getTotalCountForTransitions,
    getTransitionsWithProbabilities: getTransitionsWithProbabilities,
    getTransitionByProbability: getTransitionByProbability
  };
};