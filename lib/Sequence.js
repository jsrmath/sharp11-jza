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
        throw new Error('Invalid sequence:\n' + transitions.join('\n'));
      }
    }
  };

  // Note: Methods do not mutate Sequences; they return new ones
  var Sequence = function (jza, transitions) {
    this.jza = jza;
    this.transitions = transitions || [];

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
    return new Sequence(seq.jza, seq.transitions.concat([nextTransition]));
  };

  Sequence.prototype.add = function (allowRepeatedChords) {
    return addSymbol(this, (allowRepeatedChords || this.length() === 0) ? [] : [this.last().symbol]);
  };

  // Keep adding transitions until an end state is reached
  Sequence.prototype.addFull = function (allowRepeatedChords) {
    var seq = this;

    do {
      seq = seq.add(allowRepeatedChords);
    } while (!seq.last().to.isEnd);

    return seq;
  };

  // Keep adding transitions until the given symbol is reached
  Sequence.prototype.addUntilSymbol = function (symbol, allowRepeatedChords) {
    var seq = this;

    do {
      seq = this.add(allowRepeatedChords);
    } while (!_.last(seq.transitions).symbol.eq(symbol, symbolCache));

    return seq;
  };

  // Keep prepending transitions until a start state is reached
  // The from state of the initial transition will be ignored
  Sequence.prototype.prependFull = function (allowRepeatedChords) {
    var lastSymbol;
    var candidateTransitions;
    var transitions;

    var symbolNotInTransition = function (symbol, t) {
      return !t.symbol.eq(symbol);
    };

    candidateTransitions = this.jza.getTransitionsByParams({symbol: this.first().symbol, to: this.first().to});
    transitions = [util.getTransitionByProbability(candidateTransitions)].concat(this.transitions.slice(1));

    do {
      candidateTransitions = this.jza.getTransitionsByToState(transitions[0].from);
      lastSymbol = transitions[0].symbol;

      if (!allowRepeatedChords) {
        candidateTransitions = _.filter(candidateTransitions, _.partial(symbolNotInTransition, lastSymbol));
      }

      // It's possible that we prepend ourselves into a 0 probability state
      // If we do that, call the recurse and hope it doesn't happen again
      // This is a bad solution and I'm not 100% confident it will always terminate
      try {
        transitions.splice(0, 0, util.getTransitionByProbability(candidateTransitions));
      } catch (e) {
        return this.prependFull(allowRepeatedChords);
      }
      
    } while (!transitions[0].to.isStart);

    return new Sequence(this.jza, transitions);
  };

  Sequence.prototype.addN = function (n, allowRepeatedChords) {
    var seq = this;
    var i;

    for (i = 0; i < n; i += 1) {
      seq = seq.add(allowRepeatedChords);
    }

    return seq;
  };

  Sequence.prototype.removeN = function (n) {
    if (this.length() > n) {
      return new Sequence(this.jza, this.transitions.slice(0, -n));
    }
  };

  Sequence.prototype.remove = _.partial(Sequence.prototype.removeN, 1);

  Sequence.prototype.changeLast = function (allowRepeatedChords) {
    var symbolsToExclude = [this.last().symbol];

    if (!allowRepeatedChords && this.length() > 1) {
      symbolsToExclude.push(this.index(this.length() - 2).symbol);
    }
    return addSymbol(this.remove(), symbolsToExclude);
  };

  Sequence.prototype.reharmonizeAtIndex = function (index, allowRepeatedChords) {
    var originalLength = this.length();
    var startIndex;
    var endIndex;
    var reharmonization;
    var firstTransition;
    var secondTransition;
    var transitions;
    var seq;

    if (index < 0 || index >= originalLength) {
      throw new Error('Index out of bounds');
    }

    // Turn a single index into the smallest range such that we start and end in an end state
    for (startIndex = index; !this.index(startIndex).from.isEnd && startIndex > 0; startIndex -= 1);
    for (endIndex = index; !this.index(endIndex).to.isEnd && endIndex < this.length() - 1; endIndex += 1);

    transitions = this.transitions.concat();
    transitions.splice(startIndex, endIndex - startIndex + 1);

    // If we've chopped off the end, just add to the sequence
    if (endIndex === originalLength - 1) {
      seq = new Sequence(this.jza, transitions).addFull(allowRepeatedChords);
    }
    // If we've chopped off the beginning, just add to the beginning of the sequence
    else if (startIndex === 0) {
      seq = new Sequence(this.jza, transitions).prependFull(allowRepeatedChords);
    }
    // Otherwise, generate a connecting transition
    else {
      reharmonization = this.jza.generateConnectingTransitions(transitions[startIndex - 1], transitions[startIndex]);
      transitions.splice.apply(transitions, [startIndex, 1].concat(reharmonization.transitions));
      seq = new Sequence(this.jza, transitions);
      if (!allowRepeatedChords) seq = seq.makeUnique();
    }

    return seq;
  };

  // Attempt to remove the transition at a given index and patch everything together
  Sequence.prototype.splice = function (index) {
    var transitions = this.transitions.concat();
    var newTransition;

    if (index === 0 || index === this.length() - 1) {
      transitions.splice(index, 1);
      return new Sequence(this.jza, transitions);
    }

    newTransition = this.jza.getTransitionByParams({
      from: this.index(index).from,
      symbol: this.index(index + 1).symbol,
      to: this.index(index + 1).to
    });

    if (newTransition) {
      transitions.splice(index, 2, newTransition);
      return new Sequence(this.jza, transitions);
    }

    // If we can't splice, return the original sequence
    return this;
  };

  Sequence.prototype.makeUnique = function () {
    var seq = this;
    var i = 0;
    var symbol;
    var oldSeq;

    while (i < seq.length()) {
      symbol = seq.index(i).symbol;

      // If there is an adjacent transition with the same symbol, try to splice
      // We must check both sides, because both sides cannot necessarily be spliced
      if (
        i > 0 && seq.index(i - 1).symbol.eq(symbol) ||
        i < seq.length() - 2 && seq.index(i + 1).symbol.eq(symbol)
      ) {
        // Attempt to splice, increase index if unsuccessful
        oldSeq = seq;
        seq = seq.splice(i);
        if (oldSeq === seq) {
          i += 1;
        }
      }
      else {
        i += 1;
      }
    }

    return seq;
  };

  return Sequence;
};