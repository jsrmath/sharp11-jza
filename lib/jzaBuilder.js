// jzaBuilder.js

var _ = require('underscore');
var s11 = require('sharp11');

module.exports = function (symbolCache) {
  var tonicChords = {
    '1': ['IM', 'Im', 'Ix', 'Iø'],
    'b3': ['bIIIM', 'bIIIm', 'bIIIx', 'bIIIø'],
    '3': ['IIIM', 'IIIm', 'IIIx', 'IIIø'],
    '6': ['VIM', 'VIm', 'VIx', 'VIø'],
  };

  var subdominantChords = {
    '2': ['IIM', 'IIm', 'IIx', 'IIø'],
    '4': ['IVM', 'IVm', 'IVx', 'IVø'],
    'b6': ['bVIM', 'bVIm', 'bVIx', 'bVIø'],
    '6': ['VIM', 'VIm', 'VIx', 'VIø'],
  };

  var dominantChords = {
    '3': ['IIIm', 'IIIx'],
    '5': ['Vx'],
    'b7': ['bVIIx'],
  };

  // Given a list of qualities, return a list of all symbols with those qualities
  var allChordsWithQualities = function (qualities) {
    var allNumerals = ['I', 'bII', 'II', 'bIII', 'III', 'IV', 'bV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
    return _.flatten(_.map(allNumerals, function (numeral) {
      return _.map(qualities, function (quality) {
        return s11.mehegan.fromString(numeral + quality);
      });
    }));
  };

  var operations = {};

  operations.addPrimitiveChords = function (jza) {
    var makeFunctionalBassObject = function (func, chords, bass) {
      return {
        state: jza.addState([func, bass].join(' '), true, true),
        chords: chords
      };
    };

    var connectFunctionalStates = function (fromObjs, toObjs) {
      _.each(fromObjs, function (from) {
        _.each(toObjs, function (to) {
          _.each(to.chords, function (chord) {
            from.state.addTransition(s11.mehegan.fromString(chord), to.state);
          });
        });
      });
    };

    var tonicStates = _.map(tonicChords, _.partial(makeFunctionalBassObject, 'Tonic'));
    var subdominantStates = _.map(subdominantChords, _.partial(makeFunctionalBassObject, 'Subdominant'));
    var dominantStates = _.map(dominantChords, _.partial(makeFunctionalBassObject, 'Dominant'));

    connectFunctionalStates(tonicStates, tonicStates);
    connectFunctionalStates(tonicStates, subdominantStates);
    connectFunctionalStates(subdominantStates, subdominantStates);
    connectFunctionalStates(subdominantStates, dominantStates);
    connectFunctionalStates(dominantStates, dominantStates);
    connectFunctionalStates(dominantStates, tonicStates);
  };

  // Allow chords to be tonicized with ii-V
  operations.addTonicization = function (jza) {
    // Exclude I because we don't consider it tonicization when I is already the tonic
    var majorSevenths = _.filter(jza.getTransitionsByQuality('M'), function (t) {
      return !t.symbol.eq('I', symbolCache);
    });

    var minorSevenths = _.filter(jza.getTransitionsByQuality('m'), function (t) {
      return !t.symbol.eq('Im', symbolCache);
    });

    var halfDiminishedSevenths = _.filter(jza.getTransitionsByQuality('ø'), function (t) {
      return !t.symbol.eq('Iø', symbolCache);
    });

    _.each(majorSevenths.concat(minorSevenths).concat(halfDiminishedSevenths), function (t) {
      var vState = jza.getStateWithNameAndTransition('V / ' + t.symbol, t.to, false, false);
      var iiState = jza.getStateWithNameAndTransition('ii / ' + t.symbol, vState, true, false);
      t.from.addTransition(t.symbol.transpose('M2').withQuality('m'), iiState);
      t.from.addTransition(t.symbol.transpose('M2').withQuality('ø'), iiState);
      t.from.addTransition(t.symbol.transpose('M2').withQuality('x'), iiState);
      iiState.addTransition(t.symbol.transpose('P5').withQuality('x'), vState);
      vState.addTransition(t.symbol, t.to);
    });
  };

  // Allow chords to be set up with V
  operations.addAppliedChords = function (jza) {
    var chords = jza.getTransitionsByQuality('M').concat(jza.getTransitionsByQuality('m'));

    _.each(chords, function (t) {
      var vState = jza.getStateWithNameAndTransition('V / ' + t.symbol, t.to, true, false);
      t.from.addTransition(t.symbol.transpose('P5').withQuality('x'), vState);
      vState.addTransition(t.symbol, t.to);
    });
  };

  // Allow chords to be set up with VIIx
  operations.addChromaticApproachingChords = function (jza) {
    var chords = jza.getTransitionsByQuality('M').concat(jza.getTransitionsByQuality('m'));

    _.each(chords, function (t) {
      var viiState = jza.getStateWithNameAndTransition('Chromatic approaching ' + t.symbol, t.to, true, false);
      t.from.addTransition(t.symbol.transpose('M7').withQuality('x'), viiState);
      viiState.addTransition(t.symbol, t.to);
    });
  };

  operations.addTritoneSubstitutions = function (jza) {
    // For each dominant seventh transition, add another transition with its tritone sub
    _.each(jza.getTransitionsByQuality('x'), function (t) {
      // We don't need to tritone sub certain states, because certain tritone subs already exist
      // as chords in the proper function, e.g. Tonic b3 and Tonic 6
      if (_.contains([
        'Tonic b3', 'Tonic 6',
        'Subdominant 2', 'Subdominant b6',
        'Dominant 3', 'Dominant b7'
      ], t.to.name)) return;

      jza.addTransition(t.symbol.transpose('dim5'), t.from, t.to);
    });
  };

  operations.addDiminishedChords = function (jza) {
    // For each chord acting as V (in a classical sense), we can also use viio
    _.each(jza.getTransitionsByQuality('x'), function (t) {
      jza.addTransition(t.symbol.transpose('M3').withQuality('o'), t.from, t.to);
    });

    // Minor chords can be approached by a diminished chord a half step above
    _.each(jza.getTransitionsByQuality('m'), function (t) {
      var diminishedState = jza.getStateWithNameAndTransition('Diminished approaching ' + t.symbol, t.to, true, false);
      t.from.addTransition(t.symbol.transpose('m2').withQuality('o'), diminishedState);
      diminishedState.addTransition(t.symbol, t.to);
    });
  };

  operations.addUnpackedChords = function (jza) {
    // Exclude chords that are acting as V of something
    var dominantSevenths = _.reject(jza.getTransitionsByQuality('x'), function (t) {
      return t.to.name.match(/^V \/ /);
    });

    // Exclude chords that have been set up with elaborating ii-V-i
    var minorSevenths = _.reject(jza.getTransitionsByQuality('m'), function (t) {
      return t.from.name === 'V / ' + t.symbol;
    });

    // For each dominant seventh transition, add an intermediate state for the ii to its V
    _.each(dominantSevenths, function (t) {
      // Attempt to find a pre-existing unpacked state that transitions to the same next state
      var unpackedState = jza.getStateWithNameAndTransition('Unpacked ' + t.symbol, t.to, true, false);
      t.from.addTransition(t.symbol.transposeDown('P4').withQuality('m'), unpackedState);
      unpackedState.addTransition(t.symbol, t.to);
    });

    // For each minor seventh transition, add an intermediate state for the V to its ii
    _.each(minorSevenths, function (t) {
      // Attempt to find a pre-existing unpacked state that transitions to the same next state
      var unpackedState = jza.getStateWithNameAndTransition('Unpacked ' + t.symbol, t.to, true, false);
      t.from.addTransition(t.symbol, unpackedState);
      unpackedState.addTransition(t.symbol.transpose('P4').withQuality('x'), t.to);
    });
  };

  operations.addSusChords = function (jza) {
    var dominantSevenths = jza.getTransitionsByQuality('x');

    // Any dominant seventh can be replaced with the corresponding sus chord
    _.each(dominantSevenths, function (t) {
      jza.addTransition(t.symbol.withQuality('s'), t.from, t.to);
    });
  };

  operations.addNeighborChords = function (jza) {
    var neighborCandidates = allChordsWithQualities(['M', 'm', 'x']);
    var neighborChords = allChordsWithQualities(['M', 'm', 'x', 'ø', 'o', 's']);

    _.each(neighborCandidates, function (neighborCandidate) {
      _.each(jza.getTransitionsBySymbol(neighborCandidate), function (t) {
        // Only apply to functional chords
        if (!t.to.name.match(/^(Tonic|Subdominant|Dominant)/)) return;

        var preNeighborState = jza.addState(t.symbol + ' with neighbor', true, false);
        var neighborState = jza.addState('Neighbor of ' + t.symbol, false, false);
        t.from.addTransition(t.symbol, preNeighborState);
        neighborState.addTransition(t.symbol, t.to);
        _.each(neighborChords, function (neighborChord) {
          preNeighborState.addTransition(neighborChord, neighborState);
        });
      });
    });
  };

  operations.addPassingChords = function (jza) {
    // Only add diatonic passing sequences
    var passingSequences = [
      ['I', 'ii', 'iii', 'Tonic'],
      ['ii', 'iii', 'IV', 'Subdominant'],
      ['iii', 'IV', 'V', 'Dominant'],
      ['IV', 'V', 'vi', 'Subdominant'],
      ['V', 'vi', 'vii', 'Dominant'],
      ['vi', 'vii', 'I', 'Tonic']
    ];

    // Add reversed sequences
    passingSequences = passingSequences.concat(_.map(passingSequences, function (seq) {
      return seq.slice(0, 3).reverse().concat(seq[3]);
    }));

    _.each(passingSequences, function (passingSequence) {
      var symbols = passingSequence.slice(0, 3);
      var chordFunction = passingSequence[3];

      _.each(jza.getTransitionsBySymbol(symbols[2]), function (t) {
        // Can only pass between chords of the same function
        if (!t.to.name.match(chordFunction)) return;

        var prePassingState = jza.addState(chordFunction + ' with passing chord', true, false);
        var passingState = jza.addState('Passing chord', false, false);

        t.from.addTransition(symbols[0], prePassingState);
        prePassingState.addTransition(symbols[1], passingState);
        passingState.addTransition(symbols[2], t.to);
      });
    });
  };

  var applyOperations = function (jza, ops) {
    _.each(ops, function (op) {
      operations[op](jza);
    });
  };

  var constructDefaultJzA = function (jza) {
    applyOperations(jza, [
      'addPrimitiveChords',
      'addTonicization',
      'addAppliedChords',
      'addDiminishedChords',
      'addTritoneSubstitutions',
      'addUnpackedChords',
      'addSusChords',
      'addChromaticApproachingChords',
      'addNeighborChords',
      'addPassingChords'
    ]);
  };

  return {
    tonicChords: tonicChords,
    subdominantChords: subdominantChords,
    dominantChords: dominantChords,
    operations: operations,
    applyOperations: applyOperations,
    constructDefaultJzA: constructDefaultJzA
  };
};
