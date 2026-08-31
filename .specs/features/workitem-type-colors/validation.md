# workitem-type-colors Validation

**Date**: 2026-08-31
**Spec**: `.specs/features/workitem-type-colors/spec.md`
**Diff range**: `316759d..HEAD` (3 commits: a2ccaca, 41ce9d7, fd2fc41)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status     | Notes |
| ---- | ---------- | ----- |
| T1   | ✅ Done    | Type map + 4 co-located unit tests in `task-pills.test.ts` |
| T2   | ✅ Done    | 8 `.task-pill.tp-*` classes added to `global.css` |
| T3   | ✅ Done    | Read-only audit — all 6 surfaces confirmed on `typeClass` |

All three tasks are marked **✅ Complete** in `tasks.md` (lines 54, 83, 111). No blocked or partial tasks.

---

## Spec-Anchored Acceptance Criteria

Evidence-or-zero: every AC traced to `file:line` + assertion expression. Spec colors from `spec.md:34-35`; CSS is the component layer, hand-verified per repo convention `.specs/codebase/TESTING.md:42,68` (renderer/CSS deliberately not unit-tested).

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| TYPE-01: WHEN type is Bug/Task/User Story/Feature/Epic/Issue/Impediment/PBI/Fault THEN badge renders with the ADO color | Bug `#CC293D`, Task `#F2CB1D`, User Story `#009F5B`, Feature `#0078D7`, Epic `#773B93`, Issue/Impediment `#FF9D00`, PBI `#009CCC`, Fault `#B4009E` | `src/renderer/src/lib/task-pills.test.ts:6-14` — `expect(typeClass('Bug')).toBe('tp-bug')` … `expect(typeClass('Fault')).toBe('tp-fault')`; CSS: `src/renderer/src/styles/global.css:116-154` (`.task-pill.tp-bug{color:#cc293d}` … `.tp-fault{color:#b4009e}`) | ✅ PASS |
| TYPE-02: WHEN type is not mapped THEN badge renders neutral `muted` | `muted` | `task-pills.test.ts:17-21` — `expect(typeClass('Requirement')).toBe('muted')`, `('Test Case')`, `('Test Plan')`; default branch `src/renderer/src/lib/task-pills.ts:24-25` | ✅ PASS |
| TYPE-03: type match SHALL be case-insensitive | `"user story"` == `"User Story"` | `task-pills.test.ts:23-28` — `expect(typeClass('user story')).toBe('tp-user-story')`, `expect(typeClass('USER STORY')).toBe('tp-user-story')`, `expect(typeClass('BUG')).toBe('tp-bug')` | ✅ PASS |
| TYPE-04: WHILE light or dark theme THEN badge keeps mapped color with standard tinted background | Text in ADO hex + `color-mix(… 16%, transparent)` background (works both themes) | `global.css:116-154` — each `.task-pill.tp-*` uses `background: color-mix(in oklab, <hex> 16%, transparent)` (matches state-pill pattern `global.css:79-102`). Hand-verified layer per TESTING.md:42 | ✅ PASS (hand-verified, no theme-specific unit test — matches repo convention) |
| TYPE-05: IF type is empty or whitespace THEN badge renders neutral | `muted` | `task-pills.test.ts:30-33` — `expect(typeClass('')).toBe('muted')`, `expect(typeClass('   ')).toBe('muted')`; `task-pills.ts:6` (`trim()` then default) | ✅ PASS |
| TYPE-06: IF type is a custom type without assigned color THEN badge renders neutral | `muted` | `task-pills.test.ts:17-21` — `('Test Case')`, `('Requirement')` → `muted`; `task-pills.ts:24-25` | ✅ PASS |

**Hex cross-check (spec.md:34-35 vs global.css):** `#CC293D`→`#cc293d` (116-118), `#F2CB1D`→`#f2cb1d` (121-123), `#009F5B`→`#009f5b` (126-128), `#0078D7`→`#0078d7` (131-133), `#773B93`→`#773b93` (136-138), `#FF9D00`→`#ff9d00` (141-143), `#009CCC`→`#009ccc` (146-148), `#B4009E`→`#b4009e` (151-153). All exact (hex case-insensitive).

**Status**: ✅ All 6 ACs covered — 6/6 matched spec outcome, 0 spec-precision gaps.

---

## Discrimination Sensor

**Sensor depth**: lightweight (3 targeted behavior-level mutations, the feature's whole risk surface).

Scratch: `D:\worktrees\type-sensor` (`git worktree add --detach HEAD`, node_modules junction). Mutations applied one at a time to the scratch copy of `src/renderer/src/lib/task-pills.ts`, then `npx vitest run src/renderer/src/lib/task-pills.test.ts`.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| 1 | `task-pills.ts:8` | Changed `case 'bug': return 'tp-bug'` → `return 'muted'` | ✅ Killed (2 failed — `Bug` and `BUG` assertions) |
| 2 | `task-pills.ts:6` | Removed `.trim()` → `switch (type.toLowerCase())` | ✅ Killed (1 failed — `'  User Story  '` assertion) |
| 3 | `task-pills.ts:22-23` | Changed `case 'fault': return 'tp-fault'` → `return 'muted'` (fall-through equivalent) | ✅ Killed (1 failed — `Fault` assertion) |

**Result**: 3/3 killed — **PASS ✅**

**Isolation**: pre-sensor `git status --porcelain` empty; after `Remove-Item` junction + `git worktree remove --force` + `worktree prune`, `git status --porcelain` is empty again (matches baseline). No `git stash` used.

---

## Interactive UAT Results

Not performed — backend/renderer-logic feature; visual color rendering is covered by the CSS layer hand-verification + sensor, per validate.md (UAT only for complex user-facing flows) and TESTING.md convention.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — 20-line switch replaced, no new abstractions |
| Surgical changes | ✅ — only `task-pills.ts`, `task-pills.test.ts` (new), `global.css` touched in code; `stateClass()` untouched (`task-pills.ts:30-45`) |
| No scope creep | ✅ — `stateClass` and existing `.red/.amber/.green/.blue/.accent/.faint/.muted` classes unchanged (no state-pill diff) |
| Matches patterns | ✅ — switch on lowercased input mirrors `stateClass`; tinted-background pattern mirrors `global.css:79-102`; co-located `*.test.ts` per TESTING.md:14 |
| Spec-anchored outcome check | ✅ — asserted class names are the exact `tp-*`/`muted` values the spec requires; CSS hex values match spec map |
| Per-layer Coverage Expectation met | ✅ — domain map 1:1 to TYPE-01/02/03/05/06; CSS/components hand-verified per TESTING.md:42,68 |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — 4 `it` blocks map to TYPE-01, TYPE-02/06, TYPE-03, TYPE-05; no orphan tests |
| Documented guidelines followed | ✅ — `.specs/codebase/TESTING.md` (co-location, pure-function pattern, renderer/CSS hand-verify) |

**Tests are non-shallow**: they assert concrete class-name values (`'tp-bug'`, `'muted'`) and specific strings (`'User Story'`, `'  User Story  '`, `'USER STORY'`), not generic truthiness — confirmed by the sensor killing all 3 injected behavior faults.

---

## Edge Cases

- [x] Empty/whitespace type string → `muted`: `task-pills.test.ts:30-33`, `task-pills.ts:6` + default — handled correctly
- [x] Custom type without assigned color (Requirement, Test Case) → `muted`: `task-pills.test.ts:17-21`, `task-pills.ts:24-25` — handled correctly
- [x] Case-insensitivity + surrounding whitespace (`'  User Story  '`): `task-pills.test.ts:26` — handled correctly (trim + lowercase)

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (Full gate, tasks.md:33)
- **Result**: typecheck ✅ · lint ✅ (0 errors, 18 warnings — all pre-existing in `scripts/*.mjs`/`fixtures`, none in changed files) · 635 passed, 0 failed, 0 skipped
- **Test count before feature**: 631
- **Test count after feature**: 635
- **Delta**: +4 new tests (`task-pills.test.ts`, the only new test file)
- **Skipped tests**: none
- **Failures**: none
- **Integrity**: no deletions — no pre-existing test file modified in the diff (only the new `task-pills.test.ts` added)

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| TYPE-01 | Implementing | ✅ Verified |
| TYPE-02 | Implementing | ✅ Verified |
| TYPE-03 | Implementing | ✅ Verified |
| TYPE-04 | Implementing | ✅ Verified |
| TYPE-05 | Implementing | ✅ Verified |
| TYPE-06 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 6/6 ACs matched spec outcome · 0 spec-precision gaps
**Sensor**: 3/3 mutations killed
**Gate**: full gate green — 635 tests, 0 failed, 0 skipped

**What works**:
- All 8 ADO types map to distinct `tp-*` classes with exact spec hex colors (TYPE-01)
- Unmapped/custom/empty types fall to neutral `muted` (TYPE-02/05/06)
- Case-insensitive + trim-safe matching (TYPE-03)
- Tinted `color-mix` background per existing state-pill pattern works on both themes (TYPE-04)
- All six badge surfaces render via `typeClass` — no hard-coded color stragglers (T3 audit: Sidebar:308, TasksPane:161, BoardView:328, WorktreeDetail:241, AgentsView:230, SessionRail:153)

**Issues found**: none.

**Next steps**: none — feature is ready. No fix tasks generated.