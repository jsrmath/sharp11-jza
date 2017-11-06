var s11 = require('sharp11');
var _ = require('underscore');
var jsonfile = require('jsonfile');

// Keep a mapping of Mehegan strings to corresponding Mehegan objects so that we don't waste time creating new ones
var symbolCache = {};

var jzaBuilder = require('./lib/jzaBuilder')(symbolCache);

var JzTransition = function (from, to, symbol, count) {
  this.from = from;
  this.to = to;
  this.symbol = s11.mehegan.asMehegan(symbol);
  this.count = count || 0;
};

JzTransition.prototype.getProbability = function () {
  return this.count / this.from.getTotalCount();
};

var JzState = function (name, isStart, isEnd) {
  this.name = name;
  this.transitions = [];

  // True if state is an acceptable start state
  this.isStart = !!isStart;

  // True if state is an acceptable end state
  this.isEnd = !!isEnd;
};

JzState.prototype.toString = function () {
  return this.name;
};

JzState.prototype.addTransition = function (symbol, state, count) {
  var transition;

  // Don't add edge if equivalent one already exists
  if (!_.some(this.transitions, function (e) {
    return e.symbol.eq(symbol, symbolCache) && e.to === state;
  })) {
    transition = new JzTransition(this, state, symbol, count);
    this.transitions.push(transition);
    return transition;
  }
};

JzState.prototype.hasTransition = function (symbol, state) {
  return _.some(this.transitions, function (e) {
    return e.symbol.eq(symbol, symbolCache) && e.to === state;
  });
};

JzState.prototype.getTransitionsBySymbol = function (symbol) {
  return _.filter(this.transitions, function (e) {
    return e.symbol.eq(symbol, symbolCache);
  });
};

JzState.prototype.getNextStatesBySymbol = function (symbol) {
  return _.pluck(this.getTransitionsBySymbol(symbol), 'to');
};

var getTotalCountForTransitions = function (transitions) {
  return _.reduce(transitions, function (total, t) {
    return total + t.count;
  }, 0);
};

JzState.prototype.getTotalCount = function () {
  return getTotalCountForTransitions(this.transitions);
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

JzState.prototype.getTransitionsWithProbabilities = function () {
  return getTransitionsWithProbabilities(this.transitions);
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

JzState.prototype.getTransitionByProbability = function () {
  return getTransitionByProbability(this.getTransitionsWithProbabilities());
};

var JzA = function () {
  this.states = [];
};

JzA.prototype.addState = function (name, start, end) {
  var state = new JzState(name, start, end);
  this.states.push(state);
  return state;
};

JzA.prototype.addTransition = function (symbol, from, to, count) {
  return from.addTransition(symbol, to, count);
};

JzA.prototype.getTransitions = function () {
  return _.chain(this.states)
    .pluck('transitions')
    .flatten()
    .value();
};

JzA.prototype.getTransitionsBySymbol = function (symbol) {
  return _.filter(this.getTransitions(), function (t) {
    return t.symbol.eq(symbol, symbolCache);
  });
};

JzA.prototype.getTransitionsByQuality = function (quality) {
  return _.filter(this.getTransitions(), function (t) {
    return t.symbol.quality === quality;
  });
};

JzA.prototype.getStatesByName = function (name) {
  return _.filter(this.states, function (state) {
    return state.name === name;
  });
};

JzA.prototype.getStateByName = function (name) {
  return _.first(this.getStatesByName(name));
};

JzA.prototype.getStatesByRegex = function (regex) {
  return _.filter(this.states, function (state) {
    return state.name.match(regex);
  });
};

// Return a list of states with a given name that transition to a given state
JzA.prototype.getStatesByNameAndTransition = function (name, transition) {
  return _.filter(this.getStatesByName(name), function (s) {
    return _.contains(_.pluck(s.transitions, 'state'), transition);
  });
};

JzA.prototype.getStateByNameAndTransition = function (name, transition) {
  return _.first(this.getStatesByNameAndTransition(name, transition));
};

// Find a state with a given name that transitions to a given state, and create one if it doesn't exist
JzA.prototype.getStateWithNameAndTransition = function (name, transition, start, end) {
  return this.getStateByNameAndTransition(name, transition) || this.addState(name, start, end);
};

var getPossibleInitialStates = function (jza, symbols) {
  if (!symbols.length) return [];

  return _.chain(jza.getTransitionsBySymbol(_.first(symbols)))
    .map(function (transition) {
      return transition.to;
    })
    .filter(function (state) {
      return state.isStart;
    })
    .uniq()
    .value();
};

// Starting at the end and working backwards, if a transition's `to` doesn't match
// a transition's `from` in the next timestep, remove it
var removeDeadEnds = function (pathways) {
  var helper = function (timeStep, nextTimeStep) {
    return _.filter(timeStep, function (transition) {
      return _.some(nextTimeStep, function (nextTransition) {
        return transition.to === nextTransition.from;
      });
    });
  };
  var i;

  for (i = pathways.length - 2; i >= 0; i -= 1) {
    pathways[i] = helper(pathways[i], pathways[i + 1]);
  }

  return pathways;
};

// Return an array where each element is all possible transitions for that timestep
// The array will be of length symbols - 1
// Pathways can be reconstructed by matching `to` fields of transitions with `from` fields
// of transitions in the next array element
JzA.prototype.getPathways = function (symbols) {
  var lastStates = getPossibleInitialStates(this, symbols);
  var pathways = [];

  _.each(_.rest(symbols), function (symbol) {
    // Compute all possible transitions for next step
    var transitions = _.chain(lastStates)
      .map(function (state) {
        return state.getTransitionsBySymbol(symbol);
      })
      .flatten()
      .uniq()
      .value();

    pathways.push(transitions);
    lastStates = _.pluck(transitions, 'to');
  });

  // Remove final transitions that don't end in an end state
  pathways[pathways.length - 1] = _.filter(_.last(pathways), function (t) {
    return t.to.isEnd;
  });

  return removeDeadEnds(pathways);
};

JzA.prototype.analyze = function (symbols) {
  var pathways = this.getPathways(symbols);

  // Start with a list that has every possible start state
  var stateLists = _.chain(pathways[0])
    .pluck('from')
    .uniq()
    .map(function (s) {
      return [s];
    })
    .value();

  _.each(pathways, function (timeStep) {
    var oldStateLists = stateLists;
    stateLists = [];

    // For each transition in this timestep, add it to every possible state list
    _.each(timeStep, function (transition) {
      _.each(oldStateLists, function (pathway) {
        if (_.last(pathway) === transition.from) {
          stateLists.push(pathway.concat(transition.to));
        }
      });
    });
  });

  return stateLists;
};

// Train the automaton on a given sequence of chords
JzA.prototype.trainSequence = function (symbols) {
  var pathways = this.getPathways(symbols);

  _.each(pathways, function (timeStep) {
    _.each(timeStep, function (t) {
      // At each timestep, normalize the count by the number of possible transitions
      t.count += 1 / timeStep.length;
    });
  });
};

JzA.prototype.trainSequences = function (sequences) {
  _.each(sequences, this.trainSequence.bind(this));
};

JzA.prototype.trainCorpusBySection = function (corpus, minSectionSize, withWrapAround) {
  var sequences = _.reduce(corpus.charts, function (sections, chart) {
    return sections.concat(
      _.chain(chart['sectionMeheganLists' + (withWrapAround ? 'WithWrapAround' : '')]())
        .omit(function (section) {
          return section.length < (minSectionSize || 2);
        })
        .values()
        .value()
    );
  }, []);

  this.trainSequences(sequences);
};

JzA.prototype.trainCorpusBySectionWithWrapAround = function (corpus, minSectionSize) {
  return this.trainCorpusBySection(corpus, minSectionSize, true);
};

JzA.prototype.trainCorpusBySong = function (corpus, withWrapAround) {
  var sequences = _.map(corpus.charts, function (chart) {
    return chart['meheganList' + (withWrapAround ? 'WithWrapAround' : '')]();
  });

  this.trainSequences(sequences);
};

JzA.prototype.trainCorpusBySongWithWrapAround = function (corpus) {
  return this.trainCorpusBySong(corpus, true);
};

var getInitialTransitionByProbabiblity = function (jza, symbol) {
  var transitions = _.filter(jza.getTransitionsBySymbol(symbol), function (t) {
    return t.to.isStart;
  });

  return getTransitionByProbability(getTransitionsWithProbabilities(transitions));
};

var JzAGeneratedSequence = function (transitions) {
  this.transitions = transitions;
};

JzAGeneratedSequence.prototype.getSymbols = function () {
  return _.pluck(this.transitions, 'symbol');
};

JzAGeneratedSequence.prototype.getChords = function (key) {
  return _.invoke(this.getSymbols(), 'toChord', key);
};

JzAGeneratedSequence.prototype.getStates = function () {
  return _.pluck(this.transitions, 'to');
};

JzAGeneratedSequence.prototype.getSymbolStateStrings = function () {
  return _.map(_.zip(this.getSymbols(), this.getStates()), function (arr) {
    return arr.join(': ');
  });
};

JzAGeneratedSequence.prototype.getSymbolsCollapsed = function () {
  var symbols = this.getSymbols();
  var symbolsCollapsed = [_.first(symbols)];

  _.each(_.rest(symbols), function (symbol) {
    if (!_.last(symbolsCollapsed).eq(symbol, symbolCache)) {
      symbolsCollapsed.push(symbol);
    }
  });

  return symbolsCollapsed;
};

JzAGeneratedSequence.prototype.getChordsCollapsed = function (key) {
  return _.invoke(this.getSymbolsCollapsed(), 'toChord', key);
};

JzA.prototype.generateSequenceFromStartAndLength = function (firstSymbol, length) {
  var transition = getInitialTransitionByProbabiblity(this, firstSymbol);
  var transitions = [transition];
  var i;

  if (!transition) return null; // Can't generate sequence starting with particular symbol

  for (i = 0; i < length || !transition.to.isEnd; i += 1) {
    transition = transition.to.getTransitionByProbability();
    transitions.push(transition);
  }

  return new JzAGeneratedSequence(transitions);
};

JzA.prototype.generateSequenceFromStartAndEnd = function (firstSymbol, lastSymbol) {
  var transition = getInitialTransitionByProbabiblity(this, firstSymbol);
  var transitions = [transition];

  if (!transition) return null; // Can't generate sequence starting with particular symbol

  do {
    transition = transition.to.getTransitionByProbability();
    transitions.push(transition);
  } while (!(transition.symbol.eq(lastSymbol, symbolCache) && transition.to.isEnd));

  return new JzAGeneratedSequence(transitions);
};

// Given a list of symbols, return information about the symbol that caused the analysis to fail, or null if it passes
JzA.prototype.findFailurePoint = function (symbols) {
  var currentStates = getPossibleInitialStates(this, symbols) || [];
  var lastCurrentStates;
  var i;

  symbols = s11.mehegan.asMeheganArray(symbols);

  var getReturnValue = function (index, previousStates, invalidEndState) {
    return {
      symbol: symbols[index],
      symbols: symbols,
      index: index,
      previousStates: previousStates,
      invalidEndState: invalidEndState
    };
  };

  if (!currentStates.length) {
    return getReturnValue(0, [], false);
  }

  for (i = 1; i < symbols.length; i += 1) {
    lastCurrentStates = currentStates;
    currentStates = _.chain(currentStates)
      .invoke('getNextStatesBySymbol', symbols[i])
      .flatten()
      .uniq()
      .value();

    if (!currentStates.length) {
      return getReturnValue(i, lastCurrentStates, false);
    }
  }

  if (!_.some(currentStates, function (s) {
    return s.isEnd;
  })) {
    return getReturnValue(symbols.length - 1, currentStates, true);
  }

  return null;
};

JzA.prototype.validate = function (symbols) {
  return this.findFailurePoint(symbols) === null;
};

// Given a map of key -> count and totalCount, return a map of key -> prob from highest to lowest
var getProbabilitiesAndSort = function (obj, totalCount) {
  return _.chain(obj)
    .map(function (count, key) {
      return [key, count / totalCount];
    })
    .sortBy(function (arr) {
      return -arr[1];
    })
    .object()
    .value();
};

// Given transitions and a function that takes a transition and produces a key
// return a map of key -> probability sorted from highest to lowest
var makeProbabilitiyObject = function (transitions, keyFunction) {
  var obj = {};
  var totalCount = getTotalCountForTransitions(transitions);

  // Sum up counts based on keyFunction, lazily so that we don't have any 0 probability keys
  _.each(transitions, function (t) {
    var key = keyFunction(t, obj);

    if (t.count) {
      obj[key] = obj[key] ? obj[key] + t.count : t.count;
    }
  });

  return _.chain(obj)
    .map(function (count, key) {
      // Convert counts to probabilities by dividing by total count
      return [key, count / totalCount];
    })
    .sortBy(function (arr) {
      return -arr[1];
    })
    // Although object keys are technically unordered, javascript will print based on the order they were added
    .object()
    .value();
};

JzA.prototype.getStateProbabilitiesGivenSymbol = function (symbol) {
  return makeProbabilitiyObject(this.getTransitionsBySymbol(symbol), function (t) {
    return t.to.name;
  });
};

var getSymbolKey = function (transition, symbols) {
  return _.find(_.keys(symbols), function (symbol) {
    return transition.symbol.eq(symbol, symbolCache);
  }) || transition.symbol.toString();
};

JzA.prototype.getSymbolProbabilitiesGivenStateRegex = function (regex) {
  var states = this.getStatesByRegex(regex);
  var transitions = _.filter(this.getTransitions(), function (t) {
    return _.contains(states, t.to);
  });

  return makeProbabilitiyObject(transitions, getSymbolKey);
};

JzA.prototype.getTransitionProbabilitiesGivenStateRegex = function (regex, keyType) {
  var states = this.getStatesByRegex(regex);
  var transitions = _.filter(this.getTransitions(), function (t) {
    return _.contains(states, t.from);
  });

  // Default to (symbol, state) pair, but pretty-printed
  var keyFunction = function (t) {
    return t.symbol.toString() + ': ' + t.to.name;
  };

  if (keyType === 'symbol') {
    keyFunction = getSymbolKey;
  }
  if (keyType === 'state') {
    keyFunction = function (t) {
      return t.to.name;
    };
  }

  return makeProbabilitiyObject(transitions, keyFunction);
};

module.exports.jza = function (type) {
  var jza = new JzA();

  if (type !== 'empty') {
    jzaBuilder.constructDefaultJzA(jza);
  }

  return jza;
};

JzA.prototype.serialize = function () {
  var jza = this;

  var states = _.map(jza.states, function (s) {
    return _.pick(s, 'name', 'isStart', 'isEnd');
  });

  // Keep track of transitions, but store states as indices instead of objects
  var transitions = _.map(jza.getTransitions(), function (t) {
    return {
      from: _.indexOf(jza.states, t.from),
      to: _.indexOf(jza.states, t.to),
      symbol: _.pick(t.symbol, 'numeral', 'quality'),
      count: t.count
    };
  });

  return {states: states, transitions: transitions};
};

var load = module.exports.load = function (json) {
  var jza = new JzA();

  jza.states = _.map(json.states, function (s) {
    return new JzState(s.name, s.isStart, s.isEnd);
  });

  _.each(json.transitions, function (t) {
    var symbol = new s11.mehegan.Mehegan(t.symbol.numeral, t.symbol.quality);
    var from = jza.states[t.from];
    var to = jza.states[t.to];
    var count = t.count;

    jza.addTransition(symbol, from, to, count);
  });

  return jza;
};

module.exports.export = function (jza, filename) {
  jsonfile.writeFileSync(filename, jza.serialize());
};

module.exports.import = function (filename) {
  return load(jsonfile.readFileSync(filename));
};
