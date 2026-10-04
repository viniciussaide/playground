# Local Build & Install (develop → desktop shortcut)

**Last executed:** 2026-10-03 — develop `a4e4f99` (PRs #157-#168 merged upstream), packed
`1.1.7` over `1.1.6`, backup `playground-backup-1.1.6`. The session doing the build ran inside the
installed app, so the install was armed to run when the app closed (see
[When this session runs inside the installed app](#when-this-session-runs-inside-the-installed-app));
it installed, logged `1.1.7` and reopened the app. Packed `app.asar` verified by markers from the
day's PRs (`worktrees:create-step`, `the ignore check failed`, `perf-diagnostics.jsonl`,
`Wait for the create to finish`). Installer 124 MB.

**Previously:** 2026-09-17 — develop `7cef47a` (terminal scroll & paste merged, PR #95 open),
installed `1.1.2` over `1.1.1`. Gate `npx vitest run --maxWorkers=2` green at **1200 tests / 69
files**. Packed `app.asar` verified by grepping for the feature's own markers
(`clipboard:read-paste`, `FILE_DROP_LIST_COMMAND`, `playground.debug.terminalModes`,
`playground-paste`) alongside the two already on develop (`time:snapshot`, `session:notice`) —
a stronger check than the Dev alias signal below, and worth preferring. Both shortcuts still
point at the install. Installer 103 MB.

**Previously:** 2026-09-16 — develop `8340311` (time-tracking and session activity
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
`createDesktopShortcut: always`). **On this machine that has not been reliable:** the Desktop is
redirected to OneDrive, and the 2026-09-15 run found `createDesktopShortcut: always` did not
refresh the desktop shortcut while the Start Menu one was created normally. Audit both targets
after every install rather than assuming the installer fixed them:

```powershell
$sh = New-Object -ComObject WScript.Shell
@([Environment]::GetFolderPath('Desktop'),
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs") |
  ForEach-Object { Get-ChildItem $_ -Filter '*laygroun*.lnk' -Recurse -ErrorAction SilentlyContinue } |
  ForEach-Object { "$($_.FullName) -> $($sh.CreateShortcut($_.FullName).TargetPath)" }
```

Both read the install as of 2026-09-17, so the 2026-09-15 repointing has held.

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
one — and **read that version off the installed exe, not off this file's history**, which goes
stale the moment someone builds without updating it:

```powershell
(Get-Item "$env:LOCALAPPDATA\Programs\playground\playground.exe").VersionInfo.FileVersion
```

The release version itself is controlled by the repo owner via git tags
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
npx electron-builder --win --config.extraMetadata.version=1.1.2
#    → dist\playground-1.1.2-setup.exe  (~103 MB, x64, one-click NSIS)

# 3. back up the current install (copying only reads, so the app may stay open)
Copy-Item "$env:LOCALAPPDATA\Programs\playground" "$env:LOCALAPPDATA\Programs\playground-backup-1.1.1" -Recurse

# 4. install: now, or armed for when the app closes if this shell runs inside it
powershell -NoProfile -File .specs\codebase\install-local-build.ps1 -Setup dist\playground-1.1.2-setup.exe
#    prints the installed version afterwards; FileVersion should read 1.1.2
```

There is **no `npm version` bump and no `git checkout -- package.json`**
step: `--config.extraMetadata.version` overrides the packaged version without
writing to the working tree (the previous "temporary bump + restore" dance is
gone — owner decision 2026-09-10, the release number stays with the owner).

## When this session runs inside the installed app

The agent doing the build often runs in a terminal of the very Playground it is about to replace.
Installing then closes the app, and with it the session, mid-command: nothing checks the version,
and the owner loses the agent. Steps 1 to 3 are safe with the app open (they write only `out\`,
`dist\` and the backup folder); only the install is not.

`install-local-build.ps1` (next to this file) decides from the process tree:

| Situation | What the script does |
| --- | --- |
| This shell descends from the installed `playground.exe` | arms the install and exits 0 |
| The installed app runs, but this shell is outside it | refuses with exit 1: close the app, run it again |
| The installed app is not running | installs now and prints the installed version |

**Detection** walks this shell's ancestors (`Win32_Process.ParentProcessId`) looking for the
installed exe's path. `PLAYGROUND_ACTIVITY_TOKEN` is no test: the app sets it only for agents with
activity hooks, and a dev build sets it too.

**The armed install** is a hidden `powershell` started with `Win32_Process.Create`, so its parent is
`WmiPrvSE`: same user, same session, outside the app's process tree (a `Start-Process` from the
session would sit under the app's PTY host). It waits for every `playground` process to exit, runs
the setup with `/S`, writes the installed FileVersion to
`%LOCALAPPDATA%\Programs\playground-install.log` and starts the app again.

The agent's part, when the script reports the install as armed:

1. Tell the owner to close Playground, and that it reinstalls and reopens by itself in a few
   seconds; the current session ends there.
2. In the next session, read the log and the exe's FileVersion; both must show the new version.
   If the app did not come back, the previous version is in the backup folder.

`-DryRun` prints the decision and, inside the app, the waiter's command line, and changes nothing.
The waiter has no timeout: it waits until the app closes. Arm it once; to cancel, stop it with
`Stop-Process -Id <waiter pid>` (the script prints the pid).

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
  (**1200 tests / 69 files** on develop as of 2026-09-17 `7cef47a`; the figure here has gone stale
  before, so treat it as a floor and judge the run by its exit code).
- **Prefer grepping `dist\win-unpacked\resources\app.asar` for a marker string unique to the code
  you just merged** (an IPC channel name, a flag key, a command constant). It proves the packed
  bundle carries *this* branch, whereas the Dev alias field only proves the build is newer than
  PR #85.