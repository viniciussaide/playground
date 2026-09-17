# Local Build & Install (develop → desktop shortcut)

**Last executed:** 2026-09-16 — develop `8340311` (time-tracking and session activity
notifications merged), installed `1.1.1` over `1.1.0`; both shortcuts already pointed at the
install, and the installed `app.asar` carries the notifications and time-tracking code.

**Previously:** 2026-09-15 — develop `4f1fd4d` (session-activity-status merged),
installed `1.1.0` over the 2026-09-10 `1.1.0`. Two findings that run counter to the note
below: (1) `createDesktopShortcut: always` did **not** refresh a desktop shortcut on this
machine, whose Desktop is redirected to OneDrive; the Start Menu one was created normally.
(2) The existing desktop shortcut pointed at `dist\win-unpacked\playground.exe` — a build
output directory, not the install — so it silently tracked whatever was last packed. It was
repointed at `%LOCALAPPDATA%\Programs\playground\playground.exe` (old one kept as
`Playground.lnk.bak-20260915`). **Check the shortcut target after installing, not just the
version.**

How to build the current `develop` into the Windows installer that the desktop
shortcut launches, and the version pitfall that once caused confusion.

## The shortcut

The desktop / Start Menu shortcut **Playground** points at the NSIS install:

```
%LOCALAPPDATA%\Programs\playground\playground.exe
```

It is created by the installer (`electron-builder.yml` →
`createDesktopShortcut: always`), so a fresh install refreshes it — the shortcut
itself never needs manual editing.

## ⚠️ The version pitfall (read first)

The committed `package.json` still reads **`0.1.0`** — the `1.0.0` release was
stamped in CI from a git tag and the bump was **never committed** (see the
STATE.md PENDING note). A plain `npm run build:win` therefore produces a
**`0.1.0`** installer:

- installing it **over** a newer installed version silently **regresses the app
  version** (the exe reports `0.1.0` again) and leaves the auto-updater in a
  stale-looking state — this is the confusion that happened once;
- the installer does not refuse it (same install dir), so the regression is
  easy to miss.

**Rule:** a local build must carry a version **above** the currently installed
one. The release version itself is controlled by the repo owner via git tags
(stable CI stamps from `GITHUB_REF`, ignoring `package.json`), so the local
build passes its version **only to the packager** — the repo is never touched.

## Procedure

```powershell
# from the repo root (branch: develop)

# 1. build the renderer + main bundles (typecheck + electron-vite build)
npm run build

# 2. package the NSIS installer, overriding the version for this build only
#    (pick the next version above the currently installed one — no repo file
#    is modified; package.json stays at its committed value)
npx electron-builder --win --config.extraMetadata.version=1.1.0
#    → dist\playground-1.1.0-setup.exe  (~107 MB, x64, one-click NSIS)

# 3. install (silent) and verify the installed version
Start-Process -FilePath "dist\playground-1.1.0-setup.exe" -ArgumentList "/S" -Wait
(Get-Item "$env:LOCALAPPDATA\Programs\playground\playground.exe").VersionInfo
#    FileVersion should read 1.1.0
```

There is **no `npm version` bump and no `git checkout -- package.json`**
step: `--config.extraMetadata.version` overrides the packaged version without
writing to the working tree (the previous "temporary bump + restore" dance is
gone — owner decision 2026-09-10, the release number stays with the owner).

## What the installed app reads

- **Config:** `%APPDATA%\playground\config.json` — the *same* file the stable
  install and the dev build use, so workspaces / settings survive an install.
- **userData:** `app.getPath('userData')` (derived from `name: playground` in
  `package.json`); the CI nightly uses a distinct app name and therefore a
  different profile — the local build is NOT the nightly.
- **Updates:** the packaged app checks the GitHub feed (`electron-builder.yml`
  `publish`) and may offer a newer stable — that is expected, not a break.

## Verifying the build is the develop one

- `dist\win-unpacked\resources\app.asar` carries the branch content; the quick
  signal is the Settings dialog showing the **Dev alias** field (only when a
  template uses `{dev}`) — absent from any build older than PR #85.
- The suite used as the pre-build gate: `npx vitest run --maxWorkers=2`
  (currently 706 tests / 44 files on develop).