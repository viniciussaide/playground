# Files Direction — Commits (F3) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/files-commits/design.md`
**Status**: Draft

**Branch**: `feature/files-commits`, stacked on `feature/files-diff`. Once F2 merges, `git rebase --onto origin/main feature/files-diff feature/files-commits`.

**Prerequisite**: F2 executed **with its T16 as amended** — `AllChangesTab` takes files, stats and a request builder as props. If F2 shipped without that amendment, stop and add a refactor task before T13.

**Test baseline**: **898** — F2's projected end, resting on a chain of projections back to `origin/main`'s recorded 748. **Re-measure with `npm test` as the first act of Execute.**

**Baseline measured 2026-09-19** with `npx vitest run` on `origin/main` `6ecd19c`, after the upstream merged #88: **917 tests / 52 files**, all passing. The 748 the plans started from was recorded before #88 and is stale by **+169**. Its baseline becomes **1067**; every count below shifts by **+169** and this feature ends at **1114**, not 945. Still re-measure as the first act of Execute.

**Privacy guardrail**: every remote URL in fixtures, tests and the smoke is fictitious (`acme/widget`, `dev.azure.com/acme/platform`). This repository is public.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main-process module with logic (`commit-log.ts`) | unit | All branches; 1:1 to the ACs it owns; merge and root fixtures mandatory | `src/main/commit-log.test.ts` | `npm test` |
| Pure helpers (`remote-url.ts`, `parseLog`, `commit-view.ts`, F2's `tabKeyOf`) | unit | Table-driven for every recognized and rejected remote form; input→output per AC | co-located `*.test.ts` | `npm test` |
| Shared types, IPC contract | none | build gate only | — | `npm run typecheck` |
| Thin Electron shell (`index.ts` wiring, the final `shell.openExternal`) | none (hand-verified) | — | `src/main/index.ts` | `npm run typecheck` |
| Renderer components and hook | none (CDP smoke + visual) | — | — | `node scripts/smoke-files-commits.mjs` |
| Out-of-CI smoke script | manual only | Every AC no unit test reaches | `scripts/smoke-*.mjs` | `node scripts/smoke-files-commits.mjs` (live session) |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a logic-bearing, contract or renderer task | `npm run typecheck && npm run lint && npm test` |
| Build | At each phase boundary | `npx electron-vite build` |
| Manual | The CDP smoke | `npm run dev -- -- --remote-debugging-port=9222`, then `node scripts/smoke-files-commits.mjs` |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

---

## Execution Plan

### Phase 1: Main process

```
T1 → T2 → T3 → T4 → T5 → T6 → T7
```

### Phase 2: Renderer decisions

```
T7 → T8 → T9 → T10
```

### Phase 3: The commits mode

```
T10 → T11 → T12 → T13 → T14 → T15
```

### Phase 4: End to end

```
T15 → T16
```

---

## Task Breakdown

### T1: Declare the commits contract

**What**: Add `'commits'` to `FilesMode` and the `CommitRow`, `CommitPage`, `CommitDetail` and `RemoteRef` types to `src/shared/files.ts`; register `commits:list`, `commits:files` and `commits:open` in `IpcContract`.
**Where**: `src/shared/files.ts`
**Depends on**: None
**Reuses**: F1's `FilesMode`, F2's `FileStat`, F1's `ChangedPath`, the existing `LaunchResult`.
**Requirement**: FCMT-01, 02, 11, 16, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `commits:open` takes a sha and a worktree path — **no URL field exists anywhere in the contract** (FCMT-28)
- [ ] An existing `ui.files` entry with one of the three older modes still typechecks and loads
- [ ] Lint warning baseline recorded in the commit body
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **898** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(shared): declare the commits contract`

---

### T2: Recognize a remote

**What**: Create `src/main/remote-url.ts` with the pure `parseRemote(url)` returning a GitHub or Azure DevOps `RemoteRef`, or null.
**Where**: `src/main/remote-url.ts`
**Depends on**: T1
**Reuses**: Nothing — new pure logic, designed for F4 / F5 to reuse.
**Requirement**: FCMT-23, 26, 27

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Table test, one row each: `https://github.com/acme/widget.git`, `https://github.com/acme/widget`, `git@github.com:acme/widget.git`, `ssh://git@github.com/acme/widget.git`, `https://acme@dev.azure.com/acme/platform/_git/widget`, `git@ssh.dev.azure.com:v3/acme/platform/widget`, `https://acme.visualstudio.com/platform/_git/widget`, `https://acme.visualstudio.com/DefaultCollection/platform/_git/widget`
- [ ] `https://user:token@github.com/acme/widget.git` parses with **no trace of the credential** in the result (edge case)
- [ ] A project with a space (`My%20Project`) decodes to `My Project`
- [ ] `https://gitlab.com/acme/widget.git`, a local path and an empty string return null
- [ ] `src/main/remote-url.test.ts` created
- [ ] Gate passes: `npm test`
- [ ] Test count: 898 + 10 = **908**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): recognize github and azure devops remotes`

---

### T3: Build a commit's page URL

**What**: Add the pure `commitUrl(ref, sha)` to `remote-url.ts`.
**Where**: `src/main/remote-url.ts`
**Depends on**: T2
**Reuses**: `RemoteRef` from T2.
**Requirement**: FCMT-24, 28

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] GitHub → `https://github.com/acme/widget/commit/<sha>`
- [ ] Azure DevOps (all three input forms) → `https://dev.azure.com/acme/platform/_git/widget/commit/<sha>`
- [ ] `My Project` re-encodes as `My%20Project`
- [ ] Every output starts with `https://`, asserted over the whole T2 table
- [ ] Gate passes: `npm test`
- [ ] Test count: 908 + 4 = **912**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): build a commit page url from a recognized remote`

---

### T4: List the branch's commits

**What**: Create `src/main/commit-log.ts` with `listCommits(worktreePath, base, cursor?)` and the pure `parseLog(stdout)` — first-parent, 101 rows to decide `hasMore`, cursor paging, the not-pushed set from `@{upstream}..HEAD`, and `browse` from the upstream remote.
**Where**: `src/main/commit-log.ts`
**Depends on**: T3
**Reuses**: `git.ts`; F1's merge base; `parseRemote`.
**Requirement**: FCMT-02, 03, 05, 08, 09, 10, 12, 13, 23, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `parseLog` keeps a body containing blank lines and tabs intact, marks a two-parent commit as a merge, and turns an empty subject into `(no subject)`
- [ ] A temp branch with three own commits and a merge of another branch bringing five lists **four** rows
- [ ] 150 commits → page one has 100 rows and `hasMore`; the cursor page has the remaining 50 and no `hasMore`; a commit added between the two pages causes no duplicate
- [ ] With a bare remote: pushed commits carry `pushed: true`, later ones `false`; with no upstream all are `false` and `upstream` is null
- [ ] `browse` is `github` for a fictitious GitHub upstream URL and null for a local-path remote
- [ ] `src/main/commit-log.test.ts` created
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 912 + 9 = **921**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): list a branch's own commits since its base`

---

### T5: List what one commit changed

**What**: Add `commitFiles(worktreePath, sha)` to `commit-log.ts` — parent from `<sha>^1`, then `git diff-tree -r -M -z --name-status` and `--numstat` between parent and commit, or `--root` for a root commit.
**Where**: `src/main/commit-log.ts`
**Depends on**: T4
**Reuses**: F1's `parseNameStatus`; F2's `parseNumstat`.
**Requirement**: FCMT-16, 17, 18

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] **A merge commit returns its changes against the first parent — not an empty list** (the design measured `diff-tree` returning 0 lines without `^1`)
- [ ] A root commit returns `parent: null` and every file as added
- [ ] A rename is returned with its `oldPath`
- [ ] A sha that does not exist returns `error` and never throws
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 921 + 5 = **926**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): list the files one commit changed`

---

### T6: Open a pushed commit safely

**What**: Add `openCommit(worktreePath, sha, open)` to `commit-log.ts`, with the opener injected — resolve the upstream remote, check `git merge-base --is-ancestor <sha> @{upstream}`, build with `commitUrl`, refuse anything not starting with `https://`, then call `open(url)`.
**Where**: `src/main/commit-log.ts`
**Depends on**: T5
**Reuses**: `parseRemote`, `commitUrl`; the `LaunchResult` shape.
**Requirement**: FCMT-24, 25, 26, 28

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A pushed commit calls `open` once with `https://github.com/acme/widget/commit/<sha>`
- [ ] An unpushed commit returns `{ ok: false }` and **`open` is never called**
- [ ] No upstream, or an unrecognized host, returns `{ ok: false }` and `open` is never called
- [ ] The URL passed to `open` never contains the remote's userinfo
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 926 + 4 = **930**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): open a pushed commit on its provider`

---

### T7: Serve the commits channels

**What**: Register `commits:list`, `commits:files` and `commits:open` in `index.ts`, injecting `shell.openExternal` as the opener.
**Where**: `src/main/index.ts`
**Depends on**: T6
**Reuses**: `handle()`; the existing registrations.
**Requirement**: FCMT-02, 16, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Three one-line delegations; `shell.openExternal` is reached only through `openCommit`
- [ ] The template's `setWindowOpenHandler` is **not** used by anything F3 adds
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: **930** (unchanged)

**Tests**: none
**Gate**: build
**Commit**: `feat(main): serve the commits channels`

---

### T8: Decide a commit's diffs and tab title

**What**: Create `src/renderer/src/lib/commit-view.ts` with `commitDiffRequest(sha, parent, changed)` and `commitTabTitle(row)`.
**Where**: `src/renderer/src/lib/commit-view.ts`
**Depends on**: T7
**Reuses**: F2's `DiffRequest` / `DiffRef`.
**Requirement**: FCMT-16, 17, 18

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Modified → `{ rev: parent }` to `{ rev: sha }`; added → original null; deleted → modified null; renamed → original at `oldPath`
- [ ] Root commit (`parent: null`) → original null for every file
- [ ] Title is `abc1234 · subject`, and `abc1234 · (no subject)` for an empty one
- [ ] `commit-view.test.ts` created
- [ ] Gate passes: `npm test`
- [ ] Test count: 930 + 6 = **936**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide a commit's diffs and tab title`

---

### T9: Decide the list's rows and actions

**What**: Add `mergePages(current, next)`, `uncommittedRowLabel(n)` and `browseState(row, page)` to `commit-view.ts`.
**Where**: `src/renderer/src/lib/commit-view.ts`
**Depends on**: T8
**Reuses**: `CommitRow`, `CommitPage`.
**Requirement**: FCMT-09, 14, 23, 25, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `mergePages` appends in order and drops a sha already present
- [ ] `uncommittedRowLabel(3)` is `Uncommitted changes (3)`; `0` yields null (no row)
- [ ] `browseState`: `hidden` when `browse` is null, `disabled` for an unpushed row, `enabled` otherwise
- [ ] Gate passes: `npm test`
- [ ] Test count: 936 + 7 = **943**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide commit rows and their actions`

---

### T10: Key commit tabs

**What**: Extend F2's `tabKeyOf` / `isSameTab` for commit tabs keyed `commit:<sha>`.
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T9
**Reuses**: F2's tab identity functions and tests, which must pass unedited.
**Requirement**: FCMT-20

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A commit tab never collides with a file, diff or All changes tab
- [ ] Two commit tabs with different shas are different tabs; the same sha is one tab
- [ ] Every pre-existing tab-identity test passes unedited
- [ ] Gate passes: `npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: 943 + 2 = **945**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): key commit tabs`

---

### T11: Hold commits state in the Files hook

**What**: Extend `use-files.ts` — commit pages per worktree in memory, commit tabs, and refresh on `gitStateChanged`, a base change, a change of the tree's identity (the status bar refreshes it after an operation) and window focus debounced by 5 s.
**Where**: `src/renderer/src/lib/use-files.ts`
**Depends on**: T10
**Reuses**: F1 / F2 hook shape; `mergePages`; the debounce pattern of `App.tsx:165`.
**Requirement**: FCMT-11, 20, 29, 30, 31, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A refresh replaces the list but never closes or changes an open commit tab (FCMT-31)
- [ ] A push from the status bar clears the not-pushed markers without a commit happening (FCMT-32)
- [ ] Focus refresh is ignored within 5 s of the previous one
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **945** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): hold commits state in the files hook`

---

### T12: Render the commit list

**What**: Create the `CommitList` component — base picker, the uncommitted row, commit rows (short sha, subject, author, relative date, merge badge, not-pushed marker, full message as `title`), Copy sha, Open in browser per `browseState`, Load more, empty and error states.
**Where**: `src/renderer/src/components/CommitList.tsx`
**Depends on**: T11
**Reuses**: F1's base picker; `navigator.clipboard.writeText` as `HoursView.tsx:148` uses it; `relativeTime`.
**Requirement**: FCMT-02, 03, 04, 05, 06, 07, 08, 09, 10, 12, 13, 14, 15, 21, 22, 23, 25, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Copy sha writes the **full** sha
- [ ] A disabled Open in browser carries the "not pushed yet" tooltip
- [ ] Activating the uncommitted row switches to uncommitted-changes mode
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **945** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render the commit list`

---

### T13: Render a commit's tab

**What**: Create the `CommitTab` component — fetch `commits:files` once, then mount F2's `AllChangesTab` with the commit's files, stats and `commitDiffRequest` bound to its sha and parent; git's error line when the commit is gone.
**Where**: `src/renderer/src/components/CommitTab.tsx`
**Depends on**: T12
**Reuses**: F2's props-driven `AllChangesTab` (F2 T16 as amended).
**Requirement**: FCMT-16, 17, 18, 19

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A merge commit's tab shows its first-parent changes, not an empty stack
- [ ] Layout, whitespace and EOL markers behave exactly as in F2
- [ ] `AllChangesTab` is mounted unmodified
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **945** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render a commit as a stack of diffs`

---

### T14: Add Commits to the mode selector

**What**: Add the fourth option to `FileTree`'s mode selector and render `CommitList` in its place while it is active.
**Where**: `src/renderer/src/components/FileTree.tsx`
**Depends on**: T13
**Reuses**: F1's selector and mode persistence.
**Requirement**: FCMT-01, 11

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The four options fit the left column at its minimum width
- [ ] The mode is persisted per worktree like the other three
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **945** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): add commits to the files mode selector`

---

### T15: Show commit tabs

**What**: Render commit tabs in `FileTabs`, closable, titled by `commitTabTitle`, kept across mode switches.
**Where**: `src/renderer/src/components/FileTabs.tsx`
**Depends on**: T14
**Reuses**: F1 / F2's tab strip; `CommitTab`.
**Requirement**: FCMT-16, 20

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Clicking an already-open commit focuses its tab
- [ ] Switching to any other mode leaves commit tabs open
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: **945** (unchanged)

**Tests**: none
**Gate**: build
**Commit**: `feat(renderer): show commit tabs`

---

### T16: Drive the commits mode end to end

**What**: Create `scripts/smoke-files-commits.mjs` — seeds a temp repo with a bare remote, a branch with own commits, a merge of another branch, a root-level rename, 150 commits for paging, two pushed commits, a dirty file, and a **fictitious** GitHub URL on the upstream remote with the remote-tracking ref set locally so no network is touched.
**Where**: `scripts/smoke-files-commits.mjs`
**Depends on**: T15
**Reuses**: F1 / F2 smoke harness and teardown.
**Requirement**: FCMT-01..32 end to end; the sole evidence for 04, 06, 07, 11, 14, 15, 19, 20, 21, 22, 29, 30, 31, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Checks: the fourth mode; first-parent rows with the merge badge; paging with Load more; markers on exactly the unpushed commits; the uncommitted row and its switch; a commit tab (incl. the merge) and it surviving a mode switch; Copy sha reading back the full sha; Open in browser enabled on a pushed row and disabled with its tooltip on an unpushed one; a new commit appearing within 1 s; the markers clearing after a push from the status bar
- [ ] **Does not click an enabled Open in browser** — it would open a real browser on a fictitious URL; `openCommit`'s URL is unit-tested (T6). Opening one real commit is a hand check
- [ ] Unregisters the temp workspace and restores the owner's direction and theme
- [ ] Numbered pass/fail line per check; all pass against a live dev app

**Tests**: manual
**Gate**: manual
**Commit**: `test(files): drive the commits mode end to end`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 → T2 → T3 → T4 → T5 → T6 → T7
Phase 2:  T8 → T9 → T10
Phase 3:  T11 → T12 → T13 → T14 → T15
Phase 4:  T16
```

Strictly sequential. **Packing** (~7 per batch, whole phases): Phase 1 (7) = batch 1; Phases 2 + 3 (3 + 5) = batch 2; Phase 4 (1) = batch 3. 16 tasks > 8, so the sub-agent offer applies at Execute — offer-then-confirm.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 types file + contract entries | ✅ |
| T2 | 1 pure function | ✅ |
| T3 | 1 pure function | ✅ |
| T4 | 1 function + 1 parser | ✅ |
| T5 | 1 function | ✅ |
| T6 | 1 function | ✅ |
| T7 | 1 wiring file | ✅ |
| T8 | 2 small pure functions | ✅ |
| T9 | 3 small pure functions | ⚠️ cohesive — all decide what a list row shows |
| T10 | 1 function extension | ✅ |
| T11 | 1 hook extension | ✅ |
| T12–T15 | 1 component each | ✅ |
| T16 | 1 script | ✅ |

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
| T8 | T7 | T7 → T8 (boundary) | ✅ |
| T9 | T8 | T8 → T9 | ✅ |
| T10 | T9 | T9 → T10 | ✅ |
| T11 | T10 | T10 → T11 (boundary) | ✅ |
| T12 | T11 | T11 → T12 | ✅ |
| T13 | T12 | T12 → T13 | ✅ |
| T14 | T13 | T13 → T14 | ✅ |
| T15 | T14 | T14 → T15 | ✅ |
| T16 | T15 | T15 → T16 (boundary) | ✅ |

---

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | Shared types + contract | none | none | ✅ |
| T2, T3 | Pure helper | unit | unit | ✅ |
| T4–T6 | Main module with logic | unit | unit | ✅ |
| T7 | Thin Electron shell | none | none | ✅ |
| T8–T10 | Pure helpers | unit | unit | ✅ |
| T11 | Renderer hook | none | none | ✅ |
| T12–T15 | Renderer components | none | none | ✅ |
| T16 | Smoke script | manual only | manual | ✅ |

---

## Requirement Traceability

| AC | Tasks |
| -- | ----- |
| FCMT-01 | T1, T14, T16 |
| FCMT-02 | T1, T4, T7, T12, T16 |
| FCMT-03 | T4, T12, T16 |
| FCMT-04 | T12, T16 |
| FCMT-05 | T4, T12, T16 |
| FCMT-06 | T12, T16 |
| FCMT-07 | T12, T16 |
| FCMT-08 | T4, T12, T16 |
| FCMT-09 | T4, T9, T12, T16 |
| FCMT-10 | T4, T12 |
| FCMT-11 | T1, T11, T14, T16 |
| FCMT-12 | T4, T12, T16 |
| FCMT-13 | T4, T12 |
| FCMT-14 | T9, T12, T16 |
| FCMT-15 | T12, T16 |
| FCMT-16 | T1, T5, T7, T8, T13, T15, T16 |
| FCMT-17 | T5, T8, T13 |
| FCMT-18 | T5, T8, T13 |
| FCMT-19 | T13, T16 |
| FCMT-20 | T10, T11, T15, T16 |
| FCMT-21 | T12, T16 |
| FCMT-22 | T12, T16 |
| FCMT-23 | T2, T4, T9, T12, T16 |
| FCMT-24 | T1, T3, T6, T7 |
| FCMT-25 | T6, T9, T12, T16 |
| FCMT-26 | T2, T4, T6, T9, T12 |
| FCMT-27 | T2 |
| FCMT-28 | T1, T3, T6, T7 |
| FCMT-29 | T11, T16 |
| FCMT-30 | T11, T16 |
| FCMT-31 | T11, T16 |
| FCMT-32 | T11, T16 |

All 32 mapped; none unmapped.
