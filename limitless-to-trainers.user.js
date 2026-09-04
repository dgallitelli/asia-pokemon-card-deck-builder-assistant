// ==UserScript==
// @name         Pokémon TCG Asia Deck Builder Assistant
// @namespace    https://github.com/dgallitelli
// @version      1.1.0
// @description  Import English Limitless/PTCGL text deck lists into supported Pokémon TCG Asia deck builders.
// @author       Davide Gallitelli
// @license      MIT
// @homepageURL  https://github.com/dgallitelli/asia-pokemon-card-deck-builder-assistant
// @supportURL   https://github.com/dgallitelli/asia-pokemon-card-deck-builder-assistant/issues
// @downloadURL  https://raw.githubusercontent.com/dgallitelli/asia-pokemon-card-deck-builder-assistant/main/limitless-to-trainers.user.js
// @updateURL    https://raw.githubusercontent.com/dgallitelli/asia-pokemon-card-deck-builder-assistant/main/limitless-to-trainers.user.js
// @match        https://asia.pokemon-card.com/*/deck-build/
// @match        https://asia.pokemon-card.com/*/deck-build/?*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const testMode = typeof module !== 'undefined' && Boolean(module.exports);
  if (!testMode && !document.getElementById('deckCreatePage')) return;

  /*
   * Limitless set code -> Trainers Website product code.
   * The right-hand values are the product codes used by the English Asia sites.
   */
  const SET_CODES = Object.freeze({
    SSH: 'SWSH01', RCL: 'SWSH02', DAA: 'SWSH03', CPA: 'SWSH3.5',
    VIV: 'SWSH04', SHF: 'SWSH4.5', BST: 'SWSH05', CRE: 'SWSH06',
    EVS: 'SWSH07', FST: 'SWSH08', BRS: 'SWSH09', ASR: 'SWSH10',
    LOR: 'SWSH11', SIT: 'SWSH12', CRZ: 'SWSH12.5', CEL: '25th',
    PGO: 'PGO', SWSH: 'SW-P',

    SVI: 'SV01', PAL: 'SV02', OBF: 'SV03', MEW: 'SV3.5',
    PAR: 'SV04', PAF: 'SV4.5', TEF: 'SV05', TWM: 'SV06',
    SFA: 'SV6.5', SCR: 'SV07', SSP: 'SV08', PRE: 'SV8.5',
    JTG: 'SV09', DRI: 'SV10', BLK: 'ZSV10.5', WHT: 'RSV10.5',
    SVP: 'SVP',

    MEG: 'ME01', PFL: 'ME02', ASC: 'ME2.5', POR: 'ME03',
    CRI: 'ME04', PBL: 'ME05', MEP: 'MEP',

    SVE: 'Basic Energy SV', MEE: 'Basic Energy ME'
  });

  const INTERNATIONAL_ENGLISH_LOCALES = new Set(['sg', 'my', 'ph', 'hk-en']);
  const BASIC_ENERGY_SET_CODES = new Set(['SVE', 'MEE']);
  const REGION_NAMES = Object.freeze({
    sg: 'Singapore', my: 'Malaysia', ph: 'Philippines', 'hk-en': 'Hong Kong (English)',
    hk: 'Hong Kong', tw: 'Taiwan', th: 'Thailand', id: 'Indonesia'
  });

  const catalogCache = new Map();
  const importedIds = new Set();
  let lastEditGuardAt = 0;

  const css = `
    #ltt-launcher {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      max-width: 1180px; margin: 12px auto; padding: 12px 16px;
      background: #fff; border: 2px solid #3154a5; border-radius: 10px;
      box-sizing: border-box; color: #222; font-family: inherit;
    }
    #ltt-launcher strong { color: #1f3c88; }
    #ltt-launcher .ltt-spacer { flex: 1; }
    #ltt-launcher button, #ltt-modal button {
      border: 0; border-radius: 7px; padding: 9px 14px; cursor: pointer;
      font: 700 14px/1.2 inherit; background: #3154a5; color: #fff;
    }
    #ltt-launcher button.ltt-secondary, #ltt-modal button.ltt-secondary {
      background: #e9edf7; color: #24355f;
    }
    #ltt-overlay {
      display: none; position: fixed; inset: 0; z-index: 100000;
      background: rgba(11, 20, 39, .72); padding: 24px; overflow: auto;
      box-sizing: border-box;
    }
    #ltt-modal {
      width: min(760px, 100%); margin: 3vh auto; padding: 22px;
      border-radius: 12px; background: #fff; color: #20242c;
      box-shadow: 0 18px 60px rgba(0, 0, 0, .35); box-sizing: border-box;
      font-family: inherit;
    }
    #ltt-modal h2 { margin: 0 0 8px; font-size: 24px; }
    #ltt-modal p { margin: 7px 0 14px; line-height: 1.45; }
    #ltt-input {
      width: 100%; min-height: 330px; resize: vertical; box-sizing: border-box;
      padding: 12px; border: 1px solid #aab2c2; border-radius: 7px;
      font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    #ltt-actions { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 12px; }
    #ltt-actions button:disabled { opacity: .55; cursor: wait; }
    #ltt-status {
      display: none; margin-top: 14px; padding: 11px 13px; border-radius: 7px;
      white-space: pre-wrap; font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      max-height: 230px; overflow: auto;
    }
    #ltt-status.info { display: block; background: #eef4ff; color: #183766; }
    #ltt-status.ok { display: block; background: #eaf7ee; color: #185b2c; }
    #ltt-status.error { display: block; background: #fff0f0; color: #8b1e1e; }
    .ltt-imported-card { cursor: pointer; }
    .ltt-imported-card:hover { outline: 3px solid #3154a5; outline-offset: -3px; }
    @media (max-width: 768px) {
      #ltt-overlay { padding: 8px; }
      #ltt-modal { margin: 1vh auto; padding: 16px; }
      #ltt-input { min-height: 280px; }
    }
  `;

  function getLocale() {
    if (typeof location === 'undefined') return 'sg';
    return location.pathname.split('/')[1] || 'sg';
  }

  function isSupportedLocale(locale = getLocale()) {
    return INTERNATIONAL_ENGLISH_LOCALES.has(locale);
  }

  function unsupportedRegionMessage(locale = getLocale()) {
    const region = REGION_NAMES[locale] || locale.toUpperCase();
    return `${region} uses a localized card catalog that cannot reliably resolve English Limitless set codes. ` +
      'The importer is disabled on this page; the official deck builder remains available.';
  }

  function getNativeProductCodes() {
    if (typeof document === 'undefined') return new Map();
    return new Map(
      [...document.querySelectorAll('.checkProduct')]
        .map((input) => String(input.value || '').trim())
        .filter(Boolean)
        .map((code) => [code.toUpperCase(), code])
    );
  }

  function resolveProductCode(setCode) {
    const locale = getLocale();
    const nativeCodes = getNativeProductCodes();
    const direct = nativeCodes.get(setCode.toUpperCase());
    if (direct) return direct;

    const mapped = SET_CODES[setCode.toUpperCase()];
    if (!mapped) return null;
    const mappedNative = nativeCodes.get(mapped.toUpperCase());
    if (mappedNative) return mappedNative;

    // SG, MY, PH and HK-EN share the international English product catalog.
    // Keeping this fallback also makes the importer work while product filters
    // are not present in the DOM yet.
    return INTERNATIONAL_ENGLISH_LOCALES.has(locale) ? mapped : null;
  }

  function regionMessage() {
    const locale = getLocale();
    const region = REGION_NAMES[locale] || locale.toUpperCase();
    if (INTERNATIONAL_ENGLISH_LOCALES.has(locale)) {
      return `Detected region: ${region}. International Limitless set codes are supported.`;
    }
    return `Detected region: ${region}. Use product codes from this region's official catalog; English set codes may not map to localized releases.`;
  }

  function modalHtml() {
    return `
    <div id="ltt-overlay" role="dialog" aria-modal="true" aria-labelledby="ltt-title">
      <div id="ltt-modal">
        <h2 id="ltt-title">Import from Limitless</h2>
        <p>Paste the list copied with <strong>Share → Copy as Text</strong>. Cards are matched by set and collector number against the official regional catalog.</p>
        <p><strong>${regionMessage()}</strong></p>
        <textarea id="ltt-input" spellcheck="false" placeholder="Pokémon: 16&#10;3 Eevee ex PRE 75&#10;2 Dunsparce JTG 120&#10;&#10;Trainer: 15&#10;3 Crispin SCR 133&#10;..."></textarea>
        <div id="ltt-actions">
          <button type="button" id="ltt-import">Resolve and import</button>
          <button type="button" id="ltt-close" class="ltt-secondary">Close</button>
        </div>
        <div id="ltt-status" aria-live="polite"></div>
      </div>
    </div>
  `;
  }

  function unsupportedModalHtml() {
    return `
    <div id="ltt-overlay" role="dialog" aria-modal="true" aria-labelledby="ltt-title" style="display: block;">
      <div id="ltt-modal">
        <h2 id="ltt-title">Limitless importer unavailable</h2>
        <p><strong>${unsupportedRegionMessage()}</strong></p>
        <p>English Limitless/PTCGL lists are currently supported on the Singapore, Malaysia, Philippines, and Hong Kong English websites.</p>
        <p><a href="https://github.com/dgallitelli/asia-pokemon-card-deck-builder-assistant/issues" target="_blank" rel="noopener noreferrer">View compatibility details on GitHub</a></p>
        <div id="ltt-actions">
          <button type="button" id="ltt-close" class="ltt-secondary">Continue to deck builder</button>
        </div>
      </div>
    </div>
  `;
  }

  function installUnsupportedNotice() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', unsupportedModalHtml());
    document.body.style.overflow = 'hidden';

    document.getElementById('ltt-close').addEventListener('click', closeModal);
    document.getElementById('ltt-overlay').addEventListener('click', (event) => {
      if (event.target.id === 'ltt-overlay') closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isModalOpen()) closeModal();
    });
  }

  function installUi() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const launcher = document.createElement('div');
    launcher.id = 'ltt-launcher';
    launcher.innerHTML = `
      <strong>Limitless importer</strong>
      <span>Paste a complete deck list instead of adding cards one by one.</span>
      <span class="ltt-spacer"></span>
      <button type="button" id="ltt-open">Import deck</button>
      <button type="button" id="ltt-clear" class="ltt-secondary">Clear imported deck</button>
    `;

    const main = document.querySelector('main.content') || document.querySelector('main');
    main.prepend(launcher);
    document.body.insertAdjacentHTML('beforeend', modalHtml());

    document.getElementById('ltt-open').addEventListener('click', openModal);
    document.getElementById('ltt-close').addEventListener('click', closeModal);
    document.getElementById('ltt-clear').addEventListener('click', clearImportedDeck);
    document.getElementById('ltt-import').addEventListener('click', importDeck);
    document.getElementById('ltt-overlay').addEventListener('click', (event) => {
      if (event.target.id === 'ltt-overlay') closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isModalOpen()) closeModal();
    });

    // The official page deliberately disables Enter in the search field.
    // A capture listener runs before that handler and restores normal behavior.
    const searchInput = document.getElementById('freeword');
    searchInput?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      document.getElementById('searchCardButton')?.click();
    }, true);

    // The official editor keeps private counters that cannot be updated by an
    // external userscript. Prevent mixing native additions into an imported
    // deck; quantities remain editable by clicking the imported cards.
    const resultContainer = document.getElementById('searchResultZoneCardContainer');
    ['click', 'dragstart', 'touchstart'].forEach((eventName) => {
      resultContainer?.addEventListener(eventName, guardNativeEdit, true);
    });
    document.getElementById('decklistZone')?.addEventListener('drop', guardNativeEdit, true);
  }

  function guardNativeEdit(event) {
    if (!importedIds.size) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const now = Date.now();
    if (now - lastEditGuardAt < 1000) return;
    lastEditGuardAt = now;
    window.alert('To add or replace cards, edit the pasted list and import it again. You can change quantities by clicking cards in the imported deck.');
  }

  function isModalOpen() {
    return document.getElementById('ltt-overlay').style.display === 'block';
  }

  function openModal() {
    document.getElementById('ltt-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    document.getElementById('ltt-input').focus();
  }

  function closeModal() {
    document.getElementById('ltt-overlay').style.display = 'none';
    document.body.style.overflow = '';
  }

  function setStatus(kind, message) {
    const status = document.getElementById('ltt-status');
    status.className = kind;
    status.textContent = message;
  }

  function setBusy(busy) {
    const button = document.getElementById('ltt-import');
    button.disabled = busy;
    button.textContent = busy ? 'Resolving…' : 'Resolve and import';
  }

  function normalizeName(value) {
    return value
      .normalize('NFKD')
      .replace(/[‘’´`]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('en');
  }

  function normalizeBasicEnergyName(value) {
    return normalizeName(value)
      .replace(/^basic\s+/, '')
      .replace(/\s+energy$/, '')
      .trim();
  }

  function parseDeckList(raw) {
    const cards = [];
    const errors = [];
    const ignoredPatterns = [
      /^(pok[eé]mon|trainer|energy|total cards?)\s*:/i,
      /^(pok[eé]mon|trainer|energy)\s*\(\d+\)\s*$/i,
      /^deck\s*$/i
    ];

    raw.split(/\r?\n/).forEach((originalLine, index) => {
      const line = originalLine.trim();
      if (!line || ignoredPatterns.some((pattern) => pattern.test(line))) return;

      const match = line.match(/^(\d+)\s+(.+?)\s+([A-Za-z0-9.\-]+)\s+([A-Za-z]*\d+[A-Za-z]*)$/);
      if (!match) {
        errors.push(`Line ${index + 1}: cannot parse “${line}”`);
        return;
      }

      const count = Number(match[1]);
      const name = match[2].trim();
      const setCode = match[3].toUpperCase();
      const collector = match[4].toUpperCase();
      const productCode = resolveProductCode(setCode);

      if (!Number.isInteger(count) || count < 1 || count > 60) {
        errors.push(`Line ${index + 1}: invalid quantity ${match[1]}`);
      } else if (!productCode) {
        errors.push(`Line ${index + 1}: set code ${setCode} is not available for the ${getLocale()} catalog`);
      } else {
        cards.push({ count, name, setCode, productCode, collector, line: index + 1 });
      }
    });

    if (!cards.length && !errors.length) errors.push('No cards found. Paste a Limitless or PTCGL text list.');
    return { cards, errors };
  }

  function decodeJsString(value) {
    return value
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r');
  }

  function parseCatalogHtml(view) {
    const cards = [];
    const seen = new Set();
    const dom = new DOMParser().parseFromString(view, 'text/html');

    dom.querySelectorAll('.card[data-card-id]').forEach((element) => {
      const id = element.dataset.cardId;
      if (seen.has(id)) return;
      seen.add(id);
      cards.push({
        id,
        name: element.dataset.cardName,
        image: element.querySelector('img')?.dataset.original || element.querySelector('img')?.src || '',
        legendary: element.dataset.legendaryFlg || '0'
      });
    });

    const scriptPattern = /cardList\.push\(\{\s*imgFileSrc:\s*'((?:\\.|[^'])*)',\s*cardId:\s*'(\d+)',\s*cardName:\s*'((?:\\.|[^'])*)',\s*legendaryFlg:\s*'([^']*)'/g;
    let match;
    while ((match = scriptPattern.exec(view)) !== null) {
      const id = match[2];
      if (seen.has(id)) continue;
      seen.add(id);
      cards.push({
        id,
        name: decodeJsString(match[3]),
        image: decodeJsString(match[1]),
        legendary: match[4]
      });
    }

    return cards;
  }

  async function fetchCatalog(productCode) {
    if (catalogCache.has(productCode)) return catalogCache.get(productCode);

    const body = new URLSearchParams({
      freeword: '',
      cardType: 'all',
      formProduct: productCode,
      formProductIds: '',
      formDeckList: ''
    });

    const locale = getLocale();
    const response = await fetch(`/${locale}/deck-build/search_card/`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body
    });

    if (!response.ok) throw new Error(`Catalog request failed (${response.status}) for ${productCode}`);
    const payload = await response.json();
    const catalog = parseCatalogHtml(payload.view || '');
    if (!catalog.length) throw new Error(`No cards returned for ${productCode}`);
    catalogCache.set(productCode, catalog);
    return catalog;
  }

  function collectorNumber(value) {
    const match = String(value).match(/(\d+)/);
    return match ? Number(match[1]) : NaN;
  }

  function resolveCard(entry, catalog) {
    const number = collectorNumber(entry.collector);
    const exactNameMatches = catalog.filter((card) => normalizeName(card.name) === normalizeName(entry.name));
    const warnings = [];

    // Limitless and the Asia site number their basic-energy products differently.
    // Match the energy type instead (e.g. "Darkness"), never the array position.
    if (BASIC_ENERGY_SET_CODES.has(entry.setCode) || entry.productCode.startsWith('Basic Energy')) {
      const energyType = normalizeBasicEnergyName(entry.name);
      const energyMatches = catalog.filter(
        (card) => normalizeBasicEnergyName(card.name) === energyType
      );
      if (energyMatches.length === 1) return { card: energyMatches[0], warnings };
      throw new Error(`Line ${entry.line}: could not uniquely match basic ${energyType} Energy`);
    }

    // Numbered expansions on the SG site are returned in collector-number order.
    const byNumber = Number.isInteger(number) && number > 0 ? catalog[number - 1] : null;
    if (byNumber) {
      if (normalizeName(byNumber.name) === normalizeName(entry.name)) return { card: byNumber, warnings };

      // Promo products can have gaps. When the collector-position candidate
      // disagrees but the name has one unique match, the name is safer.
      if (exactNameMatches.length === 1) {
        warnings.push(
          `Line ${entry.line}: ${entry.setCode} numbering differs on the official site; ` +
          `matched “${entry.name}” uniquely by name.`
        );
        return { card: exactNameMatches[0], warnings };
      }

      warnings.push(
        `Line ${entry.line}: ${entry.setCode} ${entry.collector} is “${byNumber.name}” on the official site, ` +
        `while the pasted list says “${entry.name}”. Selected the official set/number.`
      );
      return { card: byNumber, warnings };
    }

    // Promos and some energy products can contain gaps in their printed numbers.
    if (exactNameMatches.length === 1) {
      warnings.push(`Line ${entry.line}: matched “${entry.name}” by name because collector number ${entry.collector} was unavailable.`);
      return { card: exactNameMatches[0], warnings };
    }
    if (exactNameMatches.length > 1) {
      throw new Error(
        `Line ${entry.line}: “${entry.name}” has ${exactNameMatches.length} possible matches in ${entry.setCode}; ` +
        `the collector number ${entry.collector} could not disambiguate them.`
      );
    }
    throw new Error(`Line ${entry.line}: could not find ${entry.count}× ${entry.name} ${entry.setCode} ${entry.collector}`);
  }

  async function resolveDeck(entries) {
    const productCodes = [...new Set(entries.map((entry) => entry.productCode))];
    setStatus('info', `Loading ${productCodes.length} official expansion catalog${productCodes.length === 1 ? '' : 's'}…`);

    const catalogs = new Map();
    const results = await Promise.allSettled(
      productCodes.map(async (code) => [code, await fetchCatalog(code)])
    );
    const loadErrors = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') catalogs.set(...result.value);
      else loadErrors.push(`${productCodes[index]}: ${result.reason?.message || result.reason}`);
    });
    if (loadErrors.length) throw new Error(loadErrors.join('\n'));

    const warnings = [];
    const resolved = entries.map((entry) => {
      const result = resolveCard(entry, catalogs.get(entry.productCode));
      warnings.push(...result.warnings);
      return { ...entry, ...result.card };
    });

    // Merge duplicate lines that point to the same official card printing.
    const merged = new Map();
    resolved.forEach((entry) => {
      if (merged.has(entry.id)) merged.get(entry.id).count += entry.count;
      else merged.set(entry.id, { ...entry });
    });

    return { cards: [...merged.values()], warnings };
  }

  function getCurrentDeckCount() {
    return [...document.querySelectorAll('#decklistZoneCardContainer > .card .cardCount')]
      .reduce((sum, element) => sum + (Number(element.textContent) || 0), 0);
  }

  function renderDeck(cards) {
    const container = document.getElementById('decklistZoneCardContainer');
    container.replaceChildren();
    container.classList.toggle('empty', cards.length === 0);
    importedIds.clear();

    cards.forEach((card) => {
      const element = document.createElement('div');
      element.className = 'card deckCard ltt-imported-card';
      element.id = card.id;
      element.dataset.cardId = card.id;
      element.dataset.cardName = card.name;
      element.dataset.legendaryFlg = card.legendary || '0';
      element.title = `${card.count}× ${card.name} — click to change quantity`;

      const link = document.createElement('a');
      link.href = 'javascript:void(0);';
      const image = document.createElement('img');
      image.className = 'cardImage';
      image.src = card.image;
      image.alt = card.name;
      link.appendChild(image);

      const count = document.createElement('div');
      count.className = 'cardCount';
      count.textContent = String(card.count);
      element.append(link, count);
      element.addEventListener('click', () => editImportedCard(element));
      container.appendChild(element);
      importedIds.add(card.id);
    });

    syncDeckFields();
  }

  function editImportedCard(element) {
    const oldCount = Number(element.querySelector('.cardCount').textContent);
    const answer = window.prompt(
      `Quantity for ${element.dataset.cardName} (0 removes it):`,
      String(oldCount)
    );
    if (answer === null) return;
    const count = Number(answer);
    if (!Number.isInteger(count) || count < 0 || count > 60) {
      window.alert('Enter a whole number from 0 to 60.');
      return;
    }
    if (count === 0) {
      importedIds.delete(element.dataset.cardId);
      element.remove();
    } else {
      element.querySelector('.cardCount').textContent = String(count);
      element.title = `${count}× ${element.dataset.cardName} — click to change quantity`;
    }
    syncDeckFields();
  }

  function currentDeckData() {
    return [...document.querySelectorAll('#decklistZoneCardContainer > .card')].map((card) => ({
      cardId: card.dataset.cardId,
      cardName: card.dataset.cardName,
      count: card.querySelector('.cardCount')?.textContent || '0'
    }));
  }

  function syncDeckFields() {
    const data = currentDeckData();
    const total = data.reduce((sum, card) => sum + Number(card.count), 0);
    const container = document.getElementById('decklistZoneCardContainer');
    container.classList.toggle('empty', data.length === 0);
    document.getElementById('deckCount').textContent = String(total).padStart(2, '0');
    document.getElementById('formDeckList').value = JSON.stringify(data);
    document.getElementById('deckData').value = JSON.stringify(data);
  }

  function clearImportedDeck() {
    if (!importedIds.size) return;
    if (!window.confirm('Remove all cards imported by the Limitless importer?')) return;
    renderDeck([]);
  }

  async function importDeck() {
    const parsed = parseDeckList(document.getElementById('ltt-input').value);
    if (parsed.errors.length) {
      setStatus('error', parsed.errors.join('\n'));
      return;
    }

    const total = parsed.cards.reduce((sum, card) => sum + card.count, 0);
    if (total > 60) {
      setStatus('error', `The pasted list contains ${total} cards; the deck limit is 60.`);
      return;
    }

    const currentCount = getCurrentDeckCount();
    if (currentCount && !window.confirm(`Replace the current ${currentCount}-card deck?`)) return;

    setBusy(true);
    try {
      const result = await resolveDeck(parsed.cards);
      renderDeck(result.cards);
      const summary = [
        `Imported ${total}/60 cards across ${result.cards.length} distinct printings.`,
        'Review the card images, then use “Check Format” and “Issue Deck Code”.',
        'To change cards, edit the pasted list and import again; click an imported card to change only its quantity.'
      ];
      if (total !== 60) summary.push(`Warning: the list has ${total} cards, not 60.`);
      if (result.warnings.length) summary.push('', 'Warnings:', ...result.warnings.map((warning) => `• ${warning}`));
      setStatus(result.warnings.length || total !== 60 ? 'info' : 'ok', summary.join('\n'));
    } catch (error) {
      setStatus('error', `Import stopped; the current deck was not changed.\n${error.message || error}`);
    } finally {
      setBusy(false);
    }
  }

  if (testMode) {
    module.exports = {
      SET_CODES,
      INTERNATIONAL_ENGLISH_LOCALES,
      getLocale,
      isSupportedLocale,
      unsupportedRegionMessage,
      getNativeProductCodes,
      resolveProductCode,
      normalizeName,
      normalizeBasicEnergyName,
      parseDeckList,
      collectorNumber,
      resolveCard
    };
    return;
  }

  if (isSupportedLocale()) installUi();
  else installUnsupportedNotice();
})();
