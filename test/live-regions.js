'use strict';

const assert = require('node:assert/strict');
const { parseDeckList, resolveCard } = require('../limitless-to-trainers.user.js');

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

function decodeJsString(value) {
  return value
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r');
}

function parseCatalog(view) {
  const cards = [];
  const seen = new Set();
  const pattern = /cardList\.push\(\{\s*imgFileSrc:\s*'((?:\\.|[^'])*)',\s*cardId:\s*'(\d+)',\s*cardName:\s*'((?:\\.|[^'])*)',\s*legendaryFlg:\s*'([^']*)'/g;
  let match;

  while ((match = pattern.exec(view)) !== null) {
    if (seen.has(match[2])) continue;
    seen.add(match[2]);
    cards.push({
      id: match[2],
      name: decodeJsString(match[3]),
      image: decodeJsString(match[1]),
      legendary: match[4]
    });
  }

  return cards;
}

async function postForm(url, fields, referer) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/javascript, */*; q=0.01',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      referer,
      'user-agent': 'asia-pokemon-card-deck-builder-assistant/1.0 (+GitHub Actions)',
      'x-requested-with': 'XMLHttpRequest'
    },
    body: new URLSearchParams(fields)
  });

  const text = await response.text();
  assert.equal(response.ok, true, `${url} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function fetchCatalog(locale, productCode) {
  const base = `https://asia.pokemon-card.com/${locale}/deck-build/`;
  const payload = await postForm(`${base}search_card/`, {
    freeword: '',
    cardType: 'all',
    formProduct: productCode,
    formProductIds: '',
    formDeckList: ''
  }, base);
  const catalog = parseCatalog(payload.view || '');
  assert.ok(catalog.length, `${locale}: no cards returned for ${productCode}`);
  return catalog;
}

async function testLocale(locale) {
  const parsed = parseDeckList(SAMPLE_DECK);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.cards.reduce((sum, card) => sum + card.count, 0), 60);

  const productCodes = [...new Set(parsed.cards.map((card) => card.productCode))];
  const catalogs = new Map();
  for (const productCode of productCodes) {
    catalogs.set(productCode, await fetchCatalog(locale, productCode));
  }

  const warnings = [];
  const resolved = parsed.cards.map((entry) => {
    const result = resolveCard(entry, catalogs.get(entry.productCode));
    warnings.push(...result.warnings);
    return { ...entry, ...result.card };
  });

  const deckData = resolved.map((card) => ({
    cardId: card.id,
    cardName: card.name,
    count: String(card.count)
  }));
  assert.equal(deckData.reduce((sum, card) => sum + Number(card.count), 0), 60);

  const base = `https://asia.pokemon-card.com/${locale}/deck-build/`;
  const check = await postForm(`${base}check/`, {
    formDeckList: JSON.stringify(deckData),
    deckData: JSON.stringify(deckData)
  }, base);

  const errors = check.errors || check.Errors || [];
  assert.deepEqual(errors, [], `${locale}: format checker returned ${JSON.stringify(errors)}`);
  assert.equal(check.Standard ?? check.standard, true, `${locale}: deck was not accepted as Standard`);

  console.log(`${locale}: PASS — 60 cards, ${deckData.length} printings, ${productCodes.length} catalogs, ${warnings.length} warnings, Standard=true`);
}

async function main() {
  const locales = process.argv.slice(2);
  assert.ok(locales.length, 'Pass one or more locale codes, for example: my ph');
  for (const locale of locales) await testLocale(locale);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
