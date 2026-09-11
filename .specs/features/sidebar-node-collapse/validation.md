# Sidebar Node Collapse Validation

**Date**: 2026-09-11
**Spec**: `.specs/features/sidebar-node-collapse/spec.md`
**Diff range**: `ed8d510..HEAD` (81cf020 spec commit + 4 implementation commits: 4ea67a4, e899ee7, dd61076, 682214a)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status     | Notes                                            |
| ---- | ---------- | ------------------------------------------------ |
| T1   | ✅ Done    | `config.ts` field added; gate green at commit    |
| T2   | ✅ Done    | helpers + 11 co-located unit tests               |
| T3   | ✅ Done    | Sidebar chevron button + gating branch           |
| T4   | ✅ Done    | App wiring: derive, toggle, drop, persist        |

All 4 tasks marked ✅ Complete in `tasks.md`. Dependencies (T3→T2, T4→T2,T3) honored per commit order.

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WSCL-01: WHEN the user activates a workspace row's chevron THEN the app SHALL toggle that workspace between expanded and collapsed | id appended when absent, removed when present, other ids/order preserved | `src/renderer/src/lib/workspace-collapse.test.ts:31` - `expect(toggleCollapsedId(['c:\repo-a'], 'c:\repo-b')).toEqual(['c:\repo-a', 'c:\repo-b'])`; `:36` - `expect(toggleCollapsedId(['a','b','c'], 'b')).toEqual(['a','c'])`; `:43` - order preserved; impl `workspace-collapse.ts:9-11`; renderer wiring `Sidebar.tsx:191` (`onClick={onToggleCollapse}`) → `Sidebar.tsx:134` → `App.tsx:189-191` | ✅ PASS |
| WSCL-02: WHILE a workspace is collapsed the app SHALL NOT render its repos | repo rows (and "no git repos" note) absent from DOM while collapsed | `src/renderer/src/components/Sidebar.tsx:214` - `) : collapsed ? null : workspace.repos.length === 0 ? (` — collapsed branch renders null, making the repos map (`:217`) and note (`:215`) unreachable | ✅ PASS (hand-verified, renderer) |
| WSCL-03: WHILE collapsed its chevron SHALL point right, and while expanded SHALL point down | chevron-down glyph rotated -90° (right) when collapsed, unrotated (down) when expanded | `src/renderer/src/components/Sidebar.tsx:193` - `<span className={collapsed ? 'icon pane-chevron-right' : 'icon'}>`; `src/renderer/src/components/ResizablePane.css:106-108` - `.pane-chevron-right { transform: rotate(-90deg) }` | ✅ PASS (hand-verified, renderer) |
| WSCL-04: The workspace chevron SHALL be a `<button>` carrying an `aria-expanded` attribute that reflects the current state | real button, `aria-expanded` = current state, accessible name | `src/renderer/src/components/Sidebar.tsx:185-191` - `<button type="button" className="sidebar-workspace-chevron" aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${workspace.displayName}`} onClick={onToggleCollapse}>` | ✅ PASS (hand-verified, renderer) |
| WSCL-05: WHEN the collapsed state changes THEN the app SHALL persist the collapsed workspace ids via `config:patch` | `config:patch` invoked with `{ ui: { collapsedWorkspaces } }` on every toggle | `src/renderer/src/App.tsx:190` - `update({ collapsedWorkspaces: toggleCollapsedId(collapsedIds, id) })` → `App.tsx:89` - `api.invoke('config:patch', { ui: patch })` (existing update() channel, `.catch(console.error)` non-blocking) | ✅ PASS (hand-verified, renderer) |
| WSCL-06: WHERE a workspace id is absent from `ui.collapsedWorkspaces` the app SHALL render that workspace expanded | `isCollapsed` returns false for absent id and for empty list | `src/renderer/src/lib/workspace-collapse.test.ts:12` - `expect(isCollapsed(['c:\repo-a', 'c:\repo-b'], 'c:\repo-a')).toBe(true)`; `:15` - `expect(isCollapsed(['c:\repo-a'], 'c:\repo-b')).toBe(false)`; `:18` - `expect(isCollapsed([], 'c:\repo-a')).toBe(false)`; impl `workspace-collapse.ts:3-5`; derive `App.tsx:249` - `const collapsedIds = ui.collapsedWorkspaces ?? []` | ✅ PASS |
| WSCL-07: WHEN the app restarts THEN each workspace SHALL render in the state it was left in | persisted ids rehydrate on startup and drive the same rendering path | `App.tsx:124-126` - `api.invoke('config:get')...setUi(config.ui)` (rehydrate); `App.tsx:249` - `collapsedIds` derivation; `App.tsx:89` - `config:patch` persistence; `Sidebar.tsx:133` - `collapsed={isCollapsed(collapsedIds, workspace.id)}` | ✅ PASS (hand-verified, renderer) |
| WSCL-08: IF a workspace is collapsed AND its folder is missing THEN the app SHALL still render the "folder not found" note | note renders regardless of collapse state | `src/renderer/src/components/Sidebar.tsx:210-214` - `workspace.missing ? (<div className="sidebar-note error">… folder not found on disk</div>) : collapsed ? null : …` — the missing check is the FIRST branch, evaluated before the collapse gate | ✅ PASS (hand-verified, renderer) |
| WSCL-09: WHEN a workspace is removed from the registry THEN the app SHALL drop its id from `ui.collapsedWorkspaces` | id removed from persisted list; absent id leaves list unchanged | `src/renderer/src/lib/workspace-collapse.test.ts:49` - `expect(dropCollapsedId(['c:\repo-a', 'c:\repo-b'], 'c:\repo-a')).toEqual(['c:\repo-b'])`; `:53` - unchanged when absent; impl `workspace-collapse.ts:15-17`; `App.tsx:183-185` - `if (isCollapsed(collapsedIds, id)) update({ collapsedWorkspaces: dropCollapsedId(collapsedIds, id) })` | ✅ PASS |
| WSCL-10: IF `ui.collapsedWorkspaces` holds an id matching no registered workspace THEN the app SHALL ignore it | unknown ids never affect rendering | `src/renderer/src/lib/workspace-collapse.test.ts:20-22` - `expect(isCollapsed(['c:\removed'], 'c:\live')).toBe(false)`; `Sidebar.tsx:133` - only registered workspace ids are queried against the list; orphan ids persist inertly | ✅ PASS |
| WSCL-11: WHEN the user activates the chevron THEN the app SHALL NOT also trigger the row's remove button or its context menu | chevron activation toggles collapse only | `src/renderer/src/components/Sidebar.tsx:185-196` - chevron is its own `<button>` whose only handler is `onClick={onToggleCollapse}`; remove is a separate sibling `<button>` (`:201-208`); the row context menu is attached only to worktree rows (`Sidebar.tsx:278` via Repo `:225`) — the workspace row itself has no context-menu handler | ✅ PASS (hand-verified, renderer) |

**Status**: ✅ All 11 ACs covered (7 P1 + 4 edge cases) — 0 spec-precision gaps. Every spec outcome was precisely defined and matched by implementation evidence.

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| 1        | `src/renderer/src/lib/workspace-collapse.ts:4` | Flipped `ids.includes(id)` → `!ids.includes(id)` in `isCollapsed` | ✅ Killed (8/11 failed — all isCollapsed cases plus cascade into toggle/drop) |
| 2        | `src/renderer/src/lib/workspace-collapse.ts:10` | `toggleCollapsedId` always appends `[...ids, id]` (removal path removed) | ✅ Killed (1/11 failed — "removes a present id" WSCL-01) |
| 3        | `src/renderer/src/lib/workspace-collapse.ts:16` | `dropCollapsedId` as no-op `return ids` | ✅ Killed (1/11 failed — "removes a present id" WSCL-09) |

**Sensor depth**: lightweight (3 behavior-level mutations, default tier)
**Result**: 3/3 killed - PASS ✅
**Isolation**: baseline `git status --porcelain` (`?? .specs/features/session-activity-status/`, `?? .specs/features/session-idle-notifications/`) captured before scratch work; re-checked after cleanup — identical. Scratch `D:\temp\wscn-verify` (worktree at HEAD + node_modules junction) removed via `git worktree remove --force`.

---

## Interactive UAT Results

Not performed — this validation was executed by the independent Verifier sub-agent without a live desktop session (renderer behavior hand-verified per repo convention). Feature is user-facing; interactive UAT is offered as a follow-up.

---

## Code Quality

| Principle        | Status |
| ---------------- | ------ |
| Minimum code     | ✅ — 17-line pure lib (3 one-line functions); diff = 469 insertions across 8 files incl. spec docs |
| Surgical changes | ✅ — only the 6 files required by tasks + spec docs touched |
| No scope creep   | ✅ — every change maps to WSCL-01..11; no extras (no collapse-all, no repo collapse, no animation) |
| Matches patterns | ✅ — optional `ui` field + doc comment mirrors PANE-01/PANE-03 (`config.ts:40-49`); co-located `*.test.ts` (TESTING.md pattern 1); `update()`/`config:patch` channel (`App.tsx:87-90`); reuses `pane-chevron-right` (`ResizablePane.css:106`) |
| Spec-anchored outcome check (asserted values match spec) | ✅ — exact boolean/array assertions per spec outcome |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — pure lib has 1:1 mapping to WSCL-01/06/09/10 (all branches); renderer intentionally untested per TESTING.md, hand-verified |
| Every test maps to a spec requirement - no unclaimed tests | ✅ — 11 tests, all tagged WSCL-01/06/09/10; immutability tests map to T2 Done-when ("input array is never mutated") |
| Documented guidelines followed | ✅ — `.specs/codebase/TESTING.md` (renderer React components not unit-tested by convention; pure helpers co-located) |

**Observation (non-blocking, not a gap)**: `App.tsx:181-186` drops the collapsed id optimistically even if `workspaces:remove` fails; the spec is silent on removal failure, and the AC's precondition ("workspace is removed from the registry") holds on success — behavior matches spec under its stated precondition.

---

## Edge Cases

- [x] WSCL-08: Collapsed + folder missing → "folder not found" note still renders (`Sidebar.tsx:210-214`, missing check precedes collapse gate)
- [x] WSCL-09: Workspace removed → id dropped from `ui.collapsedWorkspaces` (`App.tsx:183-185` + `dropCollapsedId`, test `workspace-collapse.test.ts:49-59`)
- [x] WSCL-10: Orphan ids in `ui.collapsedWorkspaces` ignored (test `workspace-collapse.test.ts:20-22`; `Sidebar.tsx:133` only queries registered ids)
- [x] WSCL-11: Chevron activation does not trigger remove/context menu (dedicated button `Sidebar.tsx:185-196`; remove button separate `:201-208`; context menu only on worktree rows `:278`)

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (full) + `npm run build:win` (build)
- **Result**: typecheck ✅ · lint ✅ (0 errors, 19 warnings) · tests 678 passed, 0 failed, 0 skipped (45 files) · build ✅
- **Lint baseline**: 19 warnings are exactly the pre-existing prettier baseline (`scripts/fixtures/implement-ticket/workflow.ts` ×1, `scripts/smoke-agent-config.mjs` ×13, `scripts/smoke-agents.mjs` ×4, `src/shared/tasks.test.ts` ×1) — **0 new warnings**, none in the diff surface
- **Test count before feature**: 667 (baseline in tasks.md T1/T2)
- **Test count after feature**: 678
- **Delta**: +11 new tests (workspace-collapse.test.ts: 4 isCollapsed + 4 toggle + 3 drop) — no deletions, no weakened assertions
- **Skipped tests**: none
- **Build note**: the first `npm run build:win` packaging pass failed with `EBUSY` deleting the stale `dist\win-unpacked` (locked by 4 running `playground.exe` instances of a previous build — environmental, not a code defect; typecheck + electron-vite build had already passed). Re-run with isolated output `npx electron-builder --win --config.directories.output=dist-verify` packaged `win-unpacked` + NSIS installer + blockmap successfully; `dist-verify` deleted afterward. **Build gate recorded as PASS.**

---

## Fix Plans

None — no failed ACs, no surviving mutants, no spec-precision gaps.

---

## Requirement Traceability Update

Updated `spec.md` requirement statuses:

| Requirement | Previous Status | New Status   |
| ----------- | --------------- | ------------ |
| WSCL-01 | Pending | ✅ Verified |
| WSCL-02 | Pending | ✅ Verified |
| WSCL-03 | Pending | ✅ Verified |
| WSCL-04 | Pending | ✅ Verified |
| WSCL-05 | Pending | ✅ Verified |
| WSCL-06 | Pending | ✅ Verified |
| WSCL-07 | Pending | ✅ Verified |
| WSCL-08 | Pending | ✅ Verified |
| WSCL-09 | Pending | ✅ Verified |
| WSCL-10 | Pending | ✅ Verified |
| WSCL-11 | Pending | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 11/11 ACs matched spec outcome (0 spec-precision gaps)
**Sensor**: 3/3 mutations killed
**Gate**: 678 passed (0 failed, 0 skipped), typecheck ✅, lint ✅ (0 new warnings), build ✅ (isolated-dir packaging)

**What works**: collapse toggle (add/remove, order-preserving, immutable); repos hidden while collapsed; chevron direction + `aria-expanded` on a real button; `config:patch` persistence with in-memory-wins failure posture; folder-not-found note survives collapse; id dropped on workspace removal; orphan ids inert.

**Issues found**: none. One non-blocking observation (optimistic id drop if `workspaces:remove` fails — spec silent).

**Next steps**: PR to upstream; optional interactive UAT (renderer behavior is hand-verified by convention).