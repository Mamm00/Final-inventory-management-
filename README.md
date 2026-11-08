<div align="center">

<img src="app/logo.svg" width="132" height="132" alt="Al Azhar Tex logo: a navy ring arc with five red stars, a lowercase “at” monogram over a red bowl, and the words AL AZHAR TEX">

# Al Azhar Tex · Fabric Roll Inventory

**A whole warehouse system in one HTML file — English and Arabic, right-to-left included.**
GitHub Pages publishes it; nothing else has to be installed.

[Open the site →](https://mamm00.github.io/Final-inventory-management-/)
&nbsp;·&nbsp; [Open the app →](https://mamm00.github.io/Final-inventory-management-/app/)
&nbsp;·&nbsp; [In-app guide](app/README.md)

</div>

---

## What is in the box

| | |
|---|---|
| **The app** | one file, `app/index.html`, 456 KB: markup, CSS, JS, artwork and favicon inline |
| **Runtime dependencies** | none. No CDN, no fonts, no `fetch`, no build step in the browser |
| **Works from** | `file://`, a USB stick, any static host, GitHub Pages |
| **Language** | every string in EN and AR (`473` keys × 2), one toggle, real RTL — layout mirrors, tables reorder, printed reports follow |
| **Scope** | **10** sheds split between **two warehouse keepers** (five each, one of them the showroom), **61** fabric types, a **208**-colour catalogue, rolls counted per *(shed · fabric · colour)* with each keeper's own shelf codes, transfers, adjustments, audit log, print-on-letterhead |
| **Data** | `localStorage` per browser, plus JSON backup/restore and CSV export |
| **Version** | 1.2.0 · schema v2 · build 2026-11-07 |

The full behaviour manual — including the permission rules, the number-parsing
defences and the rollback procedure — is [`app/README.md`](app/README.md), which is
also the in-app **Guide** screen, translated.

## Deploy it

These routes publish `site/` (a landing page + the app under `/app`).

**A · GitHub Actions (configured for this repository)** — pushes to `main` or
`arena/adb95130-final-inventory-management` verify and publish `site/`. The workflow
also supports a manual run from the Actions tab. It fails if the committed output
does not match its sources or any of the four test suites fails.

1. In [repository Pages settings](https://github.com/Mamm00/Final-inventory-management-/settings/pages),
   set **Build and deployment → Source → GitHub Actions** once. The workflow also
   attempts this enablement automatically when GitHub permits it.
2. Push to either configured branch, or run the **pages** workflow manually.
3. Open `https://mamm00.github.io/Final-inventory-management-/`. The app is at
   `https://mamm00.github.io/Final-inventory-management-/app/`.

The workflow publishes only the generated `site/` directory, including `.nojekyll`.
It does not expose the source archive, tests, or repository tooling. The app uses
relative links and hash routes, so the repository-name subpath and deep links work
without changing the application source for each deployment.

**B · Deploy from a branch** — **Settings → Pages → Source: Deploy from a branch →
`main` → `/site`**. No Actions, no workflow run. `site/` is committed, so it works.

**C · The Pages-only archive** — `python3 tools/zip_release.py --pages` writes
`al-azhar-tex-pages-<version>.zip`: the contents of `site/` flattened to one folder plus a
`DEPLOY.md`, i.e. only what Pages serves (7 files, ~168 KB). Unzip, push the folder's *contents* to
`main`, pick **Deploy from a branch → `main` / `(root)`**, done. It refuses to build while `app/` or
`site/` disagrees with its sources, and every entry is checked byte-for-byte against `site/` — so the
archive cannot ship a build the suites did not just test.

**D · The handover archive** — `python3 tools/zip_release.py --complete` writes one file,
`al-azhar-tex-inventory-<version>-complete.zip`: the whole repo (38 tracked files, byte-identical)
*plus* a `deploy/` folder holding exactly what Pages serves, and a generated `FINAL.md` that spells
out both routes and the seeded accounts. `deploy/` and `FINAL.md` exist only inside the archive —
nothing is written into the working tree — so the zip cannot contain a second copy of the build that
drifts from `site/`.

**E · Skip Pages** — `app/index.html` is the product. Mail it, drop it on a shared
drive, open it from `file://`. Everyone gets the same app; each browser keeps its
own data, which is what the JSON backup is for.

If you deploy `app/` from the repo root instead of `site/`, the root `.nojekyll` is
already there, and `404.html` in that folder keeps deep app links working.

## Repository map

| Path | What it is | Edit it? |
|---|---|---|
| `src/app.src.html` | **the app source of record** — everything but the injected logo sprite | ✏️ yes |
| `src/404.src.html`, `src/README.app.md` | sources for `app/404.html` and the in-app guide | ✏️ yes |
| `web/index.src.html` | source of the landing page | ✏️ yes |
| `tools/make_logo.py` | **the logo, as one table of measured numbers** | ✏️ yes (brand) |
| `tools/build_app.py` | splices the mark + favicon into `app/` | rarely |
| `tools/build_site.py` | builds `site/`, injecting every number the landing page quotes | rarely |
| `app/`, `site/` | generated output, committed so Pages can serve it | 🚫 never by hand |
| `test.js`, `test-ui.js`, `test-site.js`, `lint.js` | the four suites, all jsdom, no browser needed | ✏️ with the code |
| `brand/`, `uploads/` | brand renders and the original artwork photo the logo was measured from | reference |

The rule that keeps this honest: **`app/` and `site/` are generated.** Numbers,
the permissions matrix, the colour count and the artwork on the landing page are
read out of the app at build time, so marketing copy cannot drift from the code.

## Rebuild and check

```bash
python3 tools/build_app.py && python3 tools/build_site.py   # regenerate
bash tools/check.sh                                          # sync + all four suites
python3 tools/serve.py                                       # preview site/ on :8080
python3 tools/serve.py /tmp/unzipped/al-azhar-tex-pages 8123 # preview any folder with an index.html
```

`tools/serve.py` is `python3 -m http.server` plus the one thing that matters for
testing a deploy: a missing path answers **404 with the body of `404.html`**, which
is how Pages behaves and the only way to see the deep-link rescue work locally.

`tools/check.sh` is what CI runs. Expect:

```
ALL GOOD · 297 assertions passed     (test.js: the seed maths, permissions, CSV, dates —
                                      every shed's roll count re-derived, not quoted)
ALL GOOD · 478 assertions passed     (test-ui.js: the real app rendered in jsdom — clicks,
                                      forms, the accordion, the print sheet, both languages)
all 834 site checks passed           (test-site.js: the Pages site, both languages, and this
                                      README's numbers re-derived from the app source)
LINT CLEAN (36 checks)               (no network, no innerHTML, no alert, t() coverage)
```

`test-site.js` reads the figures in the table above and in *Sign in* out of
`src/app.src.html` — so this file cannot quietly fall behind the app. Run the
suite after editing either one.

Dependencies for the *tooling only* (the app needs nothing): `pip install pillow` for
the brand generator, `npm ci` for jsdom. `tools/register_check.py` additionally uses
`cairosvg` and is how the logo was aligned to the original artwork.

## Sign in

Seeded in `SEED_USERS` (`src/app.src.html`), and the table the in-app guide prints is the same three.

| Username | Password | Who | Their sheds | What they may do |
|---|---|---|---|---|
| `admin` | `admin123` | Admin | none typed ⇒ **all 10** | everything: 12 screens, masters, users, settings, deletes, the shared catalogue, every keeper's codes |
| `keeper1` | `mostafa123` | Mostafa · Warehouse Keeper | `wh-alwa` `wh-leon` `wh-azouz` `wh-zibda` `wh-showroom` | full control in those five, his own colour codes, and a **read-only** window on the other five |
| `keeper2` | `keeper2123` | Second keeper · Warehouse Keeper | `wh-625` `wh-magdy` `wh-wahman` `wh-lycra` `wh-kashry` | the same, in *their* five |

There is no sales role any more — `role.SalesManager` survives only as a translation key so an old
JSON backup still prints a readable role, and a restored user carrying it is treated as read-only.

Change the seed in `src/app.src.html` before the first real deploy, and treat Settings → Danger Zone
as production-relevant. [`app/README.md`](app/README.md) §2–§5 spell out the rules, the screens and
every calculation.

## What this is not

It is a client-side app: the sign-in gates *workflow*, not traffic, and the data
lives in the browser that typed it. Anyone with the file and that machine can read
it. Pages is distribution, not a vault — for real commercial confidentiality put
the same file on an internal host or behind SSO. There is no server to arbitrate,
so the supported pattern is one browser per workstation plus JSON backups exchanged
at the end of a shift.

---

<div align="center">

<img src="app/logo.svg" width="34" height="34" alt=""><br>
<sub>Al Azhar Tex · Fine Fabrics — navy <code>#222457</code>, red <code>#CB3632</code>,
5 stars, drawn from measured geometry, not traced.</sub>

</div>
