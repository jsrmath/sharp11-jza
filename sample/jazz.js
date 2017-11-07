var jzaTools = require('../index');
var s11 = require('sharp11');
var irb = require('sharp11-irb');
var fs = require('fs');
var path = require('path');
var _ = require('underscore');

var iRbCorpus = s11.corpus.load(irb);

var analyzeFailurePoints = function (failurePoints, failurePointSymbols, secondaryGroupingIndex) {
  failurePoints = _.chain(failurePoints)
    .groupBy(function (p) {
      return _.map(failurePointSymbols, function (offset) {
        return p.symbols[p.index + offset];
      }).join(' ');
    })
    .pairs()
    .map(function (pair) {
      var secondaryGroupings = null;

      if (typeof(secondaryGroupingIndex) === 'number') {
        secondaryGroupings = _.chain(pair[1])
          .groupBy(function (point) {
            return point.symbols[point.index + secondaryGroupingIndex] + '';
          })
          .mapObject(function (val) {
            return val.length;
          })
          .value();
      }

      return [pair[0], pair[1].length, _.pluck(pair[1], 'name'), secondaryGroupings];
    })
    .sortBy(function (p) {
      return -p[1];
    })
    .value()
    .slice(0, 10);
  console.log(failurePoints);
};

var runTests = function (failurePointSymbols, secondaryGroupingIndex, minSectionSize) {
  var totalPassedSongs = 0;
  var totalPassedSections = 0;
  var totalSongs = 0;
  var totalSections = 0;
  var failurePoints = [];

  var songs = _.map(iRbCorpus.charts, function (j) {
    // Symbols for the entire song
    var song = j.meheganListWithWrapAround();

    // Object mapping section name to list of symbols for particular section
    var sections = _.omit(j.sectionMeheganListsWithWrapAround(), function (meheganList) {
      return meheganList.length < (minSectionSize || 2);
    });

    totalSongs += 1;
    totalSections += _.keys(sections).length;

    return {
      name: j.info.title,
      song: song,
      sections: sections
    };
  });

  _.each(songs, function (song) {
    var passedSong = jza.validate(song.song);
    
    // For each section that fails, compute its failure points
    var sectionFailurePoints = _.compact(_.map(song.sections, function (symbols, sectionName) {
      var failurePoint = jza.findFailurePoint(symbols);

      if (failurePoint) {
        failurePoint.name = song.name + ' ' + sectionName;
      }

      return failurePoint;
    }));

    var numSections = _.keys(song.sections).length;
    var passedSections = numSections - sectionFailurePoints.length;

    if (passedSong) totalPassedSongs += 1;
    totalPassedSections += passedSections;

    failurePoints = failurePoints.concat(sectionFailurePoints);

    console.log(song.name + (passedSong ? ' √ ' : ' X ') + passedSections + ' / ' + numSections);
  });

  console.log('Sections: ' + totalPassedSections / totalSections);
  console.log('Songs: ' + totalPassedSongs / totalSongs);

  if (failurePointSymbols) analyzeFailurePoints(failurePoints, failurePointSymbols, secondaryGroupingIndex);
};

//// Below are examples of how to interact with the automaton and the corpus
//// Uncomment lines beginning with // to try them out

//// Create a new automaton
// jza = jzaTools.jza();

//// and train it
// jza.trainCorpusBySectionWithWrapAround(iRbCorpus);

//// or load a saved model
// jza = jzaTools.import('sample/model.json');

//// Run validation tests (how many songs / sections can be understood by the model)
// runTests();

//// Get probabilities of a particular symbol being used to transition to different states
//// (in other words, get probabilities of a particular symbol having different chord functions)
// console.log(jza.getStateProbabilitiesGivenSymbol('VIx'));

//// Get transition probabilities from particular states given a state name regex
// console.log(jza.getTransitionProbabilitiesGivenStateRegex(/^Subdominant b6/));

//// Generate sequences that start and end with particular symbols
// _.times(20, function () {
//   jza.generateSequenceFromStartAndEnd('I', 'I').print();
// });

//// Find songs in the corpus that contain a given sequence
// console.log(iRbCorpus.findSongTitlesWithSequence(['bIIIM', 'bVIx', 'V']));

//// Get probability of a particular ngram appearing in the corpus
//// This example returns P(bVIX,V | bIIIM)
// console.log(iRbCorpus.getNGramProbability(['bIIIM', 'bVIx', 'V']));

//// Find the most commonly generated sequences (out of n=500) given a start and end symbol
// console.log(jza.mostCommonGeneratedSequences('I', 'I', 500).join('\n'));
