// Sequence.js

var _ = require('underscore');
var s11 = require('sharp11');
var utilLoader = require('./util');

module.exports = function (symbolCache) {
  var util = utilLoader(symbolCache);

  var ensureSequence = function (transitions) {
    var i;

    for (i = 1; i < transitions.length; i += 1) {
      if (transitions[i].from !== transitions[i - 1].to) {
        throw new Error('Invalid sequence');
      }
    }
  };

  var Sequence = function (jza, transitions) {
    this.jza = jza;
    this.transitions = transitions || [];

    ensureSequence(this.transitions);
  };

  Sequence.prototype.ensure = function () {
    ensureSequence(this.transitions);
  };

  Sequence.prototype.first = function () {
    return _.first(this.transitions);
  };

  Sequence.prototype.last = function () {
    return _.last(this.transitions);
  };

  Sequence.prototype.index = function (n) {
    return this.transitions[n];
  };

  Sequence.prototype.length = function () {
    return this.transitions.length;
  };

  Sequence.prototype.getSymbols = function () {
    return _.pluck(this.transitions, 'symbol');
  };

  Sequence.prototype.getChords = function (key) {
    return _.invoke(this.getSymbols(), 'toChord', key);
  };

  Sequence.prototype.getStates = function () {
    return _.pluck(this.transitions, 'to');
  };

  Sequence.prototype.getSymbolStateStrings = function () {
    return _.map(_.zip(this.getSymbols(), this.getStates()), function (arr) {
      return arr.join(': ');
    });
  };

  Sequence.prototype.getSymbolsCollapsed = function () {
    var symbols = this.getSymbols();
    var symbolsCollapsed = [_.first(symbols)];

    _.each(_.rest(symbols), function (symbol) {
      if (!_.last(symbolsCollapsed).eq(symbol, symbolCache)) {
        symbolsCollapsed.push(symbol);
      }
    });

    return symbolsCollapsed;
  };

  Sequence.prototype.getChordsCollapsed = function (key) {
    return _.invoke(this.getSymbolsCollapsed(), 'toChord', key);
  };

  Sequence.prototype.print = function () {
    console.log(this.getSymbolStateStrings().join(' | '));
    console.log(_.pluck(this.getChordsCollapsed(), 'name').toString());
    console.log();
  };

  var addSymbol = function (seq, symbolsToExclude) {
    var transitions = seq.length() ? _.last(seq.transitions).to.transitions : seq.jza.getInitialTransitions();
    var filteredTransitions = _.filter(transitions, function (t) {
      return _.every(symbolsToExclude, function (sym) {
        return !t.symbol.eq(sym);
      });
    });

    var nextTransition = util.getTransitionByProbability(filteredTransitions);
    seq.transitions.push(nextTransition);
    return nextTransition;
  };

  Sequence.prototype.add = function (allowRepeatedChords) {
    return addSymbol(this, (allowRepeatedChords || this.length() === 0) ? [] : [this.last().symbol]);
  };

  // Keep adding transitions until an end state is reached
  Sequence.prototype.addFull = function (allowRepeatedChords) {
    var transitionsAdded = [];

    do {
      transitionsAdded.push(this.add(allowRepeatedChords));
    } while (!this.last().to.isEnd);

    return transitionsAdded;
  };

  // Keep adding transitions until the given symbol is reached
  Sequence.prototype.addUntilSymbol = function (symbol, allowRepeatedChords) {
    var transitionsAdded = [];

    do {
      transitionsAdded.push(this.add(allowRepeatedChords));
    } while (!_.last(this.transitions).symbol.eq(symbol, symbolCache));

    return transitionsAdded;
  };

  // Keep prepending transitions until a start state is reached
  // The from state of the initial transition will be ignored
  Sequence.prototype.prependFull = function (allowRepeatedChords) {
    var numberOfPrepends = 0;
    var lastSymbol;
    var transitions;

    var symbolNotInTransition = function (symbol, t) {
      return !t.symbol.eq(symbol);
    };

    transitions = this.jza.getTransitionsByParams({symbol: this.first().symbol, to: this.first().to});
    this.transitions.splice(0, 1, util.getTransitionByProbability(transitions));

    do {
      transitions = this.jza.getTransitionsByToState(this.first().from);
      lastSymbol = this.first().symbol;

      if (!allowRepeatedChords) {
        transitions = _.filter(transitions, _.partial(symbolNotInTransition, lastSymbol));
      }

      // It's possible that we prepend ourselves into a 0 probability state
      // If we do that, undo the prepends and reinvoke the function
      // This is a bad solution and I'm not 100% confident it will always terminate
      try {
        this.transitions.splice(0, 0, util.getTransitionByProbability(transitions));
      } catch (e) {
        this.transitions.splice(0, numberOfPrepends);
        this.prependFull(allowRepeatedChords);
      }
      
      numberOfPrepends += 1;
    } while (!this.first().to.isStart);
  };

  Sequence.prototype.remove = function () {
    if (this.length() > 1) {
      return this.transitions.pop();
    }
  };

  Sequence.prototype.addN = function (n, allowRepeatedChords) {
    _.times(n, this.add.bind(this, allowRepeatedChords));
  };

  Sequence.prototype.removeN = function (n, allowRepeatedChords) {
    _.times(n, this.remove.bind(this, allowRepeatedChords));
  };

  Sequence.prototype.changeLast = function (allowRepeatedChords) {
    var symbolsToExclude = [this.remove().symbol];

    if (!allowRepeatedChords && this.length() > 0) {
      symbolsToExclude.push(this.last().symbol);
    }
    return addSymbol(this, symbolsToExclude);
  };

  Sequence.prototype.reharmonizeAtIndex = function (index, allowRepeatedChords) {
    var originalLength = this.length();
    var startIndex;
    var endIndex;
    var reharmonization;
    var firstTransition;
    var secondTransition;

    if (index < 0 || index >= originalLength) {
      throw new Error('Index out of bounds');
    }

    // Turn a single index into the smallest range such that we start and end in an end state
    for (startIndex = index; !this.index(startIndex).from.isEnd && startIndex > 0; startIndex -= 1);
    for (endIndex = index; !this.index(endIndex).to.isEnd && endIndex < this.length() - 1; endIndex += 1);

    this.transitions.splice(startIndex, endIndex - startIndex + 1);

    // If we've chopped off the end, just add to the sequence
    if (endIndex === originalLength - 1) {
      this.addFull(allowRepeatedChords);
    }
    // If we've chopped off the beginning, just add to the beginning of the sequence
    else if (startIndex === 0) {
      this.prependFull(allowRepeatedChords);
    }
    // Otherwise, generate a connecting transition
    else {
      reharmonization = this.jza.generateConnectingTransitions(this.index(startIndex - 1), this.index(startIndex));
      this.transitions.splice.apply(this.transitions, [startIndex, 1].concat(reharmonization.transitions));
      if (!allowRepeatedChords) this.makeUnique();
    }
  };

  // Attempt to remove the transition at a given index and patch everything together
  Sequence.prototype.splice = function (index) {
    if (index === 0 || index === this.length() - 1) {
      return this.transitions.splice(index, 1);
    }

    var fromState = this.index(index).from;
    var symbol = this.index(index + 1).symbol;
    var toState = this.index(index + 1).to;
    var newTransition = this.jza.getTransitionByParams({from: fromState, symbol: symbol, to: toState});

    if (newTransition) {
      return this.transitions.splice(index, 2, newTransition);
    }
  };

  Sequence.prototype.makeUnique = function () {
    var i = 0;
    var symbol;

    while (i < this.length()) {
      symbol = this.index(i).symbol;

      // If there is an adjacent transition with the same symbol, try to splice
      // We must check both sides, because both sides cannot necessarily be spliced
      if (
        i > 0 && this.index(i - 1).symbol.eq(symbol) ||
        i < this.length() - 2 && this.index(i + 1).symbol.eq(symbol)
      ) {
        // Attempt to splice, increase index if unsuccessful
        if (!this.splice(i)) {
          i += 1;
        }
      }
      else {
        i += 1;
      }
    }
  };

  return Sequence;
};