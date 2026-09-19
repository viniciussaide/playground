# Files Direction — Explore (F1) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/files-explore/design.md`
**Status**: Draft

**Branch**: `feature/files-explore`, stacked on `feature/status-bar` (design header). The PR to upstream carries "depends on" the status-bar PR; once that merges, `git rebase --onto origin/main feature/status-bar feature/files-explore`.

**Prerequisite**: `status-bar` executed — this feature imports its `src/main/git.ts` and edits its `StatusBar.tsx`.

**Test baseline**: **797** — the count `status-bar/tasks.md` projects at its end (748 on `origin/main` + 49). **Both figures are projections. Re-measure with `npm test` as the first act of Execute** and re-anchor every expected count below.

**Baseline measured 2026-09-19** with `npx vitest run` on `origin/main` `6ecd19c`, after the upstream merged #88: **917 tests / 52 files**, all passing. The 748 the plans started from was recorded before #88 and is stale by **+169**. Its baseline becomes status-bar's corrected end, **966**; every count below shifts by **+169** and this feature ends at **1019**, not 850. Still re-measure as the first act of Execute.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main-process modules with logic (`file-tree.ts`, `file-reader.ts`, `file-watcher.ts`, `shortcut-launcher.ts`) | unit | All branches; 1:1 to the ACs each module owns; every listed edge case reachable without a GUI | `src/main/<module>.test.ts` | `npm test` |
| Extracted pure helpers (`foldChildren`, `parseNameStatus`, `resolveInside`, `isBinary`, `files-view.ts`) | unit | Input→output per AC, including failure shapes | co-located `*.test.ts` | `npm test` |
| Shared types, IPC contract, config schema | none | build gate only | — | `npm run typecheck` |
| Thin Electron shell (`index.ts` wiring) | none (hand-verified) | — | `src/main/index.ts` | `npm run typecheck` |
| Renderer components, hooks, Monaco setup | none (CDP smoke + visual) | — | — | `node scripts/smoke-files.mjs` |
| Out-of-CI smoke script | manual only | Every AC no unit test reaches | `scripts/smoke-*.mjs` | `node scripts/smoke-files.mjs` (live session) |

**Provenance note:** `TESTING.md`'s rule — test the pure seam and the DI'd module, hand-verify the shell and the renderer — is applied as-is. The watcher is the one module that would be tempting to leave to hand-verification because it wraps `fs.watch`; it is DI'd (pattern 3) precisely so the git-dir watch, the batching and the handle cleanup are unit-tested, since those are the parts that fail silently.

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a logic-bearing, contract, config or renderer task | `npm run typecheck && npm run lint && npm test` |
| Build | At each phase boundary | `npx electron-vite build` |
| Packaged | The Monaco spike (T13) only | `npm run build:unpack`, then launch `dist/win-unpacked` |
| Manual | The CDP smoke | `npm run dev -- -- --remote-debugging-port=9222`, then `node scripts/smoke-files.mjs` |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

---

## Execution Plan

Phases run sequentially; tasks within a phase run in order.

### Phase 1: Main process

Contract, the three new modules, the launcher fixes, the wiring. No UI.

```
T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8
```

### Phase 2: Renderer decisions

Config schema and every pure rule the view renders, with tests, before any component exists.

```
T8 → T9 → T10 → T11 → T12
```

### Phase 3: Viewer de-risk

The Monaco spike first — nothing that renders a file is built until it has run packaged.

```
T12 → T13 → T14 → T15
```

### Phase 4: The direction

```
T15 → T16 → T17 → T18 → T19 → T20 → T21
```

### Phase 5: Status bar landing and end-to-end

```
T21 → T22 → T23
```

---

## Task Breakdown

### T1: Declare the Files contract

**What**: Add `src/shared/files.ts` with `FilesMode`, `FileEntry`, `DirListing`, `ChangedPath`, `ChangedListing`, `BaseOptions`, `FileContent`, `FilesChanged` as the design defines them; register `files:list-dir`, `files:changed-since`, `files:bases`, `files:read`, `files:watch` in `IpcContract` and `files:changed` in `IpcEvents`.
**Where**: `src/shared/files.ts`
**Depends on**: None
**Reuses**: `ChangeStatus` from `shared/worktrees.ts`; the contract's doc-comment convention; the `IpcEvents` map (AD-004).
**Requirement**: FXPL-02, 08, 09, 16, 21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `ChangedPath.status` is `ChangeStatus` — one status vocabulary across both diff modes
- [ ] Five invoke channels and one event declared; nothing imports them yet
- [ ] Baseline lint warning count recorded in the commit body
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **797** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(shared): declare the files direction contract`

---

### T2: List one folder of a worktree

**What**: Create `src/main/file-tree.ts` with `listDir(worktreePath, dir)` — `git ls-files --cached --others --exclude-standard --directory -z -- <dir>/` — and the pure `foldChildren(paths, dir)`.
**Where**: `src/main/file-tree.ts`
**Depends on**: T1
**Reuses**: `git()` / `gitFailureLine()` from status-bar's `git.ts`; the temp-repo pattern of `worktree-manager.test.ts`.
**Requirement**: FXPL-04, 05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `foldChildren` turns recursive descendants (`src/a/f.ts` under `src/`) into one level: files plus folder names
- [ ] A wholly untracked folder reported as `newdir/` becomes one `dir` entry flagged `untracked`
- [ ] Folders sort before files, each group alphabetically, case-insensitive
- [ ] Against a temp repo: an ignored folder never appears; an untracked non-ignored file does
- [ ] A git failure returns `{ entries: [], error }` and never throws
- [ ] `src/main/file-tree.test.ts` created
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 797 + 7 = **804**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): list one folder of a worktree`

---

### T3: List what the branch changed since its base

**What**: Add `changedSince(worktreePath, base)` to `file-tree.ts` — `git merge-base HEAD <base>`, then `git diff --name-status -z <mergeBase> HEAD` — and the pure `parseNameStatus(stdout)`.
**Where**: `src/main/file-tree.ts`
**Depends on**: T2
**Reuses**: `git.ts`; `ChangeStatus`.
**Requirement**: FXPL-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `parseNameStatus` maps `M`, `A`, `D`, `T` and scored `R100` / `C75` onto `ChangeStatus`, carrying `oldPath` for renames
- [ ] Only committed changes are listed — an uncommitted edit does not appear (spec assumption: committed only)
- [ ] A base that no longer exists returns `{ mergeBase: null, files: [], error }`
- [ ] Tests cover the parser cases and a temp repo two commits past its base
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 804 + 6 = **810**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): list the files a branch changed since its base`

---

### T4: Offer the possible bases

**What**: Add `listBases(worktreePath)` to `file-tree.ts` — default from `git symbolic-ref --short refs/remotes/origin/HEAD`, choices from `git for-each-ref --format=%(refname:short) refs/heads refs/remotes`.
**Where**: `src/main/file-tree.ts`
**Depends on**: T3
**Reuses**: `git.ts`.
**Requirement**: FXPL-09, 10, 11

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A repo whose `origin/HEAD` points at `origin/main` returns `defaultBase: 'origin/main'`
- [ ] A repo with no `origin/HEAD` returns `defaultBase: null` — never a guessed branch
- [ ] `branches` lists local and remote branches, without the `origin/HEAD` symref itself
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 810 + 3 = **813**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): offer the bases a branch can be compared to`

---

### T5: Read a file for the viewer

**What**: Create `src/main/file-reader.ts` with `readForView(worktreePath, relPath)` and the pure `resolveInside(root, relPath)` and `isBinary(head)`.
**Where**: `src/main/file-reader.ts`
**Depends on**: T4
**Reuses**: The `mkdtempSync` real-fs pattern.
**Requirement**: FXPL-16, 17, 20, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `resolveInside` rejects an absolute path and `../` escapes, and accepts a path through a folder inside the root
- [ ] `isBinary` is true for a NUL byte within the first 8000 bytes and false otherwise
- [ ] A file above 1 MB returns `too-large` **without being read** (asserted by size with a sparse or large temp file, not by timing)
- [ ] Missing file → `missing`; binary → `binary`; Latin-1 bytes → `text` containing `U+FFFD`
- [ ] `src/main/file-reader.test.ts` created
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 813 + 9 = **822**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): read a worktree file for the viewer`

---

### T6: Watch the selected worktree

**What**: Create `src/main/file-watcher.ts` — a DI'd `FileWatcher` taking a `WatchPort`, a git-dir resolver, a scheduler and an emit callback; `select(worktreePath | null)` opens one recursive watch on the root plus watches on `<git-dir>/index` and `<git-dir>/HEAD`, batching events for 250 ms.
**Where**: `src/main/file-watcher.ts`
**Depends on**: T5
**Reuses**: The injected-fake pattern of `task-board.test.ts` (pattern 3).
**Requirement**: FXPL-21, 22, 23

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Three events inside 250 ms emit **one** `FilesChanged` carrying all three paths
- [ ] An event under the root's `.git` entry is dropped
- [ ] An `index` or `HEAD` event sets `gitStateChanged: true` — the linked-worktree case the design verified
- [ ] `select(other)` closes every handle of the previous worktree before opening new ones; `select(null)` closes all
- [ ] A pending batch for a deselected worktree is discarded, not emitted
- [ ] `src/main/file-watcher.test.ts` created, using fakes only — no real `fs.watch`
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 822 + 7 = **829**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): watch the selected worktree for file changes`

---

### T7: Make the launchers safe for arbitrary files

**What**: In `shortcut-launcher.ts`, launch Explorer with `/select,<path>` when the target is a file, and launch VS Code with the path passed through an environment variable (`code "%PLAYGROUND_TARGET%"`) instead of interpolated into the shell line.
**Where**: `src/main/shortcut-launcher.ts`
**Depends on**: T6
**Reuses**: The existing pure-helper test style (`buildElevatedOpen`).
**Requirement**: FXPL-25, 27, 29, 30

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The argument builders are pure, exported and tested: a file yields `/select,`, a folder does not
- [ ] The VS Code launch line never contains the path; the path travels only in the environment
- [ ] **Verified by hand on this machine**: Explorer selects `C:\tmp\a b, c\x.txt` (space and comma); VS Code opens a file named `%PATH%.txt`. If Explorer mis-parses, fall back to opening the parent folder and record it as `SPEC_DEVIATION` here
- [ ] `openVisualStudio` is unchanged — `.sln` reuse needs no launcher change
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 829 + 4 = **833**

**Tests**: unit
**Gate**: full
**Commit**: `fix(main): launch explorer and vs code safely on any file`

---

### T8: Serve the files channels

**What**: Register the five `files:*` handlers in `index.ts`, construct the `FileWatcher` with the real `fs.watch` and `emit`, and resolve the git-dir with `git rev-parse --git-dir`.
**Where**: `src/main/index.ts`
**Depends on**: T7
**Reuses**: `handle()`, `emit()`, the registration style of `handle('worktrees:changes', …)`.
**Requirement**: FXPL-02, 08, 09, 16, 21, 23

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Each handler is a one-line delegation
- [ ] The watcher is closed on app quit
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: **833** (unchanged — wiring)

**Tests**: none
**Gate**: build
**Commit**: `feat(main): serve the files direction channels`

---

### T9: Add the Files direction to the config schema

**What**: Add `'files'` to `AppConfig.ui.direction` and the optional `ui.files?: Record<worktreeId, { mode: FilesMode; base?: string }>`.
**Where**: `src/shared/config.ts`
**Depends on**: T8
**Reuses**: The flat, optional-means-default convention of the other `ui.*` keys.
**Requirement**: FXPL-01, 13

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `DEFAULT_CONFIG` is unchanged — absent `files` means full folder and `origin/HEAD` (D4)
- [ ] An existing `config.json` without the key loads unchanged (existing `config-store` tests stay green unedited)
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **833** (unchanged — schema)

**Tests**: none
**Gate**: full
**Commit**: `feat(shared): add the files direction to the config`

---

### T10: Nest a flat path list into a tree

**What**: Create `src/renderer/src/lib/files-view.ts` with `buildTree(paths)` and `isSolution(path)`.
**Where**: `src/renderer/src/lib/files-view.ts`
**Depends on**: T9
**Reuses**: `ChangedPath` from T1.
**Requirement**: FXPL-08, 12, 28

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `buildTree` nests `a/b/c.ts` and `a/d.ts` under one `a`, keeping each leaf's status
- [ ] Sorting matches `foldChildren`: folders first, then alphabetical, case-insensitive
- [ ] `isSolution` accepts `.sln` and `.slnx` in any case and rejects `.sln.bak`
- [ ] `files-view.test.ts` created
- [ ] Gate passes: `npm test`
- [ ] Test count: 833 + 6 = **839**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): nest changed paths into a tree`

---

### T11: Decide tab close and launcher target

**What**: Add `tabsAfterClose(tabs, closedIndex)` and `launcherTarget(activeTab, lastFolder)` to `files-view.ts`.
**Where**: `src/renderer/src/lib/files-view.ts`
**Depends on**: T10
**Reuses**: Nothing — new pure logic.
**Requirement**: FXPL-19, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Closing the active middle tab focuses the next one; closing the last focuses the previous; closing the only tab leaves none
- [ ] Closing an inactive tab keeps the active one
- [ ] `launcherTarget` returns whichever of the active file and the last selected folder is more recent, and null when neither exists
- [ ] Gate passes: `npm test`
- [ ] Test count: 839 + 6 = **845**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide tab focus and launcher target`

---

### T12: Decide mode defaults and which tabs a change touches

**What**: Add `filesStateFor(ui, worktreeId)` and `tabsAffected(openTabs, changedPaths)` to `files-view.ts`.
**Where**: `src/renderer/src/lib/files-view.ts`
**Depends on**: T11
**Reuses**: `FilesChanged` from T1.
**Requirement**: FXPL-13, 21, 23

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] An unknown worktree yields full folder and no base; a stored one yields its mode and base
- [ ] `tabsAffected` returns only open tabs whose path is in the change — the scoped reaction of FXPL-23
- [ ] Path comparison is separator-insensitive (`src\a.ts` equals `src/a.ts`)
- [ ] Gate passes: `npm test`
- [ ] Test count: 845 + 5 = **850**
- [ ] Phase gate passes: `npx electron-vite build`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide files mode defaults and affected tabs`

---

### T13: Prove Monaco runs here — spike

**What**: Add `monaco-editor`, create `src/renderer/src/lib/monaco-setup.ts` (the `editor.api` + basic-language contributions + `editor.worker` via Vite `?worker`, theme following `data-theme`), and prove a read-only editor renders in dev **and** in the packaged build.
**Where**: `src/renderer/src/lib/monaco-setup.ts`
**Depends on**: T12
**Reuses**: The AM1 spike precedent (`agent-spike`): prove the risky stack packaged before building on it.
**Requirement**: FXPL-17

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `monaco-editor` added to `dependencies` in `package.json`, version pinned
- [ ] A throwaway mount renders a highlighted `.ts` file in `npm run dev` with **no CSP violation** in the console
- [ ] The same in `dist/win-unpacked` after `npm run build:unpack`
- [ ] The worker is served as a file, not a `blob:` URL (checked in DevTools' Sources)
- [ ] Bundle growth measured (renderer output size before vs after) and written in the commit body
- [ ] Theme flips between `vs` and `vs-dark` with the app theme
- [ ] The throwaway mount is removed before commit; `monaco-setup.ts` stays
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **850** (unchanged — renderer setup)

**Tests**: none
**Gate**: build
**Commit**: `feat(renderer): set up a read-only monaco editor`

---

### T14: Render a file read-only

**What**: Create the `CodeViewer` component — Monaco read-only for a `text` `FileContent`, language from the extension, keeping `scrollTop` when the content is replaced, with the "file view, not a diff" label when opened from a diff mode.
**Where**: `src/renderer/src/components/CodeViewer.tsx`
**Depends on**: T13
**Reuses**: `monaco-setup.ts` from T13.
**Requirement**: FXPL-14, 17, 21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Replacing the content keeps the scroll position (checked by hand with a long file)
- [ ] The editor is created once per tab and disposed on unmount — no model leak across tab switches
- [ ] The diff-mode label renders only when the tab was opened from a diff mode
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **850** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render a file read-only`

---

### T15: Render what cannot be shown

**What**: Create the `FilePlaceholder` component for `binary`, `too-large`, `missing` and a deleted-listed file — name, size, type, and the launcher row.
**Where**: `src/renderer/src/components/FilePlaceholder.tsx`
**Depends on**: T14
**Reuses**: The launcher icons already used by `WorktreeDetail`.
**Requirement**: FXPL-15, 20, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Each of the four kinds has its own wording; size is human-readable
- [ ] A deleted file shows no launcher that would open a missing path
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: **850** (unchanged)

**Tests**: none
**Gate**: build
**Commit**: `feat(renderer): show a placeholder for files that cannot render`

---

### T16: Own the Files state in a hook

**What**: Create `src/renderer/src/lib/use-files.ts` — per-worktree in-memory tabs, active tab, expanded folders and last folder; persisted mode and base via `config:patch`; `files:watch` with the selected worktree while the direction is Files and `null` otherwise; on `files:changed`, re-read `tabsAffected(...)` and re-list the current mode.
**Where**: `src/renderer/src/lib/use-files.ts`
**Depends on**: T15
**Reuses**: `use-tree.ts` / `use-sessions.ts` shape (AD-004); `files-view.ts`.
**Requirement**: FXPL-06, 13, 18, 21, 22, 23

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Switching worktree and back restores that worktree's tabs and mode
- [ ] Leaving the Files direction sends `files:watch(null)`
- [ ] `gitStateChanged` refreshes the uncommitted list even when no tracked path is in the batch
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **850** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): own the files direction state`

---

### T17: Render the tree and its lenses

**What**: Create the `FileTree` component — mode selector at the top, base picker in diff-to-origin mode (with the no-`origin/HEAD` prompt), lazy folder expansion, statuses in the diff modes, `.sln`/`.slnx` routed to VS 2026.
**Where**: `src/renderer/src/components/FileTree.tsx`
**Depends on**: T16
**Reuses**: The sidebar tree's row styles; `buildTree`; `isSolution`.
**Requirement**: FXPL-04, 05, 07, 08, 09, 10, 11, 12, 15, 28

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Expanding a folder triggers exactly one `files:list-dir` for that folder
- [ ] With no default base, the diff mode lists nothing and the picker asks for a base
- [ ] Clicking a `.sln` opens VS 2026 and opens no tab
- [ ] A git error renders in place of the tree
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **850** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render the file tree and its modes`

---

### T18: Render the tabs and the launcher row

**What**: Create the `FileTabs` component — tab strip, close behaviour via `tabsAfterClose`, the viewer or placeholder for the active tab, and the Explorer / VS Code / VS 2022 / VS 2026 row targeting `launcherTarget(...)`.
**Where**: `src/renderer/src/components/FileTabs.tsx`
**Depends on**: T17
**Reuses**: `CodeViewer`, `FilePlaceholder`, `shortcuts:launch`, the existing launch-failure toast.
**Requirement**: FXPL-16, 18, 19, 25, 26, 30

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Clicking an already-open file focuses its tab instead of opening another
- [ ] The launcher row acts on the folder when a folder was selected after the active tab was opened
- [ ] A failed launch shows the existing toast
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **850** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render file tabs and launchers`

---

### T19: Compose the Files direction

**What**: Create the `FilesView` component — empty state, path-missing state, and the `ResizablePane` split of `FileTree` and `FileTabs`.
**Where**: `src/renderer/src/components/FilesView.tsx`
**Depends on**: T18
**Reuses**: `ResizablePane`; the path-missing state the tree already derives.
**Requirement**: FXPL-02, 03, 06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] No selection shows the empty state; a vanished worktree shows path-missing with no tree and no tabs
- [ ] The split is resizable like the sidebar
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **850** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): compose the files direction`

---

### T20: Add the Files segment to the TopBar

**What**: Add the sixth `Files` segment to the TopBar's direction control.
**Where**: `src/renderer/src/components/TopBar.tsx`
**Depends on**: T19
**Reuses**: The existing segment markup (`TopBar.tsx:98-130`).
**Requirement**: FXPL-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The segment carries `aria-selected` like the other five
- [ ] Six segments fit at the app's minimum window width in both themes
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **850** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): add the files segment to the top bar`

---

### T21: Mount the Files direction

**What**: Mount `FilesView` in `App.tsx` for `direction === 'files'`, wired to `use-files` and the global selection.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T20
**Reuses**: `selectedId`, `findWorktree`, `setToast` already in App.
**Requirement**: FXPL-01, 02, 06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The chosen direction persists across a restart like the other five
- [ ] App gains a mount and a prop bundle only — no logic (AD-004)
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: **850** (unchanged)

**Tests**: none
**Gate**: build
**Commit**: `feat(renderer): mount the files direction`

---

### T22: Land the status bar counter in Files

**What**: Replace the changed-files popover trigger in `StatusBar` with an `onOpenChanges(worktreeId)` callback; App switches to Files on that worktree and stores uncommitted-changes as its mode.
**Where**: `src/renderer/src/components/StatusBar.tsx`
**Depends on**: T21
**Reuses**: `use-files`' mode persistence from T16.
**Requirement**: FXPL-31, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Clicking the counter from any direction lands in Files, uncommitted mode, on that worktree
- [ ] The forced mode is what the worktree restores next time
- [ ] `ChangesPopover` is no longer mounted by the counter; the file is removed if nothing else imports it
- [ ] `status-bar/spec.md` STBR-30 and STBR-32 carry a "superseded by FXPL-31" note (the AD-018 pattern)
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **850** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): open the changed files from the status bar`

---

### T23: Drive the Files direction end to end

**What**: Create `scripts/smoke-files.mjs` — seeds a temp repo (ignored folder, untracked file, two commits past `main`, one uncommitted edit, a binary, a 2 MB text file, a `.sln`), registers it, and drives every surface.
**Where**: `scripts/smoke-files.mjs`
**Depends on**: T22
**Reuses**: The CDP harness and teardown of `scripts/smoke-time.mjs`.
**Requirement**: FXPL-01..32 end to end; the sole evidence for 03, 06, 14, 16, 18, 19, 21, 22, 24, 25, 26, 28, 31, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Checks: the segment; empty state; ignored folder absent; lazy expansion; each mode's list; base picker default; mode restored after a worktree switch; a tab opening, updating within 1 s after a shell append **without losing scroll**, and turning into the missing placeholder after deletion; binary and 2 MB placeholders; `.sln` opening no tab; the counter landing in uncommitted mode
- [ ] VS 2026 / UAC and Explorer selection are recorded as hand checks, not scripted — the smoke never raises a UAC prompt
- [ ] Unregisters the temp workspace and restores the owner's direction and theme
- [ ] Numbered pass/fail line per check; all pass against a live dev app

**Tests**: manual
**Gate**: manual
**Commit**: `test(files): drive the files direction end to end`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8
Phase 2:  T9 → T10 → T11 → T12
Phase 3:  T13 → T14 → T15
Phase 4:  T16 → T17 → T18 → T19 → T20 → T21
Phase 5:  T22 → T23
```

Strictly sequential. **Packing** (~7 per batch, whole phases): Phase 1 (8) = batch 1; Phases 2 + 3 (4 + 3) = batch 2; Phases 4 + 5 (6 + 2) = batch 3. 23 tasks > 8, so the sub-agent offer applies at Execute — offer-then-confirm.

**T13 is a stop point regardless of batching**: if Monaco does not run packaged under the CSP, Phase 3 onward is re-planned before any component is written.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 types file + contract entries | ✅ |
| T2 | 1 function + 1 pure fold | ✅ |
| T3 | 1 function + 1 parser | ✅ |
| T4 | 1 function | ✅ |
| T5 | 1 function + 2 pure guards, same module | ✅ |
| T6 | 1 class | ✅ |
| T7 | 2 launch cases in 1 module | ⚠️ cohesive — both are "safe on an arbitrary file" |
| T8 | 1 wiring file | ✅ |
| T9 | 1 schema change | ✅ |
| T10 | 2 small pure functions | ✅ |
| T11 | 2 small pure functions | ✅ |
| T12 | 2 small pure functions | ✅ |
| T13 | 1 setup module (+ its dependency) | ✅ |
| T14–T21 | 1 component / hook / mount each | ✅ |
| T22 | 1 component change | ✅ |
| T23 | 1 script | ✅ |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | phase head | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | T3 | T3 → T4 | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | T5 | T5 → T6 | ✅ |
| T7 | T6 | T6 → T7 | ✅ |
| T8 | T7 | T7 → T8 | ✅ |
| T9 | T8 | T8 → T9 (boundary) | ✅ |
| T10 | T9 | T9 → T10 | ✅ |
| T11 | T10 | T10 → T11 | ✅ |
| T12 | T11 | T11 → T12 | ✅ |
| T13 | T12 | T12 → T13 (boundary) | ✅ |
| T14 | T13 | T13 → T14 | ✅ |
| T15 | T14 | T14 → T15 | ✅ |
| T16 | T15 | T15 → T16 (boundary) | ✅ |
| T17 | T16 | T16 → T17 | ✅ |
| T18 | T17 | T17 → T18 | ✅ |
| T19 | T18 | T18 → T19 | ✅ |
| T20 | T19 | T19 → T20 | ✅ |
| T21 | T20 | T20 → T21 | ✅ |
| T22 | T21 | T21 → T22 (boundary) | ✅ |
| T23 | T22 | T22 → T23 | ✅ |

---

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | Shared types + contract | none | none | ✅ |
| T2–T4 | Main module with logic | unit | unit | ✅ |
| T5 | Main module + pure guards | unit | unit | ✅ |
| T6 | Main module (DI) | unit | unit | ✅ |
| T7 | Main module (launcher) | unit | unit | ✅ |
| T8 | Thin Electron shell | none | none | ✅ |
| T9 | Config schema | none | none | ✅ |
| T10–T12 | Pure helpers | unit | unit | ✅ |
| T13 | Renderer setup | none | none | ✅ |
| T14, T15 | Renderer components | none | none | ✅ |
| T16 | Renderer hook | none | none | ✅ |
| T17–T21 | Renderer components / wiring | none | none | ✅ |
| T22 | Renderer component | none | none | ✅ |
| T23 | Smoke script | manual only | manual | ✅ |

---

## Requirement Traceability

| AC | Tasks |
| -- | ----- |
| FXPL-01 | T9, T20, T21, T23 |
| FXPL-02 | T1, T8, T19, T21, T23 |
| FXPL-03 | T19, T23 |
| FXPL-04 | T2, T17, T23 |
| FXPL-05 | T2, T17, T23 |
| FXPL-06 | T16, T19, T21, T23 |
| FXPL-07 | T17, T23 |
| FXPL-08 | T3, T10, T17, T23 |
| FXPL-09 | T4, T17, T23 |
| FXPL-10 | T4, T17, T23 |
| FXPL-11 | T4, T17, T23 |
| FXPL-12 | T10, T17, T23 |
| FXPL-13 | T9, T12, T16, T23 |
| FXPL-14 | T14, T23 |
| FXPL-15 | T15, T17, T23 |
| FXPL-16 | T5, T18, T23 |
| FXPL-17 | T5, T13, T14 |
| FXPL-18 | T16, T18, T23 |
| FXPL-19 | T11, T18, T23 |
| FXPL-20 | T5, T15, T23 |
| FXPL-21 | T6, T12, T14, T16, T23 |
| FXPL-22 | T6, T16, T23 |
| FXPL-23 | T6, T12, T16 |
| FXPL-24 | T5, T15, T23 |
| FXPL-25 | T7, T18, T23 |
| FXPL-26 | T11, T18, T23 |
| FXPL-27 | T7 |
| FXPL-28 | T10, T17, T23 |
| FXPL-29 | T7 |
| FXPL-30 | T7, T18 |
| FXPL-31 | T22, T23 |
| FXPL-32 | T22, T23 |

All 32 mapped; none unmapped.
