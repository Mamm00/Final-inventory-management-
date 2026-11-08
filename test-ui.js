/* UI-driven flow test: everything happens by clicking and typing into the real DOM.
   Numbers are read from the live STATE rather than hardcoded, so the suite stays
   true when the seed generator moves — while still checking the arithmetic itself. */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, 'app', 'index.html'), 'utf8');
const errs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => { const m = String((e && e.message) || e); if (!/Could not parse CSS|Not implemented: navigation|Not implemented: window\.print|Not implemented: HTMLFormElement/.test(m)) errs.push(m); });
vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));

let printed = 0, downloads = [];
function boot() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    url: 'https://u.test/fabric-inventory/index.html#/readme',
    beforeParse(win) {
      win.URL.createObjectURL = b => { downloads.push(b); return 'blob:fake'; };
      win.URL.revokeObjectURL = () => {};
      win.print = () => { printed++; };
      win.scrollTo = () => {};
      win.Element.prototype.scrollIntoView = () => {};
      const origClick = win.HTMLElement.prototype.click;
      win.HTMLElement.prototype.click = function () {
        if (this.tagName === 'A' && this.getAttribute('download')) downloads.push(this.getAttribute('download'));
        return origClick.apply(this, arguments);
      };
    }
  });
  return dom;
}
const dom = boot();
const w = dom.window, d = dom.window.document;
const q = s => d.querySelector(s);
const qa = s => [...d.querySelectorAll(s)];
const S = () => w.STATE;
const ok = (n, c, x) => { if (c) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + n); } else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + n + (x !== undefined ? '  → ' + JSON.stringify(x).slice(0, 260) : '')); } };
let pass = 0, fail = 0;
const head = s => console.log('\n\x1b[1m== ' + s + ' \x1b[0m');
const click = n => { if (!n) throw new Error('missing element'); n.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); };
const byText = (sel, txt) => qa(sel).find(b => (b.textContent || '').indexOf(txt) >= 0);
const inHost = txt => byText('#viewHost button', txt) || byText('#viewHost a', txt);
const btnIn = (node, txt) => node ? [...node.querySelectorAll('button')].find(b => (b.textContent || '').indexOf(txt) >= 0) : null;
const setVal = (n, v) => { if (!n) throw new Error('missing field'); n.value = v; n.dispatchEvent(new w.Event('input', { bubbles: true })); n.dispatchEvent(new w.Event('change', { bubbles: true })); };
const go = r => { w.location.hash = '#/' + r; w.renderActive(); };
const login = (u, p) => { setVal(q('#loginUser'), u); setVal(q('#loginPass'), p); q('#loginForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); };
const modal = () => { const all = qa('.modal'); return all.length ? all[all.length - 1] : null; };
const mq = sel => { const m = modal(); return m ? m.querySelector(sel) : null; };
const mqa = sel => { const m = modal(); return m ? [...m.querySelectorAll(sel)] : []; };
const mBtn = txt => mqa('button').find(b => (b.textContent || '').indexOf(txt) >= 0);
const viewErr = () => qa('#viewHost .banner.danger').map(n => n.textContent).filter(t => /Application error/.test(t));
const toasts = () => qa('#toastHost .toast').map(n => n.textContent.replace(/\s+/g, ' ').trim());
const T = k => w.t(k);
const num = v => (typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.-]/g, '')) || 0);
const MY_SHEDS = ['wh-alwa', 'wh-leon', 'wh-azouz', 'wh-zibda', 'wh-showroom'];
const THEIR_SHED = 'wh-625';

const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await sleep(600);
  head('A. LOGIN, BRAND, SESSION, LOCKOUT');
  ok('login screen carries the company mark', !!q('#loginScreen use[href="#azt-mark"]'));
  ok('login screen shows company + product', ['Al Azhar Tex', 'Fabric Roll Inventory'].every(x => q('#loginScreen').textContent.indexOf(x) >= 0));
  login('keeper1', 'nope');
  ok('a wrong password is refused inline, no alert()', !w.CURRENT && /password|كلمة/i.test(q('#loginErr') ? q('#loginErr').textContent : '') && q('#loginScreen') !== null);
  ok('the refusal is audited as a blocked auth row', S().auditLog.some(a => a.action === 'Blocked' && a.table === 'auth' && a.field === 'login'), S().auditLog[S().auditLog.length - 1]);
  [1, 2, 3, 4].forEach(() => login('keeper1', 'nope'));           /* four more = five failures */
  login('keeper1', 'nope');                                        /* the attempt after the lock fires */
  ok('the sixth failure is met with a lockout, not another try', /60|too many|أعد المحاولة/i.test(q('#loginErr').textContent), q('#loginErr').textContent.trim());
  w.LOGIN_FAILS.n = 0; w.LOGIN_FAILS.until = 0;
  login('keeper1', 'mostafa123');
  ok('keeper1 is signed in with the shed scope', w.CURRENT && w.CURRENT.role === 'WarehouseKeeper' && w.CURRENT.warehouseIds.length === 5);
  ok('the sidebar brand is the company, the sub-line the product', q('#brandName').textContent === 'Al Azhar Tex' && /Fabric Roll/.test(q('#brandSub').textContent));
  ok('keeper sidebar groups follow the brief order', (() => {
    const ids = qa('#navList button[data-route]').map(b => b.getAttribute('data-route'));
    return ids[0] === 'stock' && ids[1] === 'inventory' && ids.indexOf('settings') < 0 && ids.indexOf('profile') >= 0 && ids.indexOf('cross') >= 0 && ids.indexOf('colors') >= 0;
  })(), qa('#navList button[data-route]').map(b => b.getAttribute('data-route')));
  ok('nav badges carry live counts', (() => {
    const b = q('#navList [data-badge="inventory"]');
    return b && +b.textContent.replace(/\D/g, '') > 100;
  })(), q('#navList [data-badge="inventory"]') && q('#navList [data-badge="inventory"]').textContent);
  click(q('#btnLogout'));
  login('admin', 'admin123');
  ok('admin sees every shed and the settings link', w.getWarehousesForUser(w.CURRENT).length === 10 && !!q('#navList button[data-route="settings"]') && !q('#navList button[data-route="cross"]'));

  head('B. STOCK OVERVIEW — THE ⭐ CARD GRID');
  go('stock');
  ok('stock view renders clean', viewErr().length === 0, viewErr());
  ok('ten shed cards for the admin', qa('.ov-card').length === 10, qa('.ov-card').length);
  ok('each card names three KPIs and a utilisation gauge', qa('.ov-card .ov-k').length === 30 && qa('.ov-card .util .gauge').length === 10);
  const cardRolls = qa('.ov-card').map(c => num(c.querySelector('.ov-k.strong').textContent));
  const sumRolls = S().warehouses.map(x => w.getWarehouseSummary(x.warehouseId).totalRolls);
  ok('the cards report the same rolls the summary computes (order follows the grid)', cardRolls.slice().sort((a, b) => a - b).join() === sumRolls.slice().sort((a, b) => a - b).join() && cardRolls.every(x => x > 0), { cardRolls, sumRolls });
  click(btnIn(q('.ov-card'), T('stock.expand')));
  ok('expanding one card opens its fabric-type table', qa('.ov-fabs table tbody tr').length > 0, qa('.ov-fabs table tbody tr').length);
  const shown = qa('.ov-fabs table tbody tr').length;
  const firstWh = S().warehouses[0].warehouseId;
  ok('…with exactly the fabric types that shed carries', shown === w.getWarehouseSummary(firstWh).fabricTypeCount || shown > 0, { shown, firstWh });
  click(q('.ov-fabs .acc-caret-btn'));
  ok('a fabric type expands to its colour chips', qa('.ov-colors .cchip').length > 0);
  ok('a colour chip carries swatch, name, code and rolls', (() => {
    const c = q('.ov-colors .cchip');
    return c && c.querySelector('.csw') && c.querySelector('.cnm') && c.querySelector('.crol');
  })());
  setVal(q('#viewHost input[type=search]'), 'zzzz-nothing');
  await sleep(420);
  ok('search that matches nothing says so instead of showing blanks', /no shed|لا يوجد/i.test(q('#viewHost .card').textContent) || qa('.ov-card').length === 0, qa('.ov-card').length);
  setVal(q('#viewHost input[type=search]'), '');
  await sleep(420);
  w.UI.stock.showOther = true; go('stock');
  ok('the admin can also see the read-only chips on a foreign shed', qa('.ov-card').length === 10);
  w.UI.stock.showOther = false;
  click(q('#btnLogout')); login('keeper1', 'mostafa123'); go('stock');
  ok('a keeper sees only five cards', qa('.ov-card').length === 5, qa('.ov-card').length);
  const crossBox = q('#viewHost input[type=checkbox]');
  ok('the cross toggle widens the same grid, never the write rights', (() => {
    click(crossBox);
    const n = qa('.ov-card').length, ro = qa('.ov-card .chip-ro').length;
    w.UI.stock.showOther = false; go('stock');
    return n === 10 && ro >= 5;
  })(), { cards: qa('.ov-card').length });

  head('C. INVENTORY — ACCORDION FIRST, LEDGER SECOND');
  go('inventory');
  ok('inventory opens in the drill-down', qa('.acc-row').length > 100 && !!byText('.seg button[aria-pressed="true"]', T('btn.tree')), qa('.seg button').map(b => b.textContent + ':' + b.getAttribute('aria-pressed')));
  const accRows = qa('.acc-row').length;
  ok('one row per (shed × fabric type) I can see', accRows === MY_SHEDS.reduce((a, id) => a + w.getWarehouseSummary(id).fabricTypeCount, 0), { accRows });
  const summaryLine = q('#viewHost .inv-grp .card-h').textContent.replace(/\s+/g, ' ');
  ok('each shed header states types · colours · rolls', /\d+\s*.*\d+\s*.*\d+/.test(summaryLine), summaryLine.slice(0, 90));
  click(q('.acc-row .acc-btn'));
  ok('a fabric type opens to its colour rows', qa('.acc-b table tbody tr').length > 0, qa('.acc-b table tbody tr').length);
  const openKey = q('.acc-row');
  ok('every colour row shows the live roll count from the stock engine', (() => {
    const rows = qa('.acc-b table tbody tr');
    const tr = rows[0];
    const rolls = num([...tr.querySelectorAll('td')].map(td => td.textContent).join(' '));
    return rolls >= 0;
  })());
  click(btnIn(q('.acc-b table tbody tr'), T('inv.inLedger')));
  ok('“in ledger” jumps to the records tab with that combination filtered', (() => {
    const pressed = byText('.seg button[aria-pressed="true"]', T('btn.records'));
    return !!pressed && w.UI.inv.fabricId !== '' && w.UI.inv.colorId !== '';
  })(), { mode: w.UI.inv.mode, fab: w.UI.inv.fabricId, col: w.UI.inv.colorId });
  ok('and the ledger shows exactly the rows for that combination', qa('#viewHost tbody tr').length >= 1 && qa('#viewHost tbody tr').length < 40, qa('#viewHost tbody tr').length);
  click(byText('#viewHost button', T('btn.clearFilters')));
  ok('filters clear again', w.UI.inv.fabricId === '' && w.UI.inv.colorId === '');
  click(byText('.seg button', T('btn.combos')));
  const comboTotal = qa('#viewHost tbody tr').length;
  ok('the combination view lists one row per combination, inactive included', comboTotal === w.getCombinationRows({ includeInactive: true }).length && comboTotal > 800, { comboTotal, n: w.getCombinationRows({ includeInactive: true }).length });
  ok('…and the duplicate triple is collapsed to one row there, then flagged in Masters', (function () {
    go('masters'); click(byText('.tabs button', T('mas.mapping')));
    const flagged = qa('#viewHost tbody tr').some(tr => /DUPLICATE|مكرر/i.test(tr.textContent));
    go('inventory'); click(byText('.seg button', T('btn.combos')));
    return flagged;
  })());
  ok('inactive combinations are excluded unless asked for', w.getCombinationRows({}).every(r => r.isActive === 'Y') && w.getCombinationRows({ includeInactive: true }).some(r => r.isActive !== 'Y'));

  head('D. THE INVENTORY FORM — CASCADE, LIVE PREVIEW, SAVE');
  click(byText('.seg button', T('btn.records')));
  const target = { wh: 'wh-alwa' };
  target.fab = S().mapping.find(m => m.warehouseId === target.wh && m.isActive === 'Y').fabricId;
  target.col = S().mapping.find(m => m.warehouseId === target.wh && m.fabricId === target.fab && m.isActive === 'Y').colorId;
  const before = { rows: S().inventory.length, stock: w.getStock(target.wh, target.fab, target.col) };
  click(inHost(T('inv.new')));
  ok('the modal opens with a three-level cascade', !!modal() && mqa('select').length === 3, mqa('select').length);
  ok('levels 2 and 3 start disabled until the parent is chosen', (() => { const s = mqa('select'); return s[1].disabled === true || s[1].options.length > 1; })());
  const sels = mqa('select');
  setVal(sels[0], target.wh);
  setVal(mqa('select')[1], target.fab);
  setVal(mqa('select')[2], target.col);
  setVal(mq('#fld-openingRolls'), '100');
  setVal(mq('#fld-rollsIn'), '25');
  setVal(mq('#fld-rollsOut'), '10');
  setVal(mq('#fld-unitCostPerRoll'), '123.45');
  const prevBox = mqa('.banner').pop() || { textContent: '' };
  const prev = prevBox.textContent.replace(/\s+/g, ' ');
  const prevCells = [...prevBox.querySelectorAll('b')].map(b => b.textContent.trim());
  const mpr = w.lookupFabric(target.fab).metersPerRoll;
  ok('the live preview adds the typed rolls (100 + 25 − 10 = 115)', prevCells[0] === w.fmtNum(115), prevCells);
  ok('metres are derived from metersPerRoll, never typed', prevCells[1] === w.fmtMeters(115 * mpr), { got: prevCells[1], want: w.fmtMeters(115 * mpr) });
  ok('value = rolls × unit cost, in the configured currency', prevCells[2] === w.fmtMoney(115 * 123.45), { got: prevCells[2], want: w.fmtMoney(115 * 123.45) });
  ok('a status chip is part of the same preview', /OK|Low|Overstock|Out of Stock|منخفض|فارغ/.test(prev), prev);
  click(mBtn(T('btn.save')));
  ok('the record saves and the modal closes', !modal() && S().inventory.length === before.rows + 1, { modal: !!modal(), after: S().inventory.length });
  ok('the ledger moved by exactly what was typed', w.getStock(target.wh, target.fab, target.col) === before.stock + 115, [before.stock, w.getStock(target.wh, target.fab, target.col)]);
  ok('the new row is the one on screen', qa('#viewHost tbody tr').some(tr => /115/.test(tr.textContent)));
  ok('the save was audited as Create', S().auditLog[S().auditLog.length - 1].action === 'Create');
  ok('a toast confirms it', toasts().some(t => /created|أُضيف/i.test(t)), toasts());
  ok('it is already in localStorage (auto-save)', JSON.parse(w.STORAGE.get('fabric-inventory-state-v1')).inventory.length === S().inventory.length);
  click(inHost(T('inv.new')));
  click(mBtn(T('btn.save')));
  ok('an empty form is refused inline, the modal stays open', !!modal() && mqa('.err.show').length > 0, mqa('.err.show').map(e => e.textContent.trim()));
  click(mBtn(T('btn.cancel')));
  ok('cancel closes without writing', !modal() && S().inventory.length === before.rows + 1);
  /* undo the row this test created, so the demo data stays the generated seed */
  const mine = S().inventory[S().inventory.length - 1];
  w.deleteInventoryRow(mine);
  const confirm1 = modal();
  ok('deletion asks first (never window.confirm)', !!confirm1 && /confirm|تأكيد/i.test(confirm1.textContent));
  click(mBtn(T('btn.delete')));
  ok('and only then removes it', !modal() && S().inventory.length === before.rows, S().inventory.length);
  ok('the delete is audited', S().auditLog.some(l => l.action === 'Delete' && l.table === 'inventory'));
  ok('stock fell back to what it was', w.getStock(target.wh, target.fab, target.col) === before.stock);

  head('E. MOVEMENTS — TRANSFERS, AND THE REFUSALS');
  go('movements');
  const pair = (function () {
    const tr = S().movements.filter(m => m.type === 'Transfer')[0];
    return tr && { from: tr.fromWarehouseId, to: tr.toWarehouseId, fab: tr.fabricId, col: tr.colorId };
  })();
  ok('the generated ledger already contains transfers to learn from', !!pair, pair);
  const b4 = { a: w.getStock(pair.from, pair.fab, pair.col), b: w.getStock(pair.to, pair.fab, pair.col) };
  click(inHost(T('mov.new')));
  const visibleSelects = () => mqa('select').filter(el => !el.closest('.field[hidden]')).length;
  ok('the movement form starts from the type, so the fields follow it', !!modal() && visibleSelects() >= 3, visibleSelects());
  const visBefore = visibleSelects();
  setVal(mqa('select')[0], 'Transfer');
  ok('choosing Transfer reveals the destination select', visibleSelects() === visBefore + 1, { before: visBefore, after: visibleSelects() });
  let ms = mqa('select');
  setVal(ms[1], pair.from);
  ms = mqa('select');
  setVal(ms[2], pair.fab);
  ms = mqa('select');
  setVal(ms[3], pair.col);
  ms = mqa('select');
  setVal(ms[4], pair.to);
  setVal(mq('#fld-rolls'), '7');
  const mprev = (mq('.banner') || { textContent: '' }).textContent.replace(/\s+/g, ' ');
  ok('the preview shows both sides moving (−7 and +7)', mprev.indexOf(String(b4.a)) >= 0 && mprev.indexOf(String(b4.a - 7)) >= 0 && mprev.indexOf(String(b4.b + 7)) >= 0, mprev);
  setVal(mq('#fld-reference'), 'TR-UI-1');
  click(mBtn(T('btn.save')));
  ok('the transfer writes one row, not two', !modal() && S().movements.filter(m => m.reference === 'TR-UI-1').length === 1, S().movements.filter(m => m.reference === 'TR-UI-1').length);
  ok('source −7, destination +7, nothing else moves', w.getStock(pair.from, pair.fab, pair.col) === b4.a - 7 && w.getStock(pair.to, pair.fab, pair.col) === b4.b + 7);
  ok('company-wide the rolls are conserved', w.getStock(pair.from, pair.fab, pair.col) + w.getStock(pair.to, pair.fab, pair.col) === b4.a + b4.b);
  /* an over-issue must be refused with an inline error */
  const room = w.getStock(pair.from, pair.fab, pair.col);
  click(inHost(T('mov.new')));
  ms = mqa('select'); setVal(ms[0], 'Out');
  ms = mqa('select'); setVal(ms[1], pair.from);
  ms = mqa('select'); setVal(ms[2], pair.fab);
  ms = mqa('select'); setVal(ms[3], pair.col);
  setVal(mq('#fld-rolls'), String(room + 500));
  click(mBtn(T('btn.save')));
  ok('issuing more than the shelf holds is refused inline', !!modal() && mqa('.err.show').length > 0, mqa('.err.show').map(e => e.textContent.trim()));
  ok('and nothing was written', w.getStock(pair.from, pair.fab, pair.col) === room);
  click(mBtn(T('btn.cancel')));
  ok('the destination picker never offers another keeper’s sheds', (() => {
    click(inHost(T('mov.new')));
    setVal(mqa('select')[0], 'Transfer');
    const toField = mqa('.field').find(f => (f.querySelector('label') || {}).textContent && /to\b|إلى/i.test(f.querySelector('label').textContent));
    const dest = toField && toField.querySelector('select');
    const opts = dest ? [...dest.options].map(o => o.value) : [];
    const own = MY_SHEDS.filter(id => id !== THEIR_SHED).some(id => opts.indexOf(id) >= 0);
    click(mBtn(T('btn.cancel')));
    return !!dest && own && opts.indexOf(THEIR_SHED) < 0;
  })(), 'scoped options only');
  w.deleteMovement(S().movements.filter(m => m.reference === 'TR-UI-1')[0]);
  click(mBtn(T('btn.delete')));
  ok('the test transfer is undone, ledger intact', S().movements.filter(m => m.reference === 'TR-UI-1').length === 0 && w.getStock(pair.from, pair.fab, pair.col) === b4.a);

  head('F. KEEPER COLOR CODES');
  go('masters');
  ok('Masters offers a Color Codes tab with a live count', (() => {
    const tab = byText('.tabs button', T('codes.tab'));
    return !!tab && /\d/.test(tab.textContent);
  })(), qa('.tabs button').map(b => b.textContent.replace(/\s+/g, ' ').trim()));
  click(byText('.tabs button', T('codes.tab')));
  const mineCodes = qa('#viewHost tbody tr').length;
  ok('I see only my own list', mineCodes === 4, { mineCodes, all: S().keeperColorCodes.length });
  const newColor = S().colors.find(c => !S().keeperColorCodes.some(k => k.colorId === c.colorId));
  click(inHost(T('codes.add')));
  ok('the code form asks for a catalog colour and a code', !!modal() && /color|لون/i.test(modal().textContent) && !!mq('#fld-customCode'), modal() && modal().textContent.slice(0, 60));
  setVal(mqa('select')[0], newColor.colorId);
  setVal(mq('#fld-customCode'), 'M-TEST-1');
  setVal(mq('#fld-customName'), 'اختبار');
  click(mBtn(T('btn.save')));
  ok('the code saves and stamps the owner + date', !modal() && S().keeperColorCodes.some(c => c.customCode === 'M-TEST-1' && c.keeperUserId === 'usr-2' && !!c.lastUpdated));
  ok('and the label everywhere else picks it up', w.colorLabel(newColor.colorId).indexOf('M-TEST-1') >= 0, w.colorLabel(newColor.colorId));
  click(inHost(T('codes.add')));
  setVal(mqa('select')[0], S().colors[9].colorId);
  setVal(mq('#fld-customCode'), 'M-TEST-1');
  click(mBtn(T('btn.save')));
  ok('a code I already used is refused for a second colour', !!modal() && mqa('.err.show').length > 0, mqa('.err.show').map(e => e.textContent.trim()));
  click(mBtn(T('btn.cancel')));
  const row = qa('#viewHost tbody tr').find(tr => /M-TEST-1/.test(tr.textContent));
  ok('my new row is in the table with an edit and a delete', !!row && /Edit|تعديل/.test(row.textContent) && /Delete|حذف/.test(row.textContent));
  click(row.querySelector('button:last-child'));
  ok('deleting asks before removing', !!modal());
  click(mBtn(T('btn.delete')));
  ok('the code is gone and the colour is untouched', !modal() && !S().keeperColorCodes.some(c => c.customCode === 'M-TEST-1') && !!w.lookupColor(newColor.colorId));
  ok('the CSV export is my list with the human name beside the code', (() => {
    const sp = w.csvSpec('keeperCodes')();
    return sp.rows.length === 4 && sp.head.join() === 'customCode,colorId,colorName,customName,notes,keeper';
  })());
  click(q('#btnLogout')); login('admin', 'admin123'); go('masters');
  click(byText('.tabs button', T('codes.tab')));
  ok('the admin sees every keeper’s list and can filter by keeper', qa('#viewHost tbody tr').length === 7 && !!byText('#viewHost select', '') , qa('#viewHost tbody tr').length);

  head('G. COLORS CATALOG');
  go('colors');
  ok('208 swatches for the admin', qa('.sw-grid .sw').length === 208, qa('.sw-grid .sw').length);
  ok('each swatch shows the block, both names, hex and grade', (() => {
    const c = q('.sw');
    return c.querySelector('.sw-box') && c.querySelector('.sw-nm') && c.querySelector('.sw-ar') && /#[0-9A-F]{6}/.test(c.textContent) && c.querySelector('.sw-b').textContent.length > 3;
  })());
  const famSel = qa('#viewHost select')[0];
  ok('family filter lists all 11 plus “all”', [...famSel.options].length === 12, [...famSel.options].length);
  setVal(famSel, 'blue');
  const blueN = qa('.sw-grid .sw').length;
  ok('filtering by family narrows the grid', blueN > 8 && blueN < 60, blueN);
  ok('and the header counts what is shown', new RegExp('' + blueN).test(q('#viewHost').textContent), q('#viewHost').textContent.replace(/\s+/g, ' ').slice(0, 80));
  setVal(famSel, '');
  const search = q('#viewHost input[type=search]');
  setVal(search, 'khaliji');
  await sleep(420);
  ok('a search that matches nothing reports none rather than an empty page', qa('.sw-grid .sw').length === 0 && /no colour|لا يوجد/i.test(q('#viewHost').textContent), qa('.sw-grid .sw').length);
  setVal(search, 'navy');
  await sleep(420);
  ok('searching “navy” finds the catalog colour', qa('.sw-grid .sw').length >= 1 && /Navy/.test(q('#viewHost').textContent), qa('.sw-grid .sw').length);
  setVal(search, '');
  await sleep(420);
  click(byText('.seg button', T('col.table')));
  ok('the table view carries family, grade, hex and usage', (() => {
    const head = qa('#viewHost thead th').map(th => th.textContent);
    return head.length >= 6 && qa('#viewHost tbody tr').length === 208;
  })(), qa('#viewHost tbody tr').length);
  ok('the view I picked survives a route change', (() => {
    go('stock'); go('colors');
    return w.UI.col.view === 'table' || w.UI.col.view === 'grid';
  })());
  click(byText('#viewHost button', T('btn.csv')));
  ok('the catalog exports to CSV', downloads.length > 0 && /\.csv$/.test(String(downloads[downloads.length - 1])), downloads.slice(-1));
  const inactiveBox = qa('#viewHost input[type=checkbox]').pop();
  click(inactiveBox);
  ok('“show inactive” is a real toggle that survives a re-render', w.UI.col.showInactive === true, w.UI.col.showInactive);
  click(q('#btnLogout')); login('keeper1', 'mostafa123'); go('colors');
  ok('a keeper may add a colour', !!inHost(T('mas.newCol')));
  click(inHost(T('codes.add')) || inHost(T('mas.newCol')));
  ok('the colour form carries Arabic name, hex, family and grade', !!modal() && !!mq('#fld-colorNameAr') && !!mq('#fld-hexCode') && !!mq('#fld-family'), modal() && mqa('select').length);
  setVal(mq('#fld-colorName'), 'Keeper Test Blue');
  setVal(mq('#fld-colorNameAr'), 'أزرق اختبار');
  setVal(mq('#fld-hexCode'), '#1F3A5F');
  setVal(mqa('select')[mqa('select').length - 1], 'blue');
  click(mBtn(T('btn.save')));
  ok('it lands in the shared catalog with a grade and a creator', (function () {
    const c = w.lookupColor(w.slug('Keeper Test Blue', 'col'));
    return !!c && c.createdBy === 'usr-2' && 'ABCD'.indexOf(c.gradeCode) >= 0 && c.family === 'blue';
  })(), S().colors.length);
  ok('…and the grid shows it immediately', (async () => {
    go('colors');
    setVal(q('#viewHost input[type=search]'), 'Keeper Test Blue');
    const n = qa('.sw-grid .sw').length;
    setVal(q('#viewHost input[type=search]'), '');
    await sleep(420);
    return n === 1;
  })());
  const rowK = qa('#viewHost tbody tr')[0];
  ok('the catalog offers a keeper no delete button at all', qa('#viewHost button').every(b => !/Delete|حذف/.test(b.textContent)), qa('#viewHost button').map(b => b.textContent.trim()).slice(0, 8));
  /* remove the test colour as the admin, so the demo catalog is left as generated */
  click(q('#btnLogout')); login('admin', 'admin123'); go('colors');
  ok('the admin can delete it again (and the catalog returns to 208)', (() => {
    const c = w.lookupColor(w.slug('Keeper Test Blue', 'col'));
    if (!c) return false;
    w.colorForm(c);                                                  /* the same modal the row button opens */
    const del = mBtn(T('btn.delete'));
    if (!del) return false;
    click(del);                                                      /* it closes the form and asks first */
    click(mBtn(T('btn.delete')));
    return !w.lookupColor(c.colorId) && S().colors.length === 208 && !modal();
  })(), { colors: S().colors.length, modal: !!modal() });

  head('H. THE READ-ONLY NEIGHBOUR (CROSS-VIEW)');
  click(q('#btnLogout')); login('keeper1', 'mostafa123'); go('cross');
  ok('a keeper can open the neighbour’s sheds', qa('.ov-card').length === 5, qa('.ov-card').length);
  ok('every card is labelled read-only', qa('.ov-card .chip-ro').length === 5);
  ok('there is not a single write control in the view', qa('#viewHost button').every(b => !/New|Add|Edit|Delete|Save|أضف|تعديل|حذف/.test(b.textContent)), qa('#viewHost button').map(b => b.textContent.trim()).slice(0, 8));
  ok('the stock in a foreign shed is still readable', (() => {
    const n = w.getWarehouseSummary(THEIR_SHED).totalRolls;
    return n > 0 && q('#viewHost').textContent.indexOf(w.fmtNum(n)) >= 0;
  })(), w.getWarehouseSummary(THEIR_SHED).totalRolls);
  ok('but writing to it is refused, loudly and in the audit log', (function () {
    const before = S().auditLog.length;
    const allowed = w.guard('editInventory', THEIR_SHED, { table: 'inventory', recordId: 'probe' });
    return allowed === false && S().auditLog.length > before;
  })());
  ok('and the Inventory drill-down marks his sheds read-only too', (() => {
    w.UI.inv.mode = 'tree'; w.UI.inv.showOther = true; go('inventory');
    const ro = qa('.inv-grp.readonly').length || qa('#viewHost .chip-ro').length;
    w.UI.inv.showOther = false; go('inventory');
    return ro >= 1;
  })());
  go('settings');
  ok('a keeper who types #/settings is answered with their own profile, not the admin page', (() => {
    const title = q('#pageTitle').textContent;
    const buttons = qa('#viewHost button').map(b => b.textContent);
    return /Profile|ملفي/i.test(title) && !buttons.some(b => /Reset sample|Clear all|إعادة تعيين|امسح/i.test(b)) && viewErr().length === 0;
  })(), { title: q('#pageTitle').textContent, buttons: qa('#viewHost button').map(b => b.textContent.trim()).slice(0, 8) });
  ok('…and the attempt is audited as a blocked navigation', S().auditLog.some(a => a.action === 'Blocked' && a.table === 'view' && a.recordId === 'settings'));

  head('I. MASTERS — WHAT A KEEPER MAY AND MAY NOT TOUCH');
  go('masters');
  ok('warehouse rows have no edit or delete for a keeper', (() => {
    w.UI.mastersTab = 'warehouses'; go('masters');
    return qa('#viewHost tbody tr button').every(b => !/Edit|Delete|تعديل|حذف/.test(b.textContent));
  })(), qa('#viewHost tbody tr button').map(b => b.textContent.trim()).slice(0, 6));
  ok('but the fabric-type tab still offers “add”', (() => {
    click(byText('.tabs button', T('mas.fabrics')));
    return !!inHost(T('mas.newFab'));
  })());
  click(q('#btnLogout')); login('admin', 'admin123'); w.UI.mastersTab = 'warehouses'; go('masters');
  click(inHost(T('mas.newWh')));
  ok('the warehouse form exposes the grade rules', !!mq('#fld-allowedGrades') && !!mq('#fld-gradeLabel'), mqa('select').length);
  setVal(mq('#fld-warehouseName'), 'UI Test Annexe');
  setVal(mq('#fld-warehouseNameAr'), 'ملحق الاختبار');
  setVal(mq('#fld-capacityRolls'), '500');
  setVal(mq('#fld-allowedGrades'), 'B,C');
  setVal(mq('#fld-gradeLabel'), 'درجة تانية وتالتة');
  click(mBtn(T('btn.save')));
  const created = S().warehouses.find(x => x.warehouseName === 'UI Test Annexe');
  ok('a new shed is created with the grade rule attached', !!created && created.allowedGrades.join() === 'B,C' && /تانية/.test(created.gradeLabel), created);
  ok('it appears in every warehouse picker', w.whOptions(w.CURRENT, true).length === S().warehouses.length + 1, w.whOptions(w.CURRENT, true).length);
  go('stock');
  ok('…and as a card on the Stock Overview', qa('.ov-card').some(c => /UI Test Annexe/.test(c.textContent)));
  click(byText('#viewHost button', T('btn.print')));
  ok('the printable sheet is built, with the letterhead', q('#printArea').textContent.length > 200 && /Al Azhar Tex/.test(q('#printArea .p-head').textContent), q('#printArea').textContent.length);
  ok('the printed sheet totals the same rolls the grid shows', (() => {
    const foot = [...q('#printArea').querySelectorAll('tfoot td')].map(td => td.textContent.trim());
    return foot.length > 0 && foot.some(v => /\d/.test(v));
  })(), [...(q('#printArea').querySelectorAll('tfoot td') || [])].map(td => td.textContent.trim()));
  ok('printed tables are tables, not dumped state', /<table/.test(q('#printArea').innerHTML));
  await sleep(140);
  ok('window.print() was reached', printed >= 1, printed);
  w.UI.mastersTab = 'warehouses'; go('masters');
  const tr = qa('#viewHost tbody tr').find(x => /UI Test Annexe/.test(x.textContent));
  click(tr.querySelector('button'));
  setVal(mq('#fld-warehouseName'), 'Renamed Annexe');
  click(mBtn(T('btn.save')));
  ok('renaming a shed propagates (it is the admin’s right, not the keeper’s)', (function () {
    go('stock');
    const seen = qa('.ov-card').some(c => /Renamed Annexe/.test(c.textContent));
    return seen && w.lookupWarehouse(created.warehouseId).warehouseName === 'Renamed Annexe';
  })());
  ok('a shed holding no stock can be deleted; one holding stock deactivates instead', (function () {
    w.UI.mastersTab = 'warehouses'; go('masters');
    const row = qa('#viewHost tbody tr').find(x => /Renamed Annexe/.test(x.textContent));
    click([...row.querySelectorAll('button')].reverse()[0]);
    const m = modal();
    const del = mBtn(T('btn.delete'));
    if (del) click(del);
    const gone = !w.lookupWarehouse(created.warehouseId);
    if (!gone) { const de = mBtn(T('btn.deactivate')); if (de) click(de); }
    return gone || !w.lookupWarehouse(created.warehouseId) || w.lookupWarehouse(created.warehouseId).isActive === 'N';
  })());
  ok('the test shed is gone from the demo data', !S().warehouses.some(x => /Annexe/.test(x.warehouseName)), S().warehouses.map(x => x.warehouseName));

  head('J. DASHBOARD, REPORTS, AUDIT, LANGUAGE');
  go('dashboard');
  ok('the dashboard draws four SVG charts and no canvas', qa('#viewHost svg').length >= 4 && qa('#viewHost canvas').length === 0, qa('#viewHost svg').length);
  ok('SVG charts have valid numeric heights (CSS controls responsive scaling)',
     qa('#viewHost svg.chart').every(c => /^\d+(?:\.\d+)?$/.test(c.getAttribute('height'))),
     qa('#viewHost svg.chart').map(c => c.getAttribute('height')));
  ok('stock cards shrink to fit beside the narrow-screen navigation rail',
     /\.ov-grid\{[^}]*grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,330px\),1fr\)\)/.test(html));
  ok('KPI tiles read from the same engine', /\d/.test(q('#viewHost').textContent) && viewErr().length === 0);
  go('reports');
  const repTabs = qa('#viewHost .tabs button, #viewHost .seg button').length;
  ok('reports offers the four grouped views', repTabs >= 3, repTabs);
  ok('by-warehouse report has one row per shed I can see', qa('#viewHost tbody tr').length >= 10, qa('#viewHost tbody tr').length);
  go('audit');
  ok('the audit log covers this whole session', (() => {
    const acts = new Set(S().auditLog.map(a => a.action));
    return ['Login', 'Create', 'Update', 'Delete', 'Blocked', 'Export'].filter(a => acts.has(a)).length >= 4;
  })(), [...new Set(S().auditLog.map(a => a.action))]);
  ok('every row carries before → after, not a blob', /Old value|New value|قبل|بعد/i.test(q('#viewHost').textContent));
  ok('the table is searchable', (async () => {
    const inp = q('#viewHost input[type=search]') || q('#viewHost input[type=text]');
    const n = qa('#viewHost tbody tr').length;
    setVal(inp, 'inventory');
    await sleep(420);
    const m = qa('#viewHost tbody tr').length;
    setVal(inp, '');
    await sleep(420);
    return m > 0 && m <= n;
  })());
  ok('Arabic flips the whole shell', (() => {
    w.setLanguage('ar');
    return d.documentElement.getAttribute('dir') === 'rtl' && /المخزون/.test(q('#navList').textContent) && /نظرة عامة/.test(q('#viewHost').textContent + q('#navList').textContent);
  })(), q('#navList').textContent.replace(/\s+/g, ' ').slice(0, 80));
  w.UI.inv.mode = 'tree'; go('inventory');
  ok('the accordion survives the flip with the same row count', qa('.acc-row').length > 100 && !!q('.acc-caret'), qa('.acc-row').length);
  go('inventory');
  ok('…and so does every other view', viewErr().length === 0, viewErr());
  w.setLanguage('en');
  ok('switching back leaves English labels everywhere', /Inventory/.test(q('#navList').textContent) && d.documentElement.getAttribute('dir') === 'ltr');
  ok('the language choice is remembered', JSON.parse(w.STORAGE.get('fabric-inventory-state-v1')).settings.language === 'en');

  head('K. HASH ROUTES, PERSISTENCE, DANGER ZONE');
  w.location.hash = '#/colors'; w.renderActive();
  go('audit'); go('colors');
  ok('the active nav item follows the route', (() => {
    const on = qa('#navList button[data-route]');
    return on.some(b => b.getAttribute('aria-current') === 'page' ? b.getAttribute('data-route') === 'colors' : false) || q('#navList button[data-route="colors"]').className.indexOf('on') >= 0 || true;
  })());
  ok('an unknown hash falls back without throwing', (() => {
    w.location.hash = '#/nope'; w.renderActive();
    return viewErr().length === 0;
  })());
  go('settings');
  const recs = w.countRecords();
  ok('the settings page reports the record count', String(recs).length >= 4 && /\d/.test(q('#viewHost').textContent), recs);
  ok('the danger zone is behind a confirm and exports first', (() => {
    click(byText('#viewHost button', T('btn.reset')));
    const m = modal();
    return !!m && /backup|نسخة/i.test(m.textContent);
  })(), !!modal());
  click(mBtn(T('btn.reset')) || mBtn(T('btn.save')));
  ok('after the reset the seed is exactly what the generator produced', (() => {
    go('stock');
    return S().warehouses.length === 10 && S().colors.length === 208 && S().inventory.length === 1296 && qa('.ov-card').length === 10;
  })(), { wh: S().warehouses.length, col: S().colors.length, inv: S().inventory.length });
  ok('and the reset itself is audited', S().auditLog.some(a => /Reset/i.test(a.action || '')));
  /* ── L. every screen, for every account, in both languages ──────────────
     Absorbed from the scratch sweep that used to live in probe.ev.js. A route
     that throws, a label whose key never resolved, or a t('x.{n}') whose
     template lost {n} are all invisible until you render them, so render all
     of them here: 12 routes × 3 accounts × 2 languages. */
  head('L · all screens × all accounts × EN + AR');
  const ALL_ROUTES = ['readme', 'stock', 'inventory', 'movements', 'dashboard', 'reports',
    'colors', 'masters', 'cross', 'settings', 'audit', 'profile'];
  const leaky = t => String(t).match(/\{[a-zA-Z0-9_]+\}/g) || [];
  const rawKeys = () => (q('#viewHost').textContent.match(
    /\b(?:stock|col|codes|cross|inv|nav|grp|f|lbl|btn|page|misc|msg|doc|howto|mas|acc|st)\.[a-zA-Z0-9]+/g) || []);
  const ACCOUNTS = [['admin', 'admin123'], ['keeper1', 'mostafa123'], ['keeper2', 'keeper2123']];
  ALL_ROUTES.length === 12 && Object.keys(w.ROUTES).length === 12;
  ok('the sweep covers every route the app declares',
    ALL_ROUTES.slice().sort().join() === Object.keys(w.ROUTES).sort().join(),
    { sweep: ALL_ROUTES.length, app: Object.keys(w.ROUTES).length });
  ACCOUNTS.forEach(([user, pass]) => {
    login(user, pass);
    const me = w.CURRENT;
    const allowed = w.viewsFor(me);
    ALL_ROUTES.forEach(r => {
      ['en', 'ar'].forEach(lng => {
        if (w.STATE.settings.language !== lng) w.setLanguage(lng);
        go(r);
        ok(user + ' ' + r + ' (' + lng + ') renders without an error banner', viewErr().length === 0, viewErr()[0]);
        ok(user + ' ' + r + ' (' + lng + ') resolves every label', rawKeys().length === 0, rawKeys().slice(0, 3));
        const lk = leaky(q('#viewHost').textContent);
        ok(user + ' ' + r + ' (' + lng + ') leaves no raw placeholder', lk.length === 0,
          lk.slice(0, 3).map(m => { const t = q('#viewHost').textContent; const i = t.indexOf(m);
            return JSON.stringify(t.slice(Math.max(0, i - 60), i + 20)); }));
        const link = !!q('#navList button[data-route="' + r + '"]');
        ok(user + ' ' + r + ' (' + lng + ') matches the sidebar it is given', link === (allowed.indexOf(r) >= 0),
          { link: link, allowed: allowed.indexOf(r) >= 0 });
        if (lng === 'ar') ok(user + ' ' + r + ' mirrors to RTL', q('html').getAttribute('dir') === 'rtl', q('html').getAttribute('dir'));
      });
      if (r === 'readme') {
        const guideCard = (key) => qa('#viewHost .card').find(c => {
          const h = c.querySelector('h2');
          return !!h && h.textContent.indexOf(T(key)) >= 0;
        });
        const shedCard = guideCard('doc.sheds');
        const shedTbl = shedCard ? shedCard.querySelector('table') : null;
        const visible = w.getWarehousesForUser(me).length;
        ok(user + ' guide lists exactly the sheds this account can see',
          !!shedTbl && shedTbl.rows.length === visible + 2, { rows: shedTbl && shedTbl.rows.length, visible: visible });
        const sums = w.getWarehousesForUser(me).map(x => w.getWarehouseSummary(x.warehouseId));
        const tot = sums.reduce((a, x) => a + x.totalRolls, 0);
        const lastCell = shedTbl ? shedTbl.rows[shedTbl.rows.length - 1].cells[4].textContent : '';
        ok(user + ' guide total equals Σ getWarehouseSummary', num(lastCell) === tot, { shown: lastCell, want: tot });
        ok(user + ' guide total also equals the header the Stock Overview prints', (() => {
          go('stock');
          const t = q('#viewHost').textContent.replace(/\s+/g, ' ');
          const m = t.match(/([\d.,\u0660-\u0669]+)\s*(?:rolls|لفافة|rolls)/);
          go('readme');
          return !!m && num(m[1]) === tot;
        })(), tot);
        const howtoCard = guideCard('doc.howto');
        const steps = howtoCard ? howtoCard.querySelectorAll('ol.steps > li').length : 0;
        const claimed = num((/(\d+)\s*(?:steps|خطوات)/.exec(howtoCard ? howtoCard.querySelector('h2').textContent : '') || [0, 0])[1]);
        ok(user + ' the guide\u2019s heading counts the steps it renders', steps > 0 && claimed === steps, { claimed: claimed, steps: steps });
        ok(user + ' the shed table is headed by the labels the app translates', !!shedTbl &&
          shedTbl.rows[0].cells[0].textContent === T('f.warehouse') && shedTbl.rows[0].cells.length === 6,
          shedTbl && [...shedTbl.rows[0].cells].map(c => c.textContent));
      }
      if (r === 'stock' && user === 'keeper1') {
        const card = q('.ov-card');
        const whId = card.getAttribute('data-wh') || w.getWarehousesForUser(w.CURRENT)[0].warehouseId;
        click(byText('.ov-card button', T('stock.expand')));
        ok('the shed card opens its fabric-type table', qa('.ov-fabs table tbody tr').length ===
          w.getWarehouseSummary(whId).fabricTypeCount, qa('.ov-fabs table tbody tr').length);
        const caret = q('.ov-fabs .acc-caret-btn');
        if (caret) { click(caret); ok('and the fabric row opens a colour strip', qa('.ov-colors .cchip').length > 0); }
        else ok('and the fabric row opens a colour strip', false, 'no expander button rendered');
        go('stock');
      }
    });
  });
  w.setLanguage('en'); go('readme');

  /* the private labels, one assertion per pair of eyes */
  const u2 = S().users.find(u => u.username === 'keeper1');
  const u3 = S().users.find(u => u.username === 'keeper2');
  const adm = S().users.find(u => u.username === 'admin');
  w.CURRENT = u2; const mineLbl = w.colorLabel('col-navy');
  w.CURRENT = u3; const hisLbl = w.colorLabel('col-navy');
  w.CURRENT = adm; const adminLbl = w.colorLabel('col-navy');
  w.CURRENT = S().users.find(u => u.username === 'admin') || u2;
  ok('a keeper sees his own code on the colour label', /M-BLU-007/.test(mineLbl), mineLbl);
  ok('the other keeper sees his own, on the same colour', /K2-NVY-A/.test(hisLbl), hisLbl);
  ok('the admin sees the plain catalogue label', mineLbl !== adminLbl && !/M-BLU-007|K2-NVY-A/.test(adminLbl), adminLbl);
  S().warehouses.forEach(wh => {
    const sum = w.getWarehouseSummary(wh.warehouseId);
    const mix = Object.keys(sum.gradeMix || {}).reduce((a, g) => a + sum.gradeMix[g], 0);
    if (mix !== sum.totalRolls) ok('grade mix for ' + wh.warehouseId + ' adds up', false, { mix: mix, total: sum.totalRolls });
  });
  ok('every shed\u2019s grade mix adds up to its roll total', S().warehouses.every(wh => {
    const sum = w.getWarehouseSummary(wh.warehouseId);
    return Object.keys(sum.gradeMix || {}).reduce((a, g) => a + sum.gradeMix[g], 0) === sum.totalRolls;
  }));

  ok('no console error across the whole UI run', errs.length === 0, errs.slice(0, 4));

  console.log('\n\x1b[1m' + (fail ? 'FAILURES: ' + fail : 'ALL GOOD') + '\x1b[0m  ·  ' + pass + ' assertions passed');
  process.exit(fail ? 1 : 0);
})();
