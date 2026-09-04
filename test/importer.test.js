'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const importer = require('../limitless-to-trainers.user.js');

const SAMPLE_DECK = `Pokémon: 15
3 Mega Darkrai ex PBL 48
2 Fezandipiti ex ASC 142
2 Pecharunt ex SFA 39
2 Mega Kangaskhan ex MEG 104
2 Meowth ex POR 62
2 Latias ex SSP 76
1 Volcanion ex JTG 31
1 Moltres PFL 14

Trainer: 34
3 Janine's Secret Art PRE 112
3 Team Rocket's Petrel ASC 207
3 Boss's Orders ASC 183
3 Lillie's Determination ASC 192
2 Ciphermaniac's Codebreaking PRE 104
3 Energy Switch MEG 115
2 Ultra Ball ASC 213
2 Dark Bell PBL 75
2 Night Stretcher ASC 196
2 Team Rocket's Transceiver ASC 209
2 Special Red Card CRI 82
2 Crushing Hammer POR 71
1 Precious Trolley SSP 185
2 Risky Ruins MEG 127
2 Battle Cage PFL 85

Energy: 11
9 Darkness Energy MEE 7
2 Prism Energy ASC 216`;

test('parses the complete 60-card Limitless example', () => {
  const result = importer.parseDeckList(SAMPLE_DECK);

  assert.deepEqual(result.errors, []);
  assert.equal(result.cards.length, 25);
  assert.equal(result.cards.reduce((sum, card) => sum + card.count, 0), 60);
  assert.deepEqual(
    result.cards.find((card) => card.name === 'Mega Darkrai ex'),
    {
      count: 3,
      name: 'Mega Darkrai ex',
      setCode: 'PBL',
      productCode: 'ME05',
      collector: '48',
      line: 2
    }
  );
});

test('reports malformed and unsupported entries with their line numbers', () => {
  const result = importer.parseDeckList('Pokémon: 2\nnot a card\n2 Pikachu XYZ 25');

  assert.equal(result.cards.length, 0);
  assert.match(result.errors[0], /Line 2: cannot parse/);
  assert.match(result.errors[1], /Line 3: set code XYZ is not available/);
});

test('uses product codes exposed by a localized regional builder', () => {
  const oldDocument = global.document;
  const oldLocation = global.location;
  global.location = { pathname: '/id/deck-build/' };
  global.document = {
    querySelectorAll: () => [{ value: 'SV4s' }, { value: 'S12a' }]
  };

  try {
    assert.equal(importer.resolveProductCode('sv4s'), 'SV4s');
    assert.equal(importer.resolveProductCode('S12A'), 'S12a');
    assert.equal(importer.resolveProductCode('ASC'), null);
  } finally {
    global.document = oldDocument;
    global.location = oldLocation;
  }
});

test('supports only the international-English regional builders', () => {
  for (const locale of ['sg', 'my', 'ph', 'hk-en']) {
    assert.equal(importer.isSupportedLocale(locale), true, `${locale} should be supported`);
  }
  for (const locale of ['th', 'id', 'tw', 'hk']) {
    assert.equal(importer.isSupportedLocale(locale), false, `${locale} should be blocked`);
    assert.match(importer.unsupportedRegionMessage(locale), /localized card catalog/);
  }
});

test('resolves a numbered card and checks its name', () => {
  const catalog = [
    { id: '10', name: 'First Card' },
    { id: '11', name: 'Second Card' }
  ];
  const result = importer.resolveCard({
    name: 'Second Card', collector: '2', productCode: 'SV01', setCode: 'SVI', line: 1
  }, catalog);

  assert.equal(result.card.id, '11');
  assert.deepEqual(result.warnings, []);
});

test('matches basic Energy by type instead of catalog position', () => {
  const catalog = [
    { id: '20', name: 'Basic Metal Energy' },
    { id: '21', name: 'Basic Darkness Energy' }
  ];
  const result = importer.resolveCard({
    name: 'Darkness Energy', collector: '7', productCode: 'Basic Energy ME', setCode: 'MEE', line: 1
  }, catalog);

  assert.equal(result.card.id, '21');
  assert.deepEqual(result.warnings, []);
});
