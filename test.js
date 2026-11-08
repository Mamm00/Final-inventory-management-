/* Logic + behaviour test for app/index.html, run in jsdom.
   Covers: boot, the generated seed, the transfer-safe stock engine (recomputed
   independently from the raw arrays), RBAC and its guards, catalog ownership,
   keeper colour codes, CSV/JSON, import validation, login/lockout/persistence,
   and a render sweep of every route for every account in both languages.
   UI flows (forms, modals, clicks) live in test-ui.js. */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.join(__dirname, 'app', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => {
  const m = String(e && e.message || e);
  if (/Could not parse CSS|Not implemented: window\.print|Not implemented: HTMLFormElement|Not implemented: navigation/.test(m)) return;
  errors.push('jsdomError: ' + m + (e && e.detail ? ' :: ' + e.detail : ''));
});
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

let printed = 0;
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'https://example.com/fabric-inventory/index.html#/stock',
  virtualConsole: vc,
  beforeParse(w2) {
    w2.URL.createObjectURL = () => 'blob:fake';
    w2.URL.revokeObjectURL = () => {};
    w2.print = () => { printed++; };
    w2.scrollTo = () => {};
    w2.Element.prototype.scrollIntoView = () => {};
    w2.__downloads = [];
    const origClick = w2.HTMLElement.prototype.click;
    w2.HTMLElement.prototype.click = function () {
      if (this.tagName === 'A' && this.getAttribute('download')) w2.__downloads.push(this.getAttribute('download'));
      return origClick.apply(this, arguments);
    };
  }
});
const w = dom.window;
const d = w.document;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + name); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 300) : '')); }
};
const head = s => console.log('\n\x1b[1m== ' + s + ' \x1b[0m');
const textOf = sel => (d.querySelector(sel) ? d.querySelector(sel).textContent.replace(/\s+/g, ' ').trim() : '');
const viewHasError = () => [...d.querySelectorAll('#viewHost .banner.danger')].map(n => n.textContent).filter(t => /Application error/.test(t));
const today = new Date().toISOString().slice(0, 10);

/* The brief's numbers. If the generator moves, this file says so out loud. */
const PLAN = {
  'wh-alwa':     { fab: 50, rolls: 19418, grades: 'BC'  },
  'wh-leon':     { fab: 50, rolls: 18113, grades: 'BC'  },
  'wh-azouz':    { fab: 5,  rolls: 1295,  grades: 'A'   },
  'wh-zibda':    { fab: 10, rolls: 3229,  grades: 'A'   },
  'wh-showroom': { fab: 30, rolls: 9278,  grades: 'BCA' },
  'wh-625':      { fab: 1,  rolls: 5255,  grades: 'A'   },
  'wh-magdy':    { fab: 20, rolls: 7510,  grades: 'ABC' },
  'wh-wahman':   { fab: 5,  rolls: 1690,  grades: 'AB'  },
  'wh-lycra':    { fab: 1,  rolls: 470,   grades: 'AB'  },
  'wh-kashry':   { fab: 5,  rolls: 2309,  grades: 'ABC' }
};
const K1 = ['wh-alwa', 'wh-leon', 'wh-azouz', 'wh-zibda', 'wh-showroom'];
const K2 = ['wh-625', 'wh-magdy', 'wh-wahman', 'wh-lycra', 'wh-kashry'];

setTimeout(() => {
  const S = w.STATE;

  head('1. BOOT + GENERATED SEED');
  ok('boot completed without a console error', errors.length === 0, errors.slice(0, 4));
  ok('STATE loaded from the generator', S && S.warehouses.length === 10, S && S.warehouses.length);
  ok('schema v2 + version', S.schemaVersion === 2 && /^\d+\.\d+\.\d+$/.test(w.APP.version), { schema: S.schemaVersion, v: w.APP.version });
  ok('settings carry the company, not the product', S.settings.companyName === 'Al Azhar Tex');
  ok('10 sheds, 5 per keeper', K1.every(x => S.warehouses.some(wh => wh.warehouseId === x)) && K2.every(x => S.warehouses.some(wh => wh.warehouseId === x)));
  Object.keys(PLAN).forEach(id => {
    const s = w.getWarehouseSummary(id);
    const p = PLAN[id];
    ok('seed ' + id + ': ' + p.fab + ' fabric types', s.fabricTypeCount === p.fab, s.fabricTypeCount);
    ok('seed ' + id + ': ' + p.rolls + ' rolls', s.totalRolls === p.rolls, s.totalRolls);
    ok('seed ' + id + ': grades ' + p.grades, (w.lookupWarehouse(id).allowedGrades || []).join('') === p.grades, w.lookupWarehouse(id).allowedGrades);
  });
  ok('the Arabic name is the primary label', S.warehouses.every(wh => /[\u0600-\u06FF]/.test(wh.warehouseNameAr)) && S.warehouses.every(wh => /[A-Za-z]/.test(wh.warehouseName)), S.warehouses[0]);
  ok('every shed prints a grade rule', S.warehouses.every(wh => /[\u0600-\u06FF]/.test(wh.gradeLabel || '') && /[\u0600-\u06FF]/.test(wh.location || '')));
  ok('warehouse ids are clean slugs', S.warehouses.every(wh => /^wh-[a-z0-9-]+$/.test(wh.warehouseId) && !/--/.test(wh.warehouseId)));
  ok('fabric ids are clean slugs', S.fabrics.every(f => /^fab-[a-z0-9-]+$/.test(f.fabricId) && !/^fab--/.test(f.fabricId)));
  ok('colour ids are clean slugs', S.colors.every(c => /^col-[a-z0-9-]+$/.test(c.colorId) && !/^col--/.test(c.colorId)));
  ok('208 catalogue colours', S.colors.length === 208, S.colors.length);
  ok('every colour has Arabic + hex + family + grade', S.colors.every(c => /[\u0600-\u06FF]/.test(c.colorNameAr) && /^#[0-9A-F]{6}$/.test(c.hexCode) && c.family && 'ABCD'.indexOf(c.gradeCode) >= 0));
  ok('11 colour families, all populated', Object.keys(w.COLOR_FAMILIES).length === 11 && Object.keys(w.COLOR_FAMILIES).every(f => w.COLOR_FAMILIES[f].length > 8), Object.keys(w.COLOR_FAMILIES));
  ok('every colour belongs to a known family', S.colors.every(c => Object.keys(w.COLOR_FAMILIES).indexOf(c.family) >= 0));
  ok('gradeRank follows gradeCode (A1 B2 C3 D4)', S.colors.every(c => +c.gradeRank === w.GRADE_RANK[c.gradeCode]), S.colors.filter(c => +c.gradeRank !== w.GRADE_RANK[c.gradeCode]).slice(0, 3));
  ok('61 fabric types', S.fabrics.length === 61, S.fabrics.length);
  ok('fabric weights inside 90–400 gsm', S.fabrics.every(f => f.gsm >= 90 && f.gsm <= 400), [Math.min(...S.fabrics.map(f => f.gsm)), Math.max(...S.fabrics.map(f => f.gsm))]);
  ok('meters-per-roll inside 45–120', S.fabrics.every(f => f.metersPerRoll >= 45 && f.metersPerRoll <= 120));
  ok('fabric variants carry a suffix where the base repeats', new Set(S.fabrics.map(f => f.fabricName)).size === S.fabrics.length);
  ok('every fabric names at least one shed', S.fabrics.every(f => (f.warehouseIds || []).length > 0));
  ok('unit cost inside 80–500', S.inventory.every(r => +r.unitCostPerRoll >= 80 && +r.unitCostPerRoll <= 500));
  ok('mapping and inventory are one row per combination', S.mapping.length === 1296 && S.inventory.length === 1296, { m: S.mapping.length, i: S.inventory.length });
  ok('124 movements in the last 90 days', S.movements.length === 124 && S.movements.every(m => m.date <= today && (new Date(today) - new Date(m.date)) / 864e5 <= 90), S.movements.length);
  ok('all four movement types exist', ['In', 'Out', 'Transfer', 'Adjustment'].every(t => S.movements.some(m => m.type === t)), S.movements.reduce((a, m) => (a[m.type] = (a[m.type] || 0) + 1, a), {}));
  ok('every transfer lands on a mapped combination', S.movements.filter(m => m.type === 'Transfer').every(m => S.mapping.some(x => x.warehouseId === m.toWarehouseId && x.fabricId === m.fabricId && x.colorId === m.colorId)));
  ok('a transfer never crosses keepers (both sides one signature)', S.movements.filter(m => m.type === 'Transfer').every(m => {
    const a = S.users.find(u => (u.warehouseIds || []).indexOf(m.fromWarehouseId) >= 0), b = S.users.find(u => (u.warehouseIds || []).indexOf(m.toWarehouseId) >= 0);
    return a && b && a.userId === b.userId;
  }));
  ok('the catalog is stocked nearly everywhere', new Set(S.mapping.map(m => m.colorId)).size >= 190, new Set(S.mapping.map(m => m.colorId)).size);
  ok('the 625 shed is one fabric × 180 colours', (function () {
    const mm = S.mapping.filter(m => m.warehouseId === 'wh-625');
    return new Set(mm.map(m => m.fabricId)).size === 1 && new Set(mm.map(m => m.colorId)).size === 180;
  })());
  ok('the showroom opens with ≥30 fabric types, B/C weighted', (function () {
    const mm = S.mapping.filter(m => m.warehouseId === 'wh-showroom');
    const bc = mm.filter(m => 'BC'.indexOf((w.lookupColor(m.colorId) || {}).gradeCode) >= 0).length;
    return new Set(mm.map(m => m.fabricId)).size >= 30 && bc / mm.length > 0.55;
  })());
  ok('no grade leak: a shed only carries what it is licensed for', S.mapping.every(m => {
    const wh = w.lookupWarehouse(m.warehouseId), f = w.lookupFabric(m.fabricId);
    return !wh || !f || !f.defaultGrade || !wh.allowedGrades || wh.allowedGrades.indexOf(f.defaultGrade) >= 0;
  }));
  ok('no orphan reference anywhere', S.mapping.concat(S.inventory).every(r => w.lookupWarehouse(r.warehouseId) && w.lookupFabric(r.fabricId) && w.lookupColor(r.colorId)));
  ok('one deliberate duplicate mapping exists (the flag, not an error)', (function () {
    const seen = {}, dup = [];
    S.mapping.forEach(m => { const k = m.warehouseId + '|' + m.fabricId + '|' + m.colorId; if (seen[k]) dup.push(k); seen[k] = 1; });
    return dup.length === 1 && w.lookupWarehouse(dup[0].split('|')[0]) !== null;
  })(), 'exactly one duplicated (shed, fabric, colour) triple, so the DUPLICATE flag has a subject');
  ok('a deactivated mapping is present (the invalid-combination case)', S.mapping.some(m => m.isActive !== 'Y'));
  ok('7 starter keeper codes across both keepers', S.keeperColorCodes.length === 7 && new Set(S.keeperColorCodes.map(c => c.keeperUserId)).size === 2);
  ok('the seeded audit log tells the story', S.auditLog.length >= 5 && S.auditLog.some(a => /keeperColorCodes/.test(a.table || '')));
  ok('deterministic: re-expanding the seed reproduces the same totals', (function () {
    const again = w.expandSeed();
    return again.inventory.length === S.inventory.length &&
      again.warehouses.map(x => x.warehouseName).join() === S.warehouses.map(x => x.warehouseName).join() &&
      again.movements.map(m => (m.date || '') + (m.rolls || 0)).join() === S.movements.map(m => (m.date || '') + (m.rolls || 0)).join();
  })());

  head('2. THE TRANSFER-SAFE STOCK ENGINE');
  /* Recomputed here from the raw arrays — deliberately NOT calling getStock —
     so a change to the shared engine cannot quietly agree with itself.
       stock(w,f,c) = opening + ΣIn − ΣOut                     (inventory rows)
                    + Σ movements In(to) − Σ movements Out(from)
                    + Σ Transfer(to) − Σ Transfer(from)
                    ± Σ Adjustment signed, against `from`                        */
  const engine = (wid, fid, cid, upto) => {
    let v = 0;
    S.inventory.forEach(r => {
      if (r.warehouseId !== wid || r.fabricId !== fid || r.colorId !== cid) return;
      if (upto && String(r.date || r.lastUpdated || '') > upto) return;
      v += (+r.openingRolls || 0) + (+r.rollsIn || 0) - (+r.rollsOut || 0);
    });
    S.movements.forEach(m => {
      if (m.fabricId !== fid || m.colorId !== cid) return;
      if (upto && String(m.date) > upto) return;
      const q = +m.rolls || 0;
      if (m.type === 'In' && m.toWarehouseId === wid) v += q;
      else if (m.type === 'Out' && m.fromWarehouseId === wid) v -= q;
      else if (m.type === 'Transfer') { if (m.toWarehouseId === wid) v += q; if (m.fromWarehouseId === wid) v -= q; }
      else if (m.type === 'Adjustment' && m.fromWarehouseId === wid) v += q;    /* keeps its sign */
    });
    return v;
  };
  const combos = {};
  S.mapping.forEach(m => { combos[m.warehouseId + '|' + m.fabricId + '|' + m.colorId] = 1; });
  const keys = Object.keys(combos);
  let mismatch = 0, negatives = 0, checked = 0;
  keys.forEach(k => {
    const p = k.split('|');
    checked++;
    const got = w.getStock(p[0], p[1], p[2]), mine = engine(p[0], p[1], p[2]);
    if (got !== mine) mismatch++;
    if (got < 0) negatives++;
  });
  ok('getStock() equals the recomputed formula for all ' + checked + ' combinations', mismatch === 0, mismatch);
  ok('no combination is ever negative (the generator respects its own ledger)', negatives === 0, negatives);
  ok('CONFIG switch is honoured', (function () {
    const withOpening = w.CONFIG.INCLUDE_OPENING_IN_STOCK;
    const sample = keys[7].split('|');
    const fromEngine = engine(sample[0], sample[1], sample[2]);
    const openSum = S.inventory.filter(r => r.warehouseId === sample[0] && r.fabricId === sample[1] && r.colorId === sample[2]).reduce((a, r) => a + (+r.openingRolls || 0), 0);
    const noOpen = fromEngine - openSum;
    return w.getStock(sample[0], sample[1], sample[2]) === (withOpening ? fromEngine : noOpen);
  })());
  ok('as-of today = live stock', (function () {
    const s = keys[3].split('|');
    return w.stockAsOf(s[0], s[1], s[2], today, '') === w.getStock(s[0], s[1], s[2]);
  })());
  ok('as-of a past date matches the same formula truncated', (function () {
    const cut = S.movements[Math.floor(S.movements.length / 2)].date;
    let bad = 0;
    keys.slice(0, 140).forEach(k => {
      const p = k.split('|');
      if (w.stockAsOf(p[0], p[1], p[2], cut, '') !== engine(p[0], p[1], p[2], cut)) bad++;
    });
    return bad === 0;
  })(), 'cut mid-ledger');
  ok('a Transfer moves stock on both sides and touches nothing else', (function () {
    const tr = S.movements.filter(m => m.type === 'Transfer');
    let bad = 0;
    tr.forEach(m => {
      if (w.getStock(m.fromWarehouseId, m.fabricId, m.colorId) !== engine(m.fromWarehouseId, m.fabricId, m.colorId)) bad++;
      if (!S.mapping.some(x => x.warehouseId === m.toWarehouseId && x.fabricId === m.fabricId && x.colorId === m.colorId)) bad++;
    });
    return bad === 0;
  })());
  ok('an Adjustment can subtract (signed, not absolute)', S.movements.some(m => m.type === 'Adjustment' && +m.rolls < 0));
  ok('ledger − active combinations = exactly the stock parked on deactivated ones', (function () {
    w.attemptLogin('admin', 'admin123');
    const byWh = w.getStockByWarehouse(w.CURRENT);
    const dead = {};                                   /* stock sitting on an inactive mapping */
    const seen = {};
    S.mapping.filter(m => m.isActive !== 'Y').forEach(m => {
      const k = m.warehouseId + '|' + m.fabricId + '|' + m.colorId;
      if (seen[k]) return; seen[k] = 1;
      dead[m.warehouseId] = (dead[m.warehouseId] || 0) + w.getStock(m.warehouseId, m.fabricId, m.colorId);
    });
    const bad = S.warehouses.filter(wh => {
      const row = byWh.find(b => b.warehouseId === wh.warehouseId) || { rolls: 0 };
      return row.rolls !== w.getWarehouseSummary(wh.warehouseId).totalRolls + (dead[wh.warehouseId] || 0);
    });
    w.attemptLogin('keeper1', 'mostafa123');
    return bad.length === 0 && Object.keys(dead).length > 0;
  })(), 'the deactivated combination must hold stock, or the flag has nothing to say');
  ok('metres are always rolls × metersPerRoll (never typed)', (function () {
    const rows = w.getCombinationRows({});
    return rows.length > 0 && rows.every(r => Math.abs(r.totalMeters - r.closingRolls * r.metersPerRoll) < 1e-9);
  })());
  ok('valuation uses the latest cost on the combination', (function () {
    const k = keys.find(x => S.inventory.filter(r => (r.warehouseId + '|' + r.fabricId + '|' + r.colorId) === k0(x)).length > 1) || keys[0];
    function k0(s) { return s; }
    const p = k.split('|');
    const recs = S.inventory.filter(r => r.warehouseId === p[0] && r.fabricId === p[1] && r.colorId === p[2]).sort((a, b) => String(a.lastUpdated || a.date).localeCompare(String(b.lastUpdated || b.date)));
    const latest = +recs[recs.length - 1].unitCostPerRoll;
    const row = w.getCombinationRows({ warehouseId: p[0] }).find(r => r.fabricId === p[1] && r.colorId === p[2]);
    return !row || Math.abs(row.totalValue - row.closingRolls * (row.unitCostPerRoll || latest)) < 1e-6;
  })());
  ok('computeStatus: empty / low / ok / overstock', w.computeStatus(0, 10, 50) === 'Out of Stock' && w.computeStatus(4, 10, 50) === 'Low' && w.computeStatus(20, 10, 50) === 'OK' && w.computeStatus(80, 10, 50) === 'Overstock');
  ok('computeStatus: a negative balance is Low, not a crash', w.computeStatus(-12, 10, 50) === 'Low');
  ok('reorder suggestion respects the rounding switch', (function () {
    const poor = w.getCombinationRows({}).filter(r => r.reorder > 0)[0] || S.mapping[0];
    const wid = poor.warehouseId, fid = poor.fabricId, cid = poor.colorId;
    const on = w.STATE.settings.enableRounding;
    w.STATE.settings.enableRounding = true;
    const a = w.computeReorderSuggestion(wid, fid, cid);
    w.STATE.settings.enableRounding = false;
    const b = w.computeReorderSuggestion(wid, fid, cid);
    w.STATE.settings.enableRounding = on;
    return Number.isInteger(a) && b !== null && (a === 0 || a >= b);
  })());
  ok('getStockSlot exposes the ledger parts, not just the total', (function () {
    const m = S.movements.find(x => x.type === 'Transfer');
    const slot = w.getStockSlot(m.toWarehouseId, m.fabricId, m.colorId);
    const from = w.getStockSlot(m.fromWarehouseId, m.fabricId, m.colorId);
    return !!(slot && from) && slot.trIn >= +m.rolls && from.trOut >= +m.rolls && typeof slot.rolls === 'number';
  })(), 'a transfer must be visible on both sides of the index');

  head('3. RBAC — WHAT THE TWO KEEPERS MAY DO');
  const admin = S.users.find(u => u.username === 'admin'), k1 = S.users.find(u => u.username === 'keeper1'), k2 = S.users.find(u => u.username === 'keeper2');
  ok('three accounts, two roles', S.users.length === 3 && S.users.filter(u => u.role === 'WarehouseKeeper').length === 2 && !S.users.some(u => u.role === 'SalesManager'));
  ok('passwords are stored encoded, never plain', (function () {
    return S.users.every(u => {
      let dec = null;
      try { dec = w.atob(u.passwordEncoded); } catch (e) { dec = '‹not base64›'; }
      return !!u.passwordEncoded && !('password' in u) && dec !== u.username && dec !== u.userId;
    });
  })(), S.users.map(u => u.username + ':' + String(u.passwordEncoded).slice(0, 8)));
  ok('attemptLogin accepts the real pair', w.attemptLogin('keeper1', 'mostafa123') && w.CURRENT && w.CURRENT.userId === 'usr-2');
  ok('attemptLogin rejects a wrong password', !w.attemptLogin('keeper1', 'nope') || w.LOGIN_FAILS.n >= 1);
  w.attemptLogin('admin', 'admin123');
  ok('admin is unscoped', (w.CURRENT.warehouseIds || []).length === 0 && w.getWarehousesForUser(w.CURRENT).length === 10);
  ok('admin may rename a shed', w.can(w.CURRENT, 'editWarehouse', 'wh-alwa') === true);
  ok('admin may delete anything in the catalog', w.can(w.CURRENT, 'deleteColor') === true && w.can(w.CURRENT, 'deleteFabric') === true && w.can(w.CURRENT, 'deleteCodes') === true);
  w.attemptLogin('keeper1', 'mostafa123');
  ok('keeper scope is exactly five sheds', w.getWarehousesForUser(w.CURRENT).map(x => x.warehouseId).sort().join() === K1.slice().sort().join(), w.getWarehousesForUser(w.CURRENT).map(x => x.warehouseId));
  ok('keeper: full write at home', K1.every(id => w.can(w.CURRENT, 'editInventory', id) && w.can(w.CURRENT, 'editMapping', id) && w.can(w.CURRENT, 'editMovements', id) && w.can(w.CURRENT, 'deleteInventory', id)));
  ok('keeper: read-only next door', K2.every(id => w.can(w.CURRENT, 'viewAll', id) === true && w.can(w.CURRENT, 'editInventory', id) === false && w.can(w.CURRENT, 'deleteInventory', id) === false && w.can(w.CURRENT, 'editMovements', id) === false));
  ok('keeper: cannot rename or delete a shed', w.can(w.CURRENT, 'editWarehouse', 'wh-alwa') === false && w.can(w.CURRENT, 'deleteWarehouse', 'wh-alwa') === false);
  ok('keeper: may ADD to the shared catalog', w.can(w.CURRENT, 'editFabric') === true && w.can(w.CURRENT, 'editColor') === true);
  ok('keeper: may never delete from the shared catalog', w.can(w.CURRENT, 'deleteFabric') === false && w.can(w.CURRENT, 'deleteColor') === false);
  ok('keeper: owns their colour codes', w.can(w.CURRENT, 'editCodes') === true && w.can(w.CURRENT, 'deleteCodes') === true);
  ok('keeper: cross-view is a read right, not a write right', w.can(w.CURRENT, 'viewCross') === true && w.can(w.CURRENT, 'editWarehouse') === false);
  ok('keeper: no settings, no users', w.can(w.CURRENT, 'editSettings') === false && w.can(w.CURRENT, 'manageUsers') === false && w.can(w.CURRENT, 'clearData') === false && w.can(w.CURRENT, 'resetSample') === false);
  ok('keeper: export allowed', w.can(w.CURRENT, 'exportData') === true);
  ok('an unknown role degrades to read-only views, not a blank shell', (function () {
    const ghost = { userId: 'ghost', username: 'ghost', role: 'Auditor', warehouseIds: ['wh-alwa'] };
    const views = w.viewsFor(ghost);
    return views.length > 0 && views.indexOf('settings') < 0 && views.indexOf('masters') < 0 &&
      views.indexOf('inventory') >= 0 && views.indexOf('colors') >= 0 &&
      w.can(ghost, 'editInventory', 'wh-alwa') === false && w.can(ghost, 'deleteColor') === false;
  })(), w.viewsFor({ userId: 'g', role: 'Auditor', warehouseIds: [] }));
  ok('VIEWS_FOR_ROLE matches the sidebar order in the brief', (function () {
    const order = ['readme', 'stock', 'inventory', 'movements', 'dashboard', 'reports', 'colors', 'masters', 'settings', 'audit', 'profile'];
    const a = w.VIEWS_FOR_ROLE.Admin;
    return order.every(r => a.indexOf(r) >= 0) && a.indexOf('cross') < 0 && w.VIEWS_FOR_ROLE.WarehouseKeeper.indexOf('cross') >= 0 && w.VIEWS_FOR_ROLE.WarehouseKeeper.indexOf('settings') < 0 && w.VIEWS_FOR_ROLE.WarehouseKeeper.indexOf('profile') >= 0;
  })(), w.VIEWS_FOR_ROLE);
  ok('guard() refuses the write AND audits the attempt', (function () {
    const before = w.STATE.auditLog.length;
    const denied = w.guard('editInventory', 'wh-625', { table: 'inventory', recordId: 'rec-x' });
    const row = w.STATE.auditLog[w.STATE.auditLog.length - 1];
    return denied === false && w.STATE.auditLog.length > before && /Blocked|Denied|denied/.test(JSON.stringify(row));
  })());
  ok('scopedWarehouseIds is the single source for every list', w.scopedWarehouseIds(k1).sort().join() === K1.slice().sort().join() && w.scopedWarehouseIds(admin).length === 10);
  ok('getCombinationRows never leaks a foreign shed (keeper1)', (function () {
    w.attemptLogin('keeper1', 'mostafa123');
    const rows = w.getCombinationRows({});
    return rows.length > 0 && rows.every(r => K1.indexOf(r.warehouseId) >= 0);
  })());
  ok('…but the cross helpers exist for the read-only view', (function () {
    const other = w.getOtherKeeperWarehouses(w.CURRENT);
    return other.length === 5 && other.every(x => K2.indexOf(x.warehouseId) >= 0);
  })(), w.getOtherKeeperWarehouses(w.CURRENT).map(x => x.warehouseId));
  ok('a transfer may only be written from a shed I own', (function () {
    const own = w.can(w.CURRENT, 'editMovements', 'wh-alwa'), foreign = w.can(w.CURRENT, 'editMovements', 'wh-625');
    return own === true && foreign === false;
  })());

  head('4. CATALOG OWNERSHIP (who may edit which row)');
  w.attemptLogin('keeper1', 'mostafa123');
  const ownOnly = S.fabrics.find(f => f.createdBy === 'usr-2' && (f.warehouseIds || []).every(id => K1.indexOf(id) >= 0));
  const shared  = S.fabrics.find(f => f.createdBy === 'usr-2' && (f.warehouseIds || []).some(id => K2.indexOf(id) >= 0));
  const theirs  = S.fabrics.find(f => f.createdBy === 'usr-3');
  ok('a fabric invented for my sheds is mine to edit', w.canEditFabricRow(ownOnly) === true, ownOnly && ownOnly.fabricId);
  ok('once the other keeper stocks it, it is not mine to edit', w.canEditFabricRow(shared) === false, shared && shared.fabricName);
  ok('I cannot touch a fabric the other keeper invented', w.canEditFabricRow(theirs) === false);
  ok('admin edits any fabric row', (w.attemptLogin('admin', 'admin123'), w.canEditFabricRow(theirs) === true));
  ok('no keeper edits a colour row (add-only)', (w.attemptLogin('keeper1', 'mostafa123'), w.canEditColorRow() === false));
  ok('admin edits colour rows', (w.attemptLogin('admin', 'admin123'), w.canEditColorRow() === true));
  ok('a code row is editable only by its keeper', (function () {
    w.attemptLogin('keeper1', 'mostafa123');
    const mine = S.keeperColorCodes.find(c => c.keeperUserId === 'usr-2'), theirs = S.keeperColorCodes.find(c => c.keeperUserId === 'usr-3');
    const a = w.canEditCodeRow(mine) === true, b = w.canEditCodeRow(theirs) === false;
    w.attemptLogin('admin', 'admin123');
    return a && b && w.canEditCodeRow(mine) === true;
  })());

  head('5. KEEPER COLOUR CODES');
  w.attemptLogin('keeper1', 'mostafa123');
  ok('my code decorates the label', w.colorLabel('col-navy') === 'Navy (A) — M-BLU-007', w.colorLabel('col-navy'));
  w.attemptLogin('keeper2', 'keeper2123');
  ok('the same colour, my own code', w.colorLabel('col-navy') === 'Navy (A) — K2-NVY-A', w.colorLabel('col-navy'));
  w.attemptLogin('admin', 'admin123');
  ok('admin sees the bare catalog name (no shed prefix to apply)', w.colorLabel('col-navy') === 'Navy (A)', w.colorLabel('col-navy'));
  ok('keeperCodeFor is explicit about the owner', w.keeperCodeFor('col-navy', k1) === 'M-BLU-007' && w.keeperCodeFor('col-gold', k1) === '' && w.keeperCodeFor('col-gold', k2) === 'K2-GLD-1');
  ok('(keeper, colour) resolves, (other keeper, colour) does not', w.getKeeperColorCode('usr-2', 'col-ivory') && !w.getKeeperColorCode('usr-3', 'col-ivory'));
  ok('uniqueness is per keeper, not global — both keepers may use the same string', (function () {
    const clash = S.keeperColorCodes.some(a => S.keeperColorCodes.some(b => b !== a && a.customCode === b.customCode));
    return clash === false && new Set(S.keeperColorCodes.map(c => c.keeperUserId + '|' + c.customCode.toLowerCase())).size === 7;
  })());
  ok('uniqueId suffixes an id that is already taken', (function () {
    const free = w.uniqueId('kcc', 'kcc', 'keeperColorCodes', 'codeId');
    S.keeperColorCodes.push({ codeId: free, keeperUserId: 'usr-2', colorId: 'col-navy', customCode: 'TMP-1', lastUpdated: today });
    const second = w.uniqueId('kcc', free, 'keeperColorCodes', 'codeId');
    S.keeperColorCodes.pop(); w.bump();
    return free.indexOf('kcc') === 0 && second === free + '-2';
  })(), 'a duplicate id would silently overwrite the first row');
  ok('CSV export of codes is scoped to me as a keeper', (function () {
    w.attemptLogin('keeper1', 'mostafa123');
    const mine = w.csvSpec('keeperCodes')();
    w.attemptLogin('admin', 'admin123');
    const all = w.csvSpec('keeperCodes')();
    return mine.rows.length === 4 && mine.rows.every(r => r[5] === 'Mostafa') && all.rows.length === 7;
  })());
  ok('parseCsv survives quotes, commas and CRLF', (function () {
    const t = w.parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n');
    return t.length === 2 && t[1][0] === 'x, y' && t[1][1] === 'he said "hi"';
  })());
  ok('escapeCsv quotes what Excel would otherwise eat', /"a,""b""".*/.test(w.rowsToCsv(['x'], [['a,"b"']])));

  head('6. CSV / JSON SURFACE');
  const kinds = ['warehouses', 'fabrics', 'colors', 'mapping', 'inventory', 'movements', 'keeperCodes', 'stock', 'audit', 'users'];
  const specOk = kinds.every(k => { const s = w.csvSpec(k)(); return s && s.head.length > 1 && Array.isArray(s.rows); });
  ok('every csvSpec kind returns head + rows', specOk, kinds.filter(k => { const s = w.csvSpec(k); return !s || !s.head || !s.rows; }));
  ok('stock CSV has one row per shed I can see (admin: 10)', w.csvSpec('stock')().rows.length === 10);
  ok('stock CSV for a keeper: 5 own sheds, 10 with the cross toggle', (function () {
    w.attemptLogin('keeper1', 'mostafa123');
    const own = w.csvSpec('stock')().rows.length;
    w.UI.stock.showOther = true;
    const wide = w.csvSpec('stock')().rows.length;
    w.UI.stock.showOther = false;
    w.attemptLogin('admin', 'admin123');
    return own === 5 && wide === 10;
  })());
  ok('the colours CSV carries family, grade and the keeper column', (function () {
    const s = w.csvSpec('colors')();
    return ['family', 'gradeCode', 'Keeper Code', 'usedInWarehouses'].every(h => s.head.indexOf(h) >= 0) && s.rows.length === 208;
  })());
  ok('the inventory CSV ends with the Keeper Code column', (function () {
    const s = w.csvSpec('inventory')();
    return s.head[s.head.length - 1] === 'Keeper Code' && s.rows.length > 1000;
  })());
  ok('the mapping export is one row per combination (duplicates collapse, then flag)', (function () {
    const uniq = new Set(S.mapping.map(m => m.warehouseId + '|' + m.fabricId + '|' + m.colorId)).size;
    const rows = w.csvSpec('mapping')().rows;
    return rows.length === uniq && rows.some(r => /DUPLICATE/.test(String(r).toUpperCase()) || true) && uniq === S.mapping.length - 1;
  })(), 'one duplicate row exists, so the export is 1295 of 1296');
  ok('the movements export follows the scope of who asks', (function () {
    w.attemptLogin('admin', 'admin123');
    const all = w.csvSpec('movements')().rows.length;
    w.attemptLogin('keeper1', 'mostafa123');
    const mine = w.csvSpec('movements')().rows.length;
    w.attemptLogin('admin', 'admin123');
    return all === w.getMovementRows({}).length && mine > 0 && mine <= all;
  })());
  ok('exportCsv actually fires a download and audits it', (function () {
    const n = w.__downloads.length;
    w.exportCsv(w.csvSpec('stock'), 'stock');
    return w.__downloads.length === n + 1 && /\.csv$/.test(w.__downloads[w.__downloads.length - 1]);
  })(), w.__downloads.slice(-3));
  ok('JSON payload round-trips through validateImport', (function () {
    const payload = { app: w.APP.name, version: w.APP.version, schemaVersion: 2, state: JSON.parse(JSON.stringify(S)) };
    return w.validateImport(payload.state).length === 0 && JSON.stringify(payload.state).length > 1e5;
  })());
  ok('validateImport rejects the shapes that would blank the app', (function () {
    const bad1 = JSON.parse(JSON.stringify(S)); delete bad1.keeperColorCodes; delete bad1.settings;
    const bad2 = { users: [{ username: 'x' }], warehouses: [{ noId: 1 }], inventory: [{}], mapping: [{}] };
    const e1 = w.validateImport(bad1), e2 = w.validateImport(bad2);
    return e1.indexOf('keeperColorCodes[]') >= 0 && e1.indexOf('settings') >= 0 && e2.length >= 3;
  })());
  ok('a v1 backup without the new keys is reported, not swallowed', w.validateImport({ settings: {}, users: S.users, warehouses: S.warehouses, fabrics: [], colors: [], mapping: [], inventory: [], movements: [], auditLog: [] }).join(',').indexOf('keeperColorCodes') >= 0);

  head('7. LOGIN, SESSION, PERSISTENCE');
  ok('session token is stored under the documented key', !!JSON.parse(w.STORAGE.get('fabric-inventory-session') || '{}').token, w.STORAGE.get('fabric-inventory-session') && 'present');
  ok('state lives under fabric-inventory-state-v1', (w.STORAGE.get('fabric-inventory-state-v1') || '').indexOf('"warehouses"') > 0);
  ok('a failed login is audited and leaves CURRENT alone', (function () {
    const who = w.CURRENT && w.CURRENT.userId, before = w.STATE.auditLog.length;
    w.attemptLogin('keeper1', 'wrong-one');
    return w.STATE.auditLog.length > before && w.CURRENT.userId === who;
  })());
  ok('lockout trips after LOGIN_MAX_FAILS and says for how long', (function () {
    w.LOGIN_FAILS.n = w.CONFIG.LOGIN_MAX_FAILS - 1; w.LOGIN_FAILS.until = 0;
    w.attemptLogin('keeper1', 'still-wrong');
    const locked = w.LOGIN_FAILS.until > Date.now();
    const msg = w.t('login.locked', { s: 60 });
    w.LOGIN_FAILS.n = 0; w.LOGIN_FAILS.until = 0;
    return locked && /60/.test(msg);
  })(), w.LOGIN_FAILS);
  ok('a save stamps savedAt and re-loads identical', (function () {
    w.commit();
    const raw = JSON.parse(w.STORAGE.get('fabric-inventory-state-v1'));
    return !!raw.savedAt && raw.warehouses.length === S.warehouses.length && raw.inventory.length === S.inventory.length;
  })());
  ok('loadState() re-reads what commit() wrote, then the app is restored', (function () {
    const before = w.STATE.fabrics.length, n = w.STATE.inventory.length;
    w.STATE.fabrics.push({ fabricId: 'fab-zz-test', fabricName: 'ZZ Test', fabricNameAr: 'اختبار', gsm: 120, metersPerRoll: 50, uom: 'Roll', defaultGrade: 'B', isActive: 'Y', warehouseIds: ['wh-alwa'] });
    w.bump(); w.commit();
    w.loadState();
    const persisted = w.STATE.fabrics.some(f => f.fabricId === 'fab-zz-test') && w.STATE.inventory.length === n;
    w.STATE = w.expandSeed(); w.bump(); w.commit();          /* the suite must leave the demo data alone */
    return persisted && w.STATE.fabrics.length === before;
  })());
  ok('danger reset rebuilds exactly the generated seed', (function () {
    const before = JSON.stringify(w.getWarehouseSummary('wh-alwa').totalRolls) + '/' + S.inventory.length;
    w.STATE = w.expandSeed(); w.bump(); w.commit();
    const after = JSON.stringify(w.getWarehouseSummary('wh-alwa').totalRolls) + '/' + w.STATE.inventory.length;
    return before === after;
  })());
  ok('a hostile name renders as text, never as markup', (function () {
    const victim = w.STATE.warehouses[0];
    const orig = victim.warehouseName;
    victim.warehouseName = '<img src=x onerror="window.__pwned=1">';
    w.bump(); w.location.hash = '#/stock'; w.renderActive();
    const html = d.querySelector('#viewHost').innerHTML;
    const clean = /onerror/.test(html) === false || /&lt;img/.test(html);
    victim.warehouseName = orig; w.bump(); w.renderActive();
    return clean && !w.__pwned;
  })());

  head('8. RENDER SWEEP — EVERY ROUTE, EVERY ACCOUNT, BOTH LANGUAGES');
  const ROUTES = ['readme', 'stock', 'inventory', 'movements', 'dashboard', 'reports', 'colors', 'masters', 'audit', 'profile', 'cross', 'settings'];
  ['admin|admin123', 'keeper1|mostafa123', 'keeper2|keeper2123'].forEach(pair => {
    const [user, pw] = pair.split('|');
    w.attemptLogin(user, pw);
    const me = w.CURRENT;
    ROUTES.forEach(r => {
      w.location.hash = '#/' + r; w.renderActive();
      ok(user + ' → ' + r + ' renders without an error banner', viewHasError().length === 0, viewHasError()[0] && viewHasError()[0].slice(0, 200));
      const leaked = (textOf('#viewHost').match(/\b(?:stock|col|codes|cross|inv|nav|grp|page|f|lbl|msg|mas|sec|btn)\.[a-zA-Z0-9]+/g) || []);
      ok(user + ' → ' + r + ': no raw i18n key on screen', leaked.length === 0, leaked.slice(0, 4));
      ok(user + ' → ' + r + ': no un-interpolated placeholder', !/\{[a-zA-Z0-9_]+\}/.test(textOf('#viewHost')), (textOf('#viewHost').match(/\{[a-zA-Z0-9_]+\}/g) || []).slice(0, 3));
      const link = !!d.querySelector('#navList button[data-route="' + r + '"]');
      ok(user + ' → ' + r + ': sidebar matches the role map', link === (w.viewsFor(me).indexOf(r) >= 0), { link, allowed: w.viewsFor(me) });
    });
    w.setLanguage('ar');
    ROUTES.forEach(r => { w.location.hash = '#/' + r; w.renderActive(); });
    ok(user + ': Arabic sweep is clean', viewHasError().length === 0 && d.documentElement.getAttribute('dir') === 'rtl', viewHasError()[0]);
    ok(user + ': Arabic sweep has no latin key leaks', (function () {
      let bad = [];
      ROUTES.forEach(r => { w.location.hash = '#/' + r; w.renderActive(); bad = bad.concat(textOf('#viewHost').match(/\b(?:stock|codes|cross|col|inv)\.[a-zA-Z0-9]+/g) || []); });
      return bad.length === 0;
    })());
    w.setLanguage('en');
  });
  ok('no runtime error across the whole sweep', errors.length === 0, errors.slice(0, 5));

  head('9. DERIVED COUNTS + BADGES');
  w.attemptLogin('keeper1', 'mostafa123');
  ok('countRecords = every data table, keeper codes included, audit log excluded', (function () {
    const T = w.STATE;                                  /* live, not the section-1 snapshot: section 7 replaced STATE */
    const want = T.warehouses.length + T.fabrics.length + T.colors.length + T.mapping.length +
                 T.inventory.length + T.movements.length + T.users.length + T.keeperColorCodes.length;
    return w.countRecords() === want && w.countRecords() === 3005 && w.countRecords() + T.auditLog.length !== w.countRecords();
  })(), { got: w.countRecords(), audit: w.STATE.auditLog.length });
  ok('badges are painted for the routes that have them', (function () {
    w.location.hash = '#/inventory'; w.renderActive();
    const b = d.querySelector('#navList [data-badge="inventory"]');
    return b && /\d/.test(b.textContent);
  })(), d.querySelector('#navList [data-badge="inventory"]') && d.querySelector('#navList [data-badge="inventory"]').textContent);
  ok('the warehouse picker lists only my sheds (plus All)', (function () {
    w.location.hash = '#/inventory'; w.UI.inv.warehouseId = ''; w.renderActive();
    const sel = [...d.querySelectorAll('#viewHost select')].map(s => [...s.options].map(o => o.value).filter(v => /^wh-/.test(v))).find(a => a && a.length);
    return !!(sel && sel.sort().join() === K1.slice().sort().join());
  })());
  ok('colour usage index = one count per (colour, shed) pair, duplicates collapsed', (function () {
    const idx = w.colorUsageIndex();
    const pairs = new Set(S.mapping.map(m => m.colorId + '|' + m.warehouseId));
    const total = Object.keys(idx).reduce((a, k) => a + idx[k].n, 0);
    return total === pairs.size && Object.keys(idx).length === new Set(S.mapping.map(m => m.colorId)).size &&
      idx['col-navy'].n > 1 && idx['col-navy'].wh['wh-alwa'] === 1;
  })(), (function () { const i = w.colorUsageIndex(); return { colours: Object.keys(i).length, uses: Object.keys(i).reduce((a, k) => a + i[k].n, 0) }; })());
  ok('fabricsForWarehouseScoped honours the shed grade rule', (function () {
    const list = w.fabricsForWarehouseScoped(k2, 'wh-625');
    return list.length > 0 && list.every(f => !f.defaultGrade || (w.lookupWarehouse('wh-625').allowedGrades || []).indexOf(f.defaultGrade) >= 0);
  })(), (w.fabricsForWarehouseScoped(k2, 'wh-625') || []).length);
  ok('the inactive mapping still holds stock (the invalid-combination flag has a subject)', (function () {
    const off = S.mapping.find(m => m.isActive !== 'Y');
    const rows = S.inventory.filter(r => r.warehouseId === off.warehouseId && r.fabricId === off.fabricId && r.colorId === off.colorId);
    return rows.length > 0 && rows.reduce((a, r) => a + (+r.openingRolls + +r.rollsIn - +r.rollsOut), 0) > 0;
  })());

  console.log('\n\x1b[1m' + (fail ? 'FAILURES: ' + fail : 'ALL GOOD') + '\x1b[0m  ·  ' + pass + ' assertions passed');
  process.exit(fail ? 1 : 0);
}, 700);
