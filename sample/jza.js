var jzaTools = require('../index');
var s11 = require('sharp11');
var irb = require('sharp11-irb');
var fs = require('fs');
var path = require('path');
var _ = require('underscore');

var iRbCorpus = s11.corpus.load(irb);
var jza;

//// Below are examples of how to interact with the automaton and the corpus
//// Uncomment lines beginning with // to try them out

//// Create a new automaton
// jza = jzaTools.jza();

//// and train it
// jza.trainCorpusBySectionWithWrapAround(iRbCorpus);

//// or load a saved model
// jza = jzaTools.import('sample/model.json');

//// Get probabilities of a particular symbol being used to transition to different states
//// (in other words, get probabilities of a particular symbol having different chord functions)
// console.log(jza.getStateProbabilitiesGivenSymbol('VIx'));

//// Get transition probabilities from particular states given a state name regex
// console.log(jza.getTransitionProbabilitiesGivenStateRegex(/^Subdominant b6/));

//// Find songs in the corpus that contain a given sequence
// console.log(iRbCorpus.findSongTitlesWithSequence(['bIIIM', 'bVIx', 'V']));

//// Get probability of a particular ngram appearing in the corpus
//// This example returns P(bVIX,V | bIIIM)
// console.log(iRbCorpus.getNGramProbability(['bIIIM', 'bVIx', 'V']));

//// Find the most commonly generated sequences (out of n=500) given a start and end symbol
// console.log(jza.mostCommonGeneratedSequences('I', 'I', 500).join('\n'));

//// Generate a four-chord sequence from ii to iii
// jza.generateNLengthSequenceWithStartAndEnd(4, 'ii', 'iii').print();

//// Generate a 5-chord sequence and reharmonize the third chord
// seq = jza.buildSequence();
// seq.addN(5);
// seq.print();
// seq.reharmonizeAtIndex(2);
// seq.print();
