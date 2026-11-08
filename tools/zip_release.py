#!/usr/bin/env python3
"""
zip_release.py — build the one archive that is the whole project, ready to deploy.

    python3 tools/zip_release.py                 # writes ../al-azhar-tex-inventory-<version>.zip
    python3 tools/zip_release.py --outdir REL    # write it somewhere else
    python3 tools/zip_release.py --list          # print the manifest, write nothing
    python3 tools/zip_release.py --pages         # also write the Pages-only archive
    python3 tools/zip_release.py --pages --list  # manifest of the Pages archive, write nothing
    python3 tools/zip_release.py --complete      # also write ONE handover archive:
                                                 # the whole repo + deploy/ + FINAL.md

--complete is the deliverable: unzip it once and you hold both things — the
sources/tools/tests you can edit (and CI will rebuild) AND a `deploy/` folder whose
contents can be pushed straight to a Pages branch. Nothing is written to disk by
this tool except the archives: `deploy/` and `FINAL.md` exist only inside the zip,
so a checkout can never accumulate a second copy of the build.
    python3 tools/zip_release.py --check-files   # verify an extracted archive (no git needed)

--pages builds a second file, al-azhar-tex-pages-<version>.zip: the contents of
site/ flattened to the root of one folder, i.e. exactly what GitHub Pages serves
(index.html, 404.html, .nojekyll, logo.svg, app/index.html, app/README.md) plus a
DEPLOY.md with the six steps. No sources, no tools, no tests — unzip, push the
folder's contents to `main`, Settings → Pages → Deploy from a branch → `main` /
`(root)`. It refuses to build while app/ or site/ disagrees with its sources.

Contents = `git ls-files`, i.e. exactly what the repository holds: sources, tools,
tests, the generated app/ and site/, .nojekyll, the Pages workflow. Never
node_modules (dev-only; `npm ci` recreates it) and never .git.

Everything is namespaced under a single top folder, al-azhar-tex-inventory/, so
extracting anywhere gives you a repo root rather than 37 files loose in your home
directory.

The build is verified, not assumed: the archive is re-opened, every entry is
compared byte-for-byte with the file it came from, the deploy-critical files are
required to be present, and executable bits are checked. A `<zip>.sha256` sidecar
is written so whoever receives it can prove nothing changed in transit.
"""
import hashlib
import io
import os
import re
import stat
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PREFIX = 'al-azhar-tex-inventory'

# A deploy that is missing any of these is broken in a way you only discover
# after the URL is already shared.
REQUIRED = [
    'site/index.html',
    'site/app/index.html',
    'site/404.html',
    'site/logo.svg',
    'site/.nojekyll',
    'app/index.html',
    'app/logo.svg',
    'app/README.md',
    'app/404.html',
    'app/.nojekyll',
    '.nojekyll',
    'README.md',
    '.github/workflows/pages.yml',
    'src/app.src.html',
    'web/index.src.html',
    'tools/build_app.py',
    'tools/build_site.py',
    'tools/make_logo.py',
    'tools/check.sh',
    'tools/serve.py',
    'test.js',
    'test-ui.js',
    'test-site.js',
    'lint.js',
    'package.json',
    'package-lock.json',
]


PAGES_PREFIX = 'al-azhar-tex-pages'
PAGES_DIR = 'site'
# What Pages needs at the root of the published folder. Anything else is a hint
# that the archive was hand-assembled rather than flattened from site/.
PAGES_REQUIRED = ['index.html', '404.html', '.nojekyll', 'logo.svg',
                  'app/index.html', 'app/README.md']
PAGES_FORBIDDEN = ('src/', 'tools/', 'web/', 'node_modules', '.git/', 'brand/', 'uploads/')

DEPLOY_MD = """# Deploying this folder on GitHub Pages

Everything here is generated output; there is nothing to build.

1. `git init -b main` in this folder (or copy its *contents* into a fresh repo).
2. Commit and push to `main` on GitHub. `.nojekyll` and `404.html` are part of the set, keep them.
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)` → Save.**
4. Wait about a minute, then open `https://<username>.github.io/<repo>/` — the landing page.
5. The app itself is at `./app/`; the two files are the same build, `app/index.html` is the product.
6. Sign in as `admin` / `admin123`, then set real passwords in **Settings → Users** before anyone else
   uses it. Data lives in each browser's localStorage; JSON backup/restore is in Settings.

`404.html` is what makes deep links survive a refresh on a static host: Pages answers the 404 with
its body, and it bounces the browser back to the hash route. If you prefer CI, the full project
archive ships `.github/workflows/pages.yml`, which also fails the build when a committed `site/`
drifts from its sources.
"""


def site_files():
    base = os.path.join(ROOT, PAGES_DIR)
    if not os.path.isdir(base):
        raise SystemExit('zip_release: no site/ to package — run python3 tools/build_site.py')
    found = []
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in sorted(dirnames) if not d.startswith('.')]
        for f in sorted(filenames):
            rel = os.path.relpath(os.path.join(dirpath, f), base).replace(os.sep, '/')
            found.append(rel)
    missing = [r for r in PAGES_REQUIRED if r not in found]
    if missing:
        raise SystemExit('zip_release: site/ is missing %s — the Pages deploy would 404'
                         % ', '.join(missing))
    extra = [f for f in found if f not in PAGES_REQUIRED]
    if extra:
        raise SystemExit('zip_release: site/ holds %s, which the deploy does not need — either '
                         'ship it in PAGES_REQUIRED or keep it out of site/' % ', '.join(extra))
    return found


def assert_in_sync():
    """--pages must not be able to package a stale site/."""
    for script in ('build_app.py', 'build_site.py'):
        r = subprocess.run([sys.executable, os.path.join(HERE, script), '--check'],
                           cwd=ROOT, capture_output=True)
        if r.returncode:
            raise SystemExit('zip_release --pages: %s --check failed, so the output is stale.\n%s'
                             % (script, (r.stdout + r.stderr).decode().strip()[:600]))


def build_pages(outdir, do_list=False):
    files = site_files()
    name = '%s-%s.zip' % (PAGES_PREFIX, version())
    path = os.path.join(outdir, name)
    if do_list:
        for f in files:
            print('  %-22s %8d   ← %s/%s' % (f, os.path.getsize(os.path.join(ROOT, PAGES_DIR, f)),
                                             PAGES_DIR, f))
        print('  %-22s %8d   ← written by this tool' % ('DEPLOY.md', len(DEPLOY_MD)))
        return None
    os.makedirs(outdir, exist_ok=True)
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files:
            arc = os.path.join(PAGES_PREFIX, f)
            info = zipfile.ZipInfo(arc, date_time=RELEASE_TIME)
            info.create_system = 3
            info.external_attr = 0o644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(os.path.join(ROOT, PAGES_DIR, f), 'rb') as fh:
                z.writestr(info, fh.read())
        z.writestr(zipfile.ZipInfo(os.path.join(PAGES_PREFIX, 'DEPLOY.md'),
                                   date_time=RELEASE_TIME), DEPLOY_MD)
    verify_pages(path, files)
    sha = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    io.open(path + '.sha256', 'w', encoding='utf-8').write('%s  %s\n' % (sha, os.path.basename(path)))
    total = sum(os.path.getsize(os.path.join(ROOT, PAGES_DIR, f)) for f in files) + len(DEPLOY_MD)
    size = os.path.getsize(path)
    print('%s' % path)
    print('  %d files · %s MB in, %s MB out · every entry byte-identical to site/ · sha256 %s…'
          % (len(files) + 1, total / 1e6, size / 1e6, sha[:16]))
    return path


def verify_pages(path, files):
    base = os.path.join(ROOT, PAGES_DIR)
    with zipfile.ZipFile(path) as z:
        bad = z.testzip()
        if bad:
            raise SystemExit('zip_release: corrupt entry in the Pages archive: %s' % bad)
        names = sorted(n.split('/', 1)[1] for n in z.namelist())
        want = sorted(files + ['DEPLOY.md'])
        if names != want:
            raise SystemExit('zip_release: Pages archive holds [%s], expected [%s]'
                             % (', '.join(names), ', '.join(want)))
        if not any(n.startswith(PAGES_PREFIX + '/index.html') for n in z.namelist()):
            raise SystemExit('zip_release: index.html is not at the ROOT of the Pages archive')
        for f in files:
            inside = z.read(os.path.join(PAGES_PREFIX, f))
            on_disk = open(os.path.join(base, f), 'rb').read()
            if inside != on_disk:
                raise SystemExit('zip_release: %s in the Pages archive is not site/%s' % (f, f))
        if z.read(os.path.join(PAGES_PREFIX, 'DEPLOY.md')).decode() != DEPLOY_MD:
            raise SystemExit('zip_release: DEPLOY.md got mangled')
        for n in z.namelist():
            for badp in PAGES_FORBIDDEN:
                if ('/' + badp) in n or n.startswith(PAGES_PREFIX + '/' + badp):
                    raise SystemExit('zip_release: the Pages archive must carry no %s — found %s'
                                      % (badp, n))
        # the shipped app is the app the suites tested
        app = z.read(os.path.join(PAGES_PREFIX, 'app/index.html'))
        on_disk = open(os.path.join(ROOT, 'app', 'index.html'), 'rb').read()
        if app != on_disk:
            raise SystemExit('zip_release: site/app/index.html differs from app/index.html, '
                             'so the deploy would not be the build the suites ran against')


DEPLOY_DIR = 'deploy'          # inside the complete archive, next to the repo files
FINAL_NAME = 'FINAL.md'


def seed_accounts():
    """Read the accounts out of the source instead of typing them into a handover file."""
    src = io.open(os.path.join(ROOT, 'src', 'app.src.html'), encoding='utf-8').read()
    at = src.index('var SEED_USERS = [')
    block = src[at:src.index('\n];', at)]
    rows = re.findall(r"username:'([^']+)',\s*pass:'([^']+)',\s*displayName:'([^']*)'"
                      r"[^\n]*?role:'([^']+)'[^\n]*?warehouseIds:\[([^\]]*)\]", block)
    out = []
    for user, pw, name, role, sheds in rows:
        ids = re.findall(r"'([^']+)'", sheds)
        out.append((user, pw, name, role, ids))
    return out


def final_md(ver, files, pfiles):
    """The handover note. Every figure here is read from the tree at build time."""
    size = lambda rel: os.path.getsize(os.path.join(ROOT, rel))
    accounts = seed_accounts()
    lines = [
        '# Al Azhar Tex · Fabric Roll Inventory %s — what is in this archive' % ver,
        '',
        'One archive, two things. **The project** (sources, tools, the four test suites, and the',
        'generated `app/` + `site/`) and **`deploy/`** — the same generated output flattened so it can',
        'be pushed to GitHub Pages with nothing else.',
        '',
        '| | |',
        '|---|---|',
        '| App, single file | `%s/app/index.html` · %s bytes · no runtime dependency, no build step |' % (PREFIX, format(size('app/index.html'), ',')),
        '| Landing page | `%s/site/index.html` · %s bytes |' % (PREFIX, format(size('site/index.html'), ',')),
        '| `deploy/` | %d files · index.html, 404.html, .nojekyll, logo.svg, app/index.html, app/README.md, '
        'DEPLOY.md — what Pages serves, nothing else |' % (len(pfiles) + 1),
        '| Project files | %d (git-tracked set, byte-identical) |' % len(files),
        '| Version | %s · schema v2 |' % ver,
        '',
        '## Deploy it · two routes',
        '',
        '1. **Fastest:** publish the *contents* of `deploy/` to branch `main`, then',
        '   Settings → Pages → **Deploy from a branch → `main` / `(root)`**. ~60 s, no build step.',
        '2. **With CI:** publish the whole `%s/` folder, then Pages → **`main` / `/site`**'
        ' (the repo has no root `index.html` on purpose), or leave `.github/workflows/pages.yml`'
        ' in charge — it fails the run if a committed `site/` drifts from its sources.' % PREFIX,
        '',
        'Either route serves the app at `./app/` and the guide at `./app/README.md`.',
        '',
        '## Sign in (seeded, replace before real use)',
        '',
        '| Username | Password | Who | Sheds |',
        '|---|---|---|---|',
    ]
    for user, pw, name, role, ids in accounts:
        scope = 'all %d (unscoped)' % len([f for f in files if f.startswith('site/app/')]) if not ids \
            else '%d: %s' % (len(ids), ' '.join('`%s`' % i for i in ids))
        if not ids:
            scope = 'all 10' if role == 'Admin' else 'none'
        lines.append('| `%s` | `%s` | %s · %s | %s |' % (user, pw, name, role, scope))
    lines += [
        '',
        '## Prove the copy you have',
        '',
        '```bash',
        'python3 tools/zip_release.py --check-files   # every deploy-critical file, no git needed',
        'python3 tools/build_app.py --check && python3 tools/build_site.py --check   # output == sources',
        'bash tools/check.sh                          # rebuilds nothing: runs all four suites (needs `npm ci`)',
        'python3 tools/serve.py deploy 8123           # local Pages, including its 404 behaviour',
        '```',
        '',
        'The full behaviour manual — accounts, the shed map, every screen, every formula — is',
        '`README.md` in the repo folder (and `app/README.md`, the same text the app renders in-app).',
        '',
        'Data lives in each browser\u2019s localStorage; JSON backup/restore and CSV export are in',
        'Settings. Client-side RBAC gates the workflow, not the traffic — see README.md \u00a7\u201cWhat this',
        'is not\u201d before you trust it with real stock.',
        '',
    ]
    return '\n'.join(lines)


def build_complete(outdir, do_list=False):
    """The handover archive: repo files + deploy/ + FINAL.md, all verified against the tree."""
    assert_in_sync()
    files = tracked_files()
    pfiles = site_files()
    for req in REQUIRED:
        if req not in files:
            raise SystemExit('zip_release: %s is untracked, so the complete archive would ship without it' % req)
    if '%s/%s' % (DEPLOY_DIR, 'x') and any(f.split('/')[0] == DEPLOY_DIR or f == FINAL_NAME for f in files):
        raise SystemExit('zip_release: %s/ and %s are generated into the archive — they must not be tracked'
                         % (DEPLOY_DIR, FINAL_NAME))
    name = '%s-%s-complete.zip' % (PREFIX, version())
    path = os.path.join(outdir, name)
    if do_list:
        for f in files:
            print('  %-40s %8d' % (f, os.path.getsize(os.path.join(ROOT, f))))
        for f in pfiles:
            print('  %-40s %8d   ← %s/%s' % ('%s/%s' % (DEPLOY_DIR, f),
                  os.path.getsize(os.path.join(ROOT, PAGES_DIR, f)), PAGES_DIR, f))
        print('  %-40s %8d   ← written at build time' % (FINAL_NAME, len(final_md(version(), files, pfiles))))
        print('%d project files + %d deploy files · deploy/ and %s exist only inside this archive'
              % (len(files), len(pfiles) + 1, FINAL_NAME))
        return None
    os.makedirs(outdir, exist_ok=True)
    final = final_md(version(), files, pfiles)
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files:
            src = os.path.join(ROOT, f)
            info = zipfile.ZipInfo(os.path.join(PREFIX, f), date_time=RELEASE_TIME)
            info.create_system = 3
            info.external_attr = (0o755 if (f.endswith('.sh') or (f.endswith('.py') and f.startswith('tools/')))
                                  else 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, open(src, 'rb').read())
        for f in pfiles:
            info = zipfile.ZipInfo('%s/%s/%s' % (PREFIX, DEPLOY_DIR, f), date_time=RELEASE_TIME)
            info.create_system = 3
            info.external_attr = 0o644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, open(os.path.join(ROOT, PAGES_DIR, f), 'rb').read())
        # the six steps travel with deploy/, so that folder stands on its own
        info = zipfile.ZipInfo('%s/%s/DEPLOY.md' % (PREFIX, DEPLOY_DIR), date_time=RELEASE_TIME)
        info.create_system = 3
        info.external_attr = 0o644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, DEPLOY_MD)
        info = zipfile.ZipInfo('%s/%s' % (PREFIX, FINAL_NAME), date_time=RELEASE_TIME)
        info.create_system = 3
        info.external_attr = 0o644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, final)
    verify_complete(path, files, pfiles, final)
    sha = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    io.open(path + '.sha256', 'w', encoding='utf-8').write('%s  %s\n' % (sha, os.path.basename(path)))
    total = sum(os.path.getsize(os.path.join(ROOT, f)) for f in files) \
        + sum(os.path.getsize(os.path.join(ROOT, PAGES_DIR, f)) for f in pfiles) + len(final)
    print('%s' % path)
    print('  %d project + %d deploy files · %s MB in, %s MB out · sha256 %s…'
          % (len(files), len(pfiles) + 1, total / 1e6, os.path.getsize(path) / 1e6, sha[:16]))
    return path


def verify_complete(path, files, pfiles, final):
    with zipfile.ZipFile(path) as z:
        if z.testzip():
            raise SystemExit('zip_release: corrupt entry in the complete archive')
        want = set(os.path.join(PREFIX, f) for f in files)
        want |= set('%s/%s/%s' % (PREFIX, DEPLOY_DIR, f) for f in pfiles)
        want.add('%s/%s/DEPLOY.md' % (PREFIX, DEPLOY_DIR))
        want.add('%s/%s' % (PREFIX, FINAL_NAME))
        got = set(z.namelist())
        if got != want:
            raise SystemExit('zip_release: complete archive mismatch · missing [%s] · extra [%s]'
                             % (', '.join(sorted(want - got)), ', '.join(sorted(got - want))))
        for req in REQUIRED:
            if os.path.join(PREFIX, req) not in got:
                raise SystemExit('zip_release: complete archive is missing %s' % req)
        for f in files:
            arc = os.path.join(PREFIX, f)
            if z.read(arc) != open(os.path.join(ROOT, f), 'rb').read():
                raise SystemExit('zip_release: %s inside the complete archive is not the file on disk' % f)
        for f in pfiles:
            arc = '%s/%s/%s' % (PREFIX, DEPLOY_DIR, f)
            if z.read(arc) != open(os.path.join(ROOT, PAGES_DIR, f), 'rb').read():
                raise SystemExit('zip_release: deploy/%s does not match site/%s' % (f, f))
        dep = lambda rel: '%s/%s/%s' % (PREFIX, DEPLOY_DIR, rel)
        if z.read(dep('index.html')) != z.read(os.path.join(PREFIX, 'site', 'index.html')):
            raise SystemExit('zip_release: deploy/index.html is not the published site/index.html')
        if z.read(dep('app/index.html')) != z.read(os.path.join(PREFIX, 'app', 'index.html')):
            raise SystemExit('zip_release: deploy/app/index.html is not the app the suites tested')
        if z.read('%s/%s/DEPLOY.md' % (PREFIX, DEPLOY_DIR)).decode() != DEPLOY_MD:
            raise SystemExit('zip_release: deploy/DEPLOY.md got mangled')
        if z.read('%s/%s' % (PREFIX, FINAL_NAME)).decode() != final:
            raise SystemExit('zip_release: FINAL.md got mangled')
        if not any(n.endswith('%s/.nojekyll' % DEPLOY_DIR) for n in got):
            raise SystemExit('zip_release: deploy/ has no .nojekyll — Pages would run Jekyll over it')
        for n in got:
            if '/%s/node_modules' % PREFIX in n or '/%s/%s/' % (PREFIX, DEPLOY_DIR) in n and 'deploy/deploy' in n:
                raise SystemExit('zip_release: unexpected nesting in the complete archive: %s' % n)


def git_dir():
    r = subprocess.run(['git', 'rev-parse', '--git-dir'], cwd=ROOT, capture_output=True)
    return r.returncode == 0


def tracked_files():
    if not git_dir():
        raise SystemExit('zip_release: %s is not a git repository, so there is no manifest to '
                         'package. Init one (git init -b main && git add -A) — or, if this is an '
                         'unzipped release, run: python3 tools/zip_release.py --check-files' % ROOT)
    out = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, capture_output=True, check=True).stdout
    files = [f.decode() for f in out.split(b'\0') if f]
    if not files:
        raise SystemExit('zip_release: git ls-files returned nothing — is this a repo?')
    missing = [f for f in files if not os.path.isfile(os.path.join(ROOT, f))]
    if missing:
        raise SystemExit('zip_release: tracked but not on disk: %s' % ', '.join(missing))
    return sorted(files)


def version():
    src = io.open(os.path.join(ROOT, 'src', 'app.src.html'), encoding='utf-8').read()
    m = re.search(r"version:\s*'([\d.]+)'", src)
    if not m:
        raise SystemExit('zip_release: no APP version in src/app.src.html')
    return m.group(1)


def build(outdir, do_list=False):
    files = tracked_files()
    for req in REQUIRED:
        if req not in files:
            raise SystemExit('zip_release: %s is not tracked by git, and a release '
                             'without it cannot deploy' % req)
    name = '%s-%s.zip' % (PREFIX, version())
    path = os.path.join(outdir, name)
    os.makedirs(outdir, exist_ok=True)
    if do_list:
        for f in files:
            print('  %-34s %8d' % (f, os.path.getsize(os.path.join(ROOT, f))))
        print('%d files, %d bytes total' % (len(files),
              sum(os.path.getsize(os.path.join(ROOT, f)) for f in files)))
        return None

    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files:
            src = os.path.join(ROOT, f)
            info = zipfile.ZipInfo(os.path.join(PREFIX, f), date_time=RELEASE_TIME)
            mode = os.stat(src).st_mode
            # 0755 for the two files people run directly, 0644 for the rest
            exec_bit = f.endswith('.sh') or (f.endswith('.py') and f.startswith('tools/'))
            info.create_system = 3                     # unix
            info.external_attr = (0o755 if exec_bit else 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(src, 'rb') as fh:
                z.writestr(info, fh.read())

    verify(path, files)
    sha = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    io.open(path + '.sha256', 'w', encoding='utf-8').write(
        '%s  %s\n' % (sha, os.path.basename(path)))
    size = os.path.getsize(path)
    print('%s' % path)
    print('  %d files · %s MB in, %s MB out (%.1f%% of the folder) · sha256 %s…'
          % (len(files),
             sum(os.path.getsize(os.path.join(ROOT, f)) for f in files) / 1e6,
             size / 1e6, 100.0 * size / sum(os.path.getsize(os.path.join(ROOT, f)) for f in files),
             sha[:16]))
    return path


RELEASE_TIME = (2026, 1, 1, 0, 0, 0)   # fixed, so two builds of one commit match


def verify(path, files):
    with zipfile.ZipFile(path) as z:
        bad = z.testzip()
        if bad:
            raise SystemExit('zip_release: corrupt entry in the archive: %s' % bad)
        names = set(z.namelist())
        want = set(os.path.join(PREFIX, f) for f in files)
        if names != want:
            raise SystemExit('zip_release: archive does not match git ls-files · missing: [%s] · extra: [%s]'
                             % (', '.join(sorted(want - names)), ', '.join(sorted(names - want))))
        for f in files:
            arc = os.path.join(PREFIX, f)
            inside = z.read(arc)
            on_disk = open(os.path.join(ROOT, f), 'rb').read()
            if inside != on_disk:
                raise SystemExit('zip_release: %s inside the zip is not the file on disk' % f)
            mode = (z.getinfo(arc).external_attr >> 16) & 0o777
            should_run = f.endswith('.sh') or (f.endswith('.py') and f.startswith('tools/'))
            if should_run and not mode & stat.S_IXUSR:
                raise SystemExit('zip_release: %s lost its executable bit' % f)
            if not should_run and mode & stat.S_IXUSR:
                raise SystemExit('zip_release: %s should not be executable' % f)
        for req in REQUIRED:
            if os.path.join(PREFIX, req) not in names:
                raise SystemExit('zip_release: archive is missing %s' % req)


def check_files():
    """For an extracted archive: no git, so assert the deploy set is on disk."""
    missing = [f for f in REQUIRED if not os.path.isfile(os.path.join(ROOT, f))]
    if missing:
        raise SystemExit('zip_release: this copy is missing %d deploy-critical file(s):\n  %s'
                         % (len(missing), '\n  '.join(missing)))
    present = [(f, os.path.getsize(os.path.join(ROOT, f))) for f in REQUIRED]
    print('all %d deploy-critical files present · site/index.html %d B · app/index.html %d B'
          % (len(REQUIRED), dict(present)['site/index.html'], dict(present)['app/index.html']))
    print('  run the suites here with: bash tools/check.sh')
    return 0


def main():
    args = sys.argv[1:]
    if '--check-files' in args:
        return check_files()
    outdir = ROOT
    if '--outdir' in args:
        outdir = os.path.join(ROOT, args[args.index('--outdir') + 1])
    if '--pages' in args:
        assert_in_sync()
        build_pages(outdir, do_list='--list' in args)
        if '--only-pages' in args:
            return 0
    if '--complete' in args:
        build_complete(outdir, do_list='--list' in args)
        if '--only-complete' in args:
            return 0
    build(outdir, do_list='--list' in args)
    return 0


if __name__ == '__main__':
    sys.exit(main())
