# Al Azhar Tex · Fabric Roll Inventory — the working guide

Single-file HTML app for a fabric merchant's rolls: **Warehouse → Fabric type → Colour → Roll**.
Everything below is written against this build (**v1.2.0**, schema **v2**) and every number in it is
produced from the seed generator and the same functions the screens call — `test.js` re-derives the
figures in this file from `src/app.src.html`, so a stale claim fails the build rather than shipping.

Arabic UI labels are quoted as the app shows them.

---

## 1. Deploy to GitHub Pages (5 steps)

1. Create the repo (private is fine while testing).
2. Copy the **contents of `app/`** into the root of branch `main`: `index.html`, `README.md`,
   `404.html`, `.nojekyll` (`logo.svg` optional). The app is one file with no external requests.
3. `Settings → Pages → Source: Deploy from a branch → main / (root) → Save`.
4. Wait ~60 s, open `https://<username>.github.io/<repo>/`.
5. Sign in with `admin / admin123` and change the password in **Settings → Users** immediately.

Run it locally instead — any static server works, and `file://` works too (localStorage is then
unavailable, so the app says so in a banner and keeps the session in memory):

```bash
python3 tools/serve.py app 8080      # → http://localhost:8080
python3 tools/serve.py               # serves site/ on :8080, with Pages' 404 behaviour
# or:  cd app && python3 -m http.server 8080
```

For a repo that publishes only the built site, `python3 tools/zip_release.py --pages` writes
`al-azhar-tex-pages-<version>.zip` — the contents of `site/` at the root of one folder, plus
`DEPLOY.md`. Seven files: `index.html`, `404.html`, `.nojekyll`, `logo.svg`, `app/index.html`,
`app/README.md`, `DEPLOY.md`. Nothing to build after unzipping, and the tool refuses to package a
`site/` that disagrees with its sources.

---

## 2. Sign in — three accounts, two of them keepers

| Username | Password | Who | Their sheds | What they may do |
|---|---|---|---|---|
| `admin` | `admin123` | **Admin** — Ayaan Qureshi | *(no scope = all 10)* | everything: masters, stock, movements, users, settings, deletes, the shared catalogue, and every keeper's colour codes |
| `keeper1` | `mostafa123` | **Warehouse Keeper** — Mostafa | `wh-alwa`, `wh-leon`, `wh-azouz`, `wh-zibda`, `wh-showroom` | full add/edit/delete inside those five sheds, their own mapping rows, and their own colour codes |
| `keeper2` | `keeper2123` | **Warehouse Keeper** | `wh-625`, `wh-magdy`, `wh-wahman`, `wh-lycra`, `wh-kashry` | the same, inside *their* five sheds |

* A keeper's warehouse dropdown never lists a shed they do not own — the options are built from
  `whOptions(CURRENT, …)`, and `guard()` re-checks on save, so an edited request is refused and
  audited as `Blocked`.
* Both keepers may **look** at the colleague's sheds read-only (**Cross-View / مخزن زميل**) — no edit,
  no add, no delete, no export of anything they cannot see. `VIEWS_READONLY`
  (`readme · stock · inventory · movements · dashboard · reports · colors · audit`) is applied there.
* A **transfer** may be addressed *to* a shed the sender does not own (the receiving team books the
  inward leg); the *From* shed is always their own.
* Keepers never see Settings: `#/settings` lands them on **My Profile**, read-only.
* Every login attempt (pass or fail) and every blocked action is an audit row. A wrong password and
  an unknown username answer identically; 5 failures in a row trigger a 60-second lockout.

There is **no sales-manager role** in this model. `role.SalesManager` survives only as a translation
key so an old JSON backup still prints a readable role name; a restored file whose user carries that
role is treated as a read-only visitor until an Admin re-assigns them.

---

## 3. The model, in the words the floor uses

```
Warehouse (مخزن / عرض)  →  Fabric type (قماش)  →  Colour (لون)  →  Roll (متر/بكرة)
```

* **10 sheds.** Five are Mostafa's — `Alwa`, `Leon`, `Azouz`, `Zibda` and the **Showroom** (الصالون
  العرضي), where a customer buys a few metres off a roll. Five belong to the second keeper —
  **`625`**, `Magdy`, `Wahman`, `Lycra`, `Kashry`. Each shed declares `allowedGrades` (`A`–`D`) and a
  bilingual `gradeLabel`, because the sheds do not stock the same quality.
* **61 fabric types**, **208 catalogue colours** (11 families, grades A 65 · B 70 · C 54 · D 19),
  each colour carrying an Arabic name, a hex swatch, a family and a grade (A 65 · B 70 · C 54 · D 19
  over 11 families, and `FAMILY_LABEL` names every family in both languages).
* **`mapping` is the join table**: one row per *(warehouse, fabric, colour)* with `minRolls`,
  `maxRolls`, `leadTimeDays`. A stock row or movement whose triple has **no active mapping row** is
  flagged `⚠ Invalid combination` — the combination is not merely a preference, it is the rule.
  Duplicates are refused on save and flagged `DUPLICATE`.
* **`wh-625` is the proof of scale**: one fabric type, **176 colours**, **5 255 rolls** on it. The
  Inventory view therefore opens on a *fabric-type* list, not a wall of rolls.
* **Rolls, not barcodes.** There is no serial number, no barcode, no working-width model. A roll is
  counted; its metres come from `fabrics.metersPerRoll`.
* **Keeper colour codes** (`keeperColorCodes`) are *private shelf labels*: Mostafa writes
  `M-BLU-007` on a bin, the other keeper calls the same catalogue colour something else, and neither
  list leaks into the other's screens. The admin imports/exports all of them. Seeded: 4 codes for
  `usr-2`, 3 for `usr-3`.

Seeded totals (first run, or **Settings → Reset to sample data**):
10 warehouses · 61 fabrics · 208 colours · **1 296** mapping rows · **1 296** inventory rows ·
**124** movements (38 In · 32 Out · 23 Transfer · 31 Adjustment) · **68 567** rolls on the shed cards ·
**3 005** records counted by `countRecords()`. `countRecords()` includes `keeperColorCodes`, so
a backup that loses them shows up as a shrinking record count.

(`fabric types`, `colours` and `rolls` come from the same `getWarehouseSummary()` call the card makes,
so they count only combinations backed by an **active** mapping row.)

| Shed | Owner | Fabric types | Rolls | Grades | Colours |
|---|---|---|---|---|---|
| `wh-alwa` | Mostafa | 50 | 19 418 | B C | 167 |
| `wh-leon` | Mostafa | 50 | 18 113 | B C | 161 |
| `wh-azouz` | Mostafa | 5 | 1 295 | A | 24 |
| `wh-zibda` | Mostafa | 10 | 3 229 | A | 46 |
| `wh-showroom` | Mostafa | 30 | 9 278 | B C A | 95 |
| `wh-625` | Keeper 2 | 1 | 5 255 | A | 176 |
| `wh-magdy` | Keeper 2 | 20 | 7 510 | A B C | 95 |
| `wh-wahman` | Keeper 2 | 5 | 1 690 | A B | 25 |
| `wh-lycra` | Keeper 2 | 1 | 470 | A B | 7 |
| `wh-kashry` | Keeper 2 | 5 | 2 309 | A B C | 32 |

The five Mostafa sheds hold **51 333** rolls, the other five **17 234**, and the ten add to
**68 567** — which is the line the Stock Overview header prints, verbatim:
`177 fabric types · 828 colours · 68,567 rolls`. (177 is the sum of the shed column: a fabric stocked
in three sheds counts three times, while company-wide there are 61 distinct fabric types.)

Capacity is a separate claim, and the seed overfills several sheds on purpose so the Low / Overstock
path is visible the first time you open the app: `wh-625` carries 3 000 rolls of capacity against
5 255 on hand, which is why its utilisation badge reads **175.2 %** in red.

Those card totals count only rolls sitting on an **active** mapping row. The raw inventory table sums
**69 601**, because 26 rows (1 220 rolls) live on combinations whose mapping was later deactivated —
those rows are exactly what `⚠ Invalid combination` flags and what *Run diagnostics* lists.

---

## 4. Screens — view → function → state

Sidebar order is `NAV_ORDER`; a keeper's badges come from the same functions the tables use.

| Route | Screen (EN / AR) | Render function | Reads | Writes via |
|---|---|---|---|---|
| `#readme` | How to use this app / دليل الاستخدام | `renderReadme()` | `APP`, `CHANGELOG`, `STATE`, `STORAGE` | — |
| `#stock` | **Stock Overview / نظرة عامة على المخزون** | `renderStockOverview()` → `ovCard(wh, opts)`, expansion in `UI.stock.open` / `UI.stock.openFab` | `warehouses[]`, `buildStockIndex()`, `getWarehouseSummary()` | `editWarehouse` (Admin), `deleteWarehouse` |
| `#inventory` | **Inventory / المخزون** | `renderInventory()` — `UI.inv.mode:'tree'` accordion over *fabric type → colour → row* (flat in the other mode), `inventoryForm()` | `inventory[]`, `mapping[]`, derived stock | `editInventory`, `deleteInventory` |
| `#colors` | **Colors Catalog / كتالوج الألوان** | `renderColors()` (grid/table via `UI.col.view`) + `renderCodesPanel()` + `codesForm(row)` · `deleteCode(row)` · `importCodesCsv(file)` | `colors[]`, `keeperColorCodes[]`, `colorUsageIndex()`, `kcodeIndex()` | `editColor` (Admin), `editCodes` — own rows only (`canEditCodeRow`) |
| `#cross` | **Cross-View / مخزن زميل** | `renderCross()` — the same `ovCard(wh, { readOnly: true })` | the *other* keeper's sheds, read-only | — |
| `#movements` | Movements / الحركات | `renderMovements()` + `movementForm()` | `movements[]` | `editMovements`, `deleteMovement` |
| `#dashboard` | Dashboard / لوحة المؤشرات | `renderDashboard()` + `barChart` `stackedChart` `donutChart` `trendChart()` | everything, derived | — |
| `#reports` | Reports / التقارير | `renderReports()` + `buildReport(kind)` | derived rows | — |
| `#masters` | Masters / البيانات الأساسية | `renderMasters()` tabs: `mastersWarehouses()` · `masterFabrics()` · `masterColors()` · `masterMapping()` (+ `*Form()`, `loadColorCatalog()`) | `warehouses[] fabrics[] colors[] mapping[]` | `edit*/delete*` per tab |
| `#settings` | Settings / الإعدادات | `renderSettings()` (`settingsParamsCard` `settingsUsersCard` `settingsBackupCard` `settingsDangerCard`) | `settings`, `users`, `auditLog` | `editSettings`, `manageUsers` |
| `#audit` | Audit Log / سجل التدقيق | `renderAudit()` | `auditLog[]` | — |
| `#profile` | My Profile / ملفي | `renderProfile()` | `users[i]`, derived scope | — |

The **in-app guide** (`#readme`) prints the same map from the live app: the role matrix straight out
of `PERMS`, the formulas out of the `formulas` table above, and a shed table generated per account —
ten rows and `68 567` for the admin, five rows and `51 333` for Mostafa — so the guide a keeper reads
describes the sheds they actually own. Its "How to use" heading counts the steps it renders
(`howto.N` keys), so it cannot claim a number the guide does not have.

Cross-cutting machinery:

| Function | Responsibility |
|---|---|
| `can(user, action, warehouseId)` → `guard(fn, action, whId)` | the only authorisation gate; denial ⇒ toast + `Blocked` audit row + abort |
| `scopedWarehouseIds(user)` / `canSeeWarehouse(id)` | `[]` means *unscoped* (Admin); non-empty means *exactly those sheds* |
| `viewsFor(user)` · `VIEWS_FOR_ROLE` · `VIEWS_READONLY` | which screens exist for a role, and which of them are read-only |
| `commit(reason, mutate)` | one writer: bump `revision` → mutate → audit → persist → re-render |
| `buildStockIndex()` / `ensureIdx()` / `getStockSlot(w,f,c)` | the cached roll-up every screen reads |
| `t(key)` + `I18N_RAW` | 469 `[en, ar]` pairs, so a missing translation is impossible |
| `nm(obj, field)` | Arabic value first, English fallback |
| `whOptions(scope, …)` | every warehouse dropdown in the app, filtered by the signed-in scope |
| `makeTable()` / `buildForm()` / `mk()` | the only renderers — text nodes only, no `innerHTML` for user data |
| `csvSpec(kind)` / `exportCsv` / `exportJson` / `importCodesCsv` | backup + Excel; `keeperCodes` is one of the CSV kinds |
| `runDiagnostics()` / `openDiagnostics()` | orphans, duplicates, unmapped triples, negative stock, missing translations |

---

## 5. Calculations (all of them, spelled out)

```text
closingRolls   = openingRolls + rollsIn − rollsOut                (per inventory row)
totalMeters    = closingRolls × fabrics.metersPerRoll             → "#,##0.00 m"
totalValue     = closingRolls × unitCostPerRoll                   → settings.currency + "#,##0.00"
status         = closing = 0        → "Out of Stock"
                 closing ≤ minRolls → "Low"
                 closing ≥ maxRolls → "Overstock"                 (max must be > min)
                 otherwise          → "OK"
reorder        = MAX(0, minRolls − closingRolls), CEILING to a whole roll when
                 settings.enableRounding; renders "" when 0
utilization %  = Σ closingRolls(shed) ÷ warehouses.capacityRolls × 100
                 → <50 green · 50–85 amber · >85 red

getStock(w, f, c)  ← implemented ONCE, used by every screen, KPI, report and export:

   Σ inventory.openingRolls (w,f,c)      ← toggle: CONFIG.INCLUDE_OPENING_IN_STOCK
 + Σ inventory.rollsIn      (w,f,c)
 − Σ inventory.rollsOut     (w,f,c)
 + Σ movements In          where toWarehouse   = w
 − Σ movements Out         where fromWarehouse = w
 + Σ movements Transfer    where toWarehouse   = w
 − Σ movements Transfer    where fromWarehouse = w
 ± Σ movements Adjustment  (signed quantity) where fromWarehouse = w

stockAsOf(w, f, c, date)  the same sum restricted to rows dated ≤ date  → the trend chart and the
                          "as of" line on the Inventory header

per shed  (getWarehouseSummary(id), used by the Stock Overview cards, the sidebar badges and Cross-View):
   fabricTypeCount  COUNT(DISTINCT fabricId WHERE mapping.warehouseId = id AND isActive)
   totalRolls       Σ getStockSlot(id, f, c).closing   over every ACTIVE mapping row of the shed
   colourCount      COUNT(DISTINCT colorId)             ″
   lowCount         COUNT(slots WHERE status = Low OR status = Out of Stock)  → the ⚠ chip on a card
   per-fabric row   the same counts restricted to one fabric type → the card's expand list
   utilizationPct   totalRolls ÷ capacityRolls × 100        (may exceed 100 — that is Overstock)
   lastActivity     MAX(lastUpdated) over the shed's inventory rows and movement dates

per fabric type (getFabricTypeSummary(whId, fabId), the accordion's fabric card):
   colours   COUNT(DISTINCT colorId WHERE mapping(whId, fabId, ·) active)
   rolls     Σ closing over those combinations
   meters    rolls × metersPerRoll        value  Σ closing × unitCostPerRoll
   low / out counts, and the min/max of the shed's mapping rows for that fabric

per colour (colorUsageIndex()): unique (colour, shed) pairs over ALL mapping rows incl. inactive —
   that is the number the Colors Catalog prints as "used in N sheds", and why a colour that is
   mapped but not yet stocked still counts.

keeper colour code  keeperCodeFor(colorId, user) → getKeeperColorCode(keeperUserId, colorId): exact match on customCode, else case-insensitive
   match on customName; first hit wins, only rows owned by that user resolve for them (`kcodeIndex()`
   is built per keeper), and `canEditCodeRow(row)` decides who may edit or delete one.

sidebar badge              inventory = COUNT(visible stock rows) → 914 for keeper1 (893 distinct
                           combinations), 1 296 for the admin; colors = 208; masters = sheds+fabrics
                           +colours+mapping = 1 575; audit = rows in the log. '' ⇒ chip hidden.
company total              Σ over the ten sheds = 68 567 rolls (51 333 + 17 234) — the two keepers'
                           sums must add up to it, asserted in `test.js` from the same functions.
```

> The brief's `getStock()` omits `openingRolls`. Because this app seeds opening balances, `getStock()`
> adds them by default — set `CONFIG.INCLUDE_OPENING_IN_STOCK = false` for the literal formula.
> A −3 *Adjustment* reduces stock, and one *Transfer* is a single row touching two warehouses
> (+destination, −source), so a transfer can never double-count.

`printStockOverview()` prints one row per visible shed (fabric types, colours, rolls, metres, value,
low, utilisation %) plus a totals row — the same numbers the cards show, through the same functions.

---

## 6. 5-minute test checklist

1. **`admin / admin123`** → Stock Overview shows **10 cards**; the roll figures match the table in §3
   exactly and the header reads `177 fabric types · 828 colours · 68,567 rolls`. Press **Print** — one
   table, one total row.
2. **`keeper1 / mostafa123`** → Stock Overview shows **5 cards** (Alwa, Leon, Azouz, Zibda, Showroom)
   totalling **51 333** rolls, plus a line naming the colleague's 5 sheds it can open read-only. The
   sidebar badge on *Inventory* = **914** stock rows. No Settings — the sidebar offers *My Profile*.
3. **Inventory drill-down** → in tree mode the accordion lists Mostafa's fabric types with their
   counts (`Alwa` and `Leon` carry 50 each, the Showroom 30). Open
   *wh-showroom* → a fabric → its colour rows with closing rolls, metres, value and status.
   Add/Edit/Delete buttons appear because it is his shed. Now open **Cross-View**, pick `wh-625`:
   the same drill-down, **zero** write buttons, and its header states the read-only rule.
4. **Colours** → the catalog shows swatch, family, grade, and *used in N sheds*. In Mostafa's list a
   mapped colour carries his `M-BLU-007` chip and a **★ Load catalog** / **＋ Add colour** pair; in the
   cross-view the chips are the other keeper's own codes and the buttons are gone.
5. **Movement that respects the model** → Movements → New → *Transfer*, From `wh-leon`, To `wh-625`,
   10 rolls → Leon −10, 625 +10, company total unchanged. Now try to *edit* that row from `keeper2`:
   refused (`Blocked` audit row), because the source shed is not theirs.
6. **Data integrity** → Masters → Mapping: adding a duplicate `(shed, fabric, colour)` is refused.
   Delete a colour that is in use → refused, with a **Deactivate** alternative.
   Settings → **Run diagnostics** → 0 orphans, 0 unmapped rows, 0 negative combinations.
7. **Codes travel** → add a code as Mostafa → export `keeperCodes` CSV → the row carries his user id;
   re-import after changing the header order → the code survives (the importer matches on the header,
   not the position).
8. **Bilingual** → **ع** flips every label, table header, toast, date and the accordion; the layout
   mirrors to RTL; a refresh keeps the language (and the open accordion).
9. **Backup** → Settings → Export JSON (3 005 records) → clear data → restore → same totals.
10. **Audit** → steps 1–7 are all in Audit Log, with `who · when · what · before → after`.

---

## 7. Editing the model, not the UI

* **Add a shed** = `warehouseForm()`: name (EN + AR), location, manager, capacity, `allowedGrades`,
  `gradeLabel`, active flag → it appears in every dropdown, card, KPI, chart, report and export.
  The create path persists the grade rule, and the edit path diffs it into the audit log.
* **Add a fabric / colour** = one form each, or `★ Load catalog` to pull the whole 208-colour market
  list in (Arabic names, hex, grades A–D). Load is idempotent: existing ids are skipped.
* **Add a mapping row** = dependent dropdowns + min/max/lead time; duplicates refused.
* **Thresholds, currency, rounding, date format, language** = Settings → Application parameters.
* **Role rules** = one `PERMS` map at the top of the script — `ACTIONS` names the ten edit actions,
  the `delete*` keys sit beside them, and `SCOPED_ACTIONS` says which of them are warehouse-scoped.
  The in-app README and the landing page both render that live matrix instead of restating it.
* **Seed data** = `SECTION 1` of the script: compact tables — `WAREHOUSE_PLAN` (one row per shed: both
  names, location, allowed grades + `gradeLabel`, capacity, owning user, how many fabric types, and the
  colours-per-fabric range), `FABRIC_POOL`, `COLOR_FAMILIES` + `FAMILY_LABEL` + `FAMILY_GRADE`,
  `SEED_USERS`, `SEED_KEEPER_CODES` — expanded by `buildColorCatalog()` and `buildSeedData()`
  (`expandSeed()` folds the older flat helpers). No roll count is hand-typed, so a shed's figures cannot
  drift out of step with the stock it implies. It only runs when no stored state exists —
  *Reset to sample data* re-runs it. **No roll numbers are typed by hand anywhere in the repo.**
* **Re-brand in one field**: `Settings → Company name` feeds the sidebar, tab title, profile card,
  in-app README and the printed letterhead. The mark is a single `<symbol id="azt-mark">` drawn with
  plain paths; `tools/make_logo.py` holds one `SPEC` table of measured artboard numbers and
  `tools/build_app.py` splices the sprite + favicon in, `tools/check_logo.py` + `tools/register_check.py`
  keep it aligned with the original artwork (ring 0.84, monogram 0.89, crescent 0.78 IoU at zero
  offset). The palette is `--navy` / `--brand-red`; the mark inherits it via `currentColor`, so one
  `:root` edit re-tints every copy.

---

## 8. Security — read before real use

> **Client-side RBAC is NOT tamper-proof.** A determined user can bypass role restrictions through
> DevTools, and there is no server to say no. This design is for a small trusted team; for production
> move to a real backend or a serverless identity provider. Passwords here are obfuscated with `btoa`
> only — real deployments **must** hash on a server (bcrypt / argon2).

What *is* done properly on the client:

* One gate: `commit()` is the only writer, and every mutating handler passes through
  `guard(fn, action, warehouseId)` first — the scope check is re-run at save time, not only at render.
* No `innerHTML` for user data — `mk()` writes text nodes, so stored names and notes cannot execute;
  `lint.js` fails the build on `innerHTML` and on un-scoped writes.
* A CSP meta tag blocks every external origin (`'unsafe-inline'` is unavoidable in a single file and
  is commented as such); favicon and font are inlined so no request leaves the page.
* CSV export quotes/escapes commas, quotes and newlines, adds a UTF-8 BOM for Excel, and prefixes
  `= + - @` to defuse formula injection.
* Keeper colour codes are filtered by `keeperUserId` before they reach a screen, a CSV or the print
  sheet, so a private shelf label never leaks into the colleague's view.
* Login is rate-limited (5 failures → 60 s lockout), the session token expires after 12 h, and
  destructive actions confirm twice after downloading a JSON backup first.

---

## 9. Troubleshooting — top 10 pitfalls

1. **localStorage blocked on `file://`** → banner appears, the app runs in memory; serve over `http://`
   or use Pages.
2. **Numbers look frozen after you edit the file** → the stored state wins. Use *Reset to sample data*
   or clear the key `fabric-inventory-state-v1`, then hard-reload.
3. **A combination the app refuses** → no *active* mapping row for that `(shed, fabric, colour)`, or a
   duplicate already exists. Masters → Mapping is the fix; `Run diagnostics` lists both.
4. **Stock will not go negative** → `inventoryForm()` recomputes its preview on every keystroke and
   refuses a save whose `closingRolls` would fall below zero (`msg.noStock` names the combination and
   the shortfall). 0 is legal and reads *Out of Stock*. (`clampGsm()` is unrelated — it keeps a
   fabric's GSM between 90 and 400 on the fabric form.)
5. **Arabic missing from a new label** → add the pair to `I18N_RAW`; a key with no Arabic half is a
   build error (`node test.js` counts 469 pairs on both sides).
6. **Transfer double-counting** → log a movement in Movements **or** inventory rows, not both; a
   Transfer is one row touching two warehouses.
7. **Orphaned rows after a delete** → deletes are refused while children exist and *Deactivate* is
   offered; deactivated mapping rows still count in "used in N sheds" by design.
8. **CSV broken in Excel (Arabic/commas)** → handled by `rowsToCsv()` (BOM + quoting + escaping).
9. **Rounding oddities** → one formatter per concept (`fmtNum`, `fmtMeters`, `fmtMoney`, `fmtPct`),
   reorder always rounds **up**.
10. **The accordion closed by itself** → it should not: open fabric types live in `UI.inv.open` and
    survive a language flip and a re-render; if it does not, the state key was reset — check
    `UI.inv.{mode, fabricId, colorId, showOther, open}`.

---

## 10. Browser support

Current Chrome, Edge, Firefox and Safari (desktop + tablet), `file://` and `https://`.
Modern APIs are used **with fallbacks**: `crypto.getRandomValues` → `Math.random`;
`Intl.NumberFormat` → manual thousands grouping; `URL.createObjectURL` download → copy-to-clipboard
dialog; `<dialog>` deliberately not used (custom modal with focus trap + `Esc`); `String.replaceAll`
not used (regex with `/g` instead). No service worker — one file with no external requests is already
offline-capable.

---

*Sample data is fictional and generated on first run only. MIT-style: use it, fork it, ship it.*

To hand the whole thing over in one file, `python3 tools/zip_release.py --complete` puts the repo
*and* that flattened `deploy/` folder (plus `DEPLOY.md`) into
`al-azhar-tex-inventory-<version>-complete.zip`, with a generated `FINAL.md` at the top listing both
deploy routes and the seeded accounts. `deploy/` and `FINAL.md` are written only into the archive, so
a checkout never gains a stray second copy of the build; the verification step compares every entry
byte-for-byte with `site/` and `app/`, and fails if `site/app/index.html` and `app/index.html` differ
— which is what guarantees the deployed app is the app the suites ran.
