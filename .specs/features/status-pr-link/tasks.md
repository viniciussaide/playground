# Status PR Link Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: inline. Two pure functions decide everything the bar shows — `reviewMark(reviewers)` and `prChip(results)`, which turns both providers' search results and details into one of `one`, `many`, `create`, `unknown`, `hidden` — so rendering is a switch. The lookup is F4's `use-pull-request` (as amended by F5): T3 reads it as built and either lifts its per-worktree search-and-cache into a shared hook mounted by App, or, if it already lives above the direction switch, uses it as is. T3 records which.
**Status**: Draft — awaiting owner approval (planned 2026-09-22)

**Branch**: `feature/status-pr-link` off `feature/files-pr-github` `5010b69`. **Executes only after F5** (and therefore F1–F4) is executed: rebase onto the executed `feature/files-pr-github` first. Names below (`PrSearch`, `PrDetail`, reviewer `state`, `ado-pr:*`, `github-pr:*`, `use-pull-request`) are F4/F5's planned names; re-read them from the executed code at Execute and adjust this file before T1.

**Test baseline**: **re-measure** with `npx vitest run` as the first act of Execute (after the rebase); record the lint warning count at the same time.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts; style sampled from `src/renderer/src/lib/status-bar.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure chip logic (`pr-status.ts`) | unit | 1:1 to SPRL-03..08, 12, 15–19 and the failed-`get` edge case, for both providers' reviewer states | `src/renderer/src/lib/pr-status.test.ts` | `npm test` |
| Lookup hook and App wiring | none (smoke) | SPRL-01, 02, 09, the stale-answer and shared-lookup edge cases | — | smoke |
| `StatusBar` component and CSS | none (CDP smoke) | SPRL-10–14 | — | smoke |
| End to end, stubbed providers | manual CDP smoke | Every chip kind, rendered from stubbed `find`/`get` answers | `scripts/smoke-status-bar.mjs` | live dev app |
| End to end, real PR | manual, owner-driven | SPRL-10, 11, 15 against the sandbox PRs F4/F5 used | — | live dev app |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a code task | `npm run typecheck && npm run lint && npm test` |
| Build | Wiring tasks and phase ends | `npx electron-vite build` |
| Manual | T7, T8 | smoke / owner check |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

---

## Execution Plan

### Phase 1: Rules

```
T1 → T2
```

### Phase 2: Lookup and opening

```
T2 → T3 → T4
```

### Phase 3: The chip

```
T4 → T5 → T6
```

### Phase 4: Prove

```
T6 → T7 → T8
```

---

## Task Breakdown

### T1: `reviewMark` and the tooltip lines

**What**: `reviewMark(reviewers)` → `'rejected' | 'changes' | 'approved' | null`, the worst mark winning, over F4's provider-neutral reviewer states; `reviewLines(reviewers)` → one `"<name>: <state label>"` line per reviewer.
**Where**: `src/renderer/src/lib/pr-status.ts` (new) and its test
**Depends on**: None
**Reuses**: F4's `Reviewer` type as amended by F5
**Requirement**: SPRL-04, SPRL-05, SPRL-06, SPRL-07, SPRL-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests for each mark from ADO-shaped and GitHub-shaped reviewers; rejected beats changes beats approved; approved-with-suggestions counts as approved; no votes → `null`; groups and required flags do not change the mark
- [ ] Gate check passes: `npm test`
- [ ] Test count: baseline + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(status-bar): mark a pull request by its reviews`

---

### T2: `prChip`

**What**: `prChip({ ado, github, details })` → `{ kind: 'one', pr, mark, draft } | { kind: 'many', prs, notes } | { kind: 'create', provider } | { kind: 'unknown', reason } | { kind: 'hidden' }`.
**Where**: `src/renderer/src/lib/pr-status.ts`
**Depends on**: T1
**Reuses**: F4's `PrSearch`, `PrDetail`
**Requirement**: SPRL-03, SPRL-12, SPRL-15, SPRL-16, SPRL-17, SPRL-18, SPRL-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: one PR from either provider; one from each → `many`; one provider failing while the other found → the found PRs with a note; both `none` with creation available → `create`, without → `hidden`; `auth` or `error` with nothing found → `unknown` carrying the reason; no remote or detached on both → `hidden`; a PR whose detail failed → no mark
- [ ] Gate check passes: `npm test`
- [ ] Test count: T1 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(status-bar): decide what the pull request chip shows`

---

### T3: One lookup for the bar and the Pull request mode

**What**: Make the per-worktree PR search, detail fetch and cache available above the direction switch — by lifting it out of F4's `use-pull-request` into a shared hook App mounts, or by using it as is if it already lives there — triggered on selection, focus (5 s) and Refresh, dropping answers for a worktree no longer selected from the painted chip while still caching them.
**Where**: `src/renderer/src/lib/use-pull-request.ts`
**Depends on**: T2
**Reuses**: F4's hook
**Requirement**: SPRL-01, SPRL-02, SPRL-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The Pull request mode's own behaviour unchanged: F4/F5 smokes still pass on their seeds
- [ ] Which option was taken, and why, recorded in this task
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `refactor(files): share the pull request lookup above the directions`

---

### T4: Open a PR in the Files direction from outside it

**What**: `openPullRequest(worktreePath, prRef)` in App: switch the direction to Files, the mode to Pull request, and select that PR in F4's picker state.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T3
**Reuses**: `openChangedFiles`, which already switches to Files for the status bar
**Requirement**: SPRL-10, SPRL-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `feat(files): open a pull request from outside the files direction`

---

### T5: The chip and its menu

**What**: `StatusBar` renders `prChip`'s answer: `PR #<n> · Draft <mark>` with a tooltip and a ↗; `<n> PRs` with a menu (each item opens in the app and has its ↗; provider notes in the footer; Escape or outside click closes); a muted `Create PR`; a muted `PR ?` with its reason; nothing for `hidden`. Openers call `ado-pr:open` / `github-pr:open`.
**Where**: `src/renderer/src/components/StatusBar.tsx`
**Depends on**: T4
**Reuses**: the bar's existing popover dismissal (`SyncPopover`)
**Requirement**: SPRL-03, SPRL-08, SPRL-10..18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(status-bar): show the branch's pull request`

---

### T6: Chip styles

**What**: The chip, its marks (✕ ⏸ ✓ with text labels for screen readers, never colour alone), the muted variants and the menu, in both themes, fitting the bar at its minimum width.
**Where**: `src/renderer/src/components/StatusBar.css`
**Depends on**: T5
**Reuses**: the bar's section and popover styles
**Requirement**: SPRL-03..07, SPRL-15, SPRL-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] At 1100 px wide the bar does not wrap with a long branch and a `2 PRs` chip
- [ ] Gate check passes: `npm run lint` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `style(status-bar): style the pull request chip`

---

### T7: Smoke — every chip kind, stubbed

**What**: A section in `smoke-status-bar.mjs` that replaces `find`/`get` answers in the page (wrapping `window.api.invoke` for those channels only) and walks `one` with each mark and draft, `many` with its menu and a provider note, `create`, `unknown`, `hidden`, a stale answer after switching worktree, and the in-app open landing in Pull request mode.
**Where**: `scripts/smoke-status-bar.mjs`
**Depends on**: T6
**Reuses**: the script's temp workspace and restore-in-`finally`
**Requirement**: SPRL-03..18, stale-answer edge case

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Each check seen failing with its rule broken (mark order inverted; `create` shown without `createUrlAvailable`), then passing
- [ ] The stub is removed in `finally`; no real provider call is made by this section
- [ ] Gate check passes: `npm run lint` (warning count unchanged)

**Tests**: manual
**Gate**: manual

**Commit**: `test(status-bar): check every pull request chip state`

---

### T8: Owner check against a real PR

**What**: With the sandbox PRs F4/F5 used, the owner selects their worktree: the chip shows the PR and its mark; the chip opens Pull request mode; ↗ opens the browser; a branch without a PR shows `Create PR` and it opens the creation page.
**Where**: `.specs/features/status-pr-link/tasks.md` (result)
**Depends on**: T7
**Reuses**: F4 T1 / F5 T1 sandbox PRs — **never** a real team PR, never `obogoni/playground`
**Requirement**: SPRL-01, SPRL-10, SPRL-11, SPRL-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Each step's outcome recorded without PR numbers, titles, org or repository names (public repository)
- [ ] Nothing written to any provider (the chip only reads and opens)

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): record the owner check of the pull request chip`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ------→ T2
Phase 2:  T2 ------→ T3 ------→ T4
Phase 3:  T4 ------→ T5 ------→ T6
Phase 4:  T6 ------→ T7 ------→ T8
```

Eight tasks: a single batch, executed inline. The Verifier runs after T8.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: marks | 2 pure functions, 1 file | ⚠️ Cohesive |
| T2: chip | 1 pure function | ✅ Granular |
| T3: shared lookup | 1 hook | ✅ Granular |
| T4: opener | 1 App callback | ✅ Granular |
| T5: chip | 1 component | ✅ Granular |
| T6: styles | 1 stylesheet | ✅ Granular |
| T7: smoke | 1 section | ✅ Granular |
| T8: owner check | 1 manual check | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | Phase 1 start | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | pure chip logic | unit | unit | ✅ OK |
| T2 | pure chip logic | unit | unit | ✅ OK |
| T3 | lookup hook | none | none | ✅ OK |
| T4 | App wiring | none | none | ✅ OK |
| T5 | component | none | none | ✅ OK |
| T6 | CSS | none | none | ✅ OK |
| T7 | end to end, stubbed | manual | manual | ✅ OK |
| T8 | spec docs | none (manual) | none | ✅ OK |
