# Work Item Type Badge Colors Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: None - Medium scope, design is inline in the task bodies below
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `README.md` (Development section), `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Renderer pure libs (`src/renderer/src/lib/*`) | unit | All branches; 1:1 to TYPE ACs (mapped types, fallback, case-insensitivity, edge cases) | co-located `*.test.ts` | `npm test` |
| CSS (`src/renderer/src/styles/global.css`) | none | Build gate only (visual convention; hand-verified) | - | `npm run typecheck` |
| Renderer React components (the 6 badge surfaces) | none | Hand-verified / CDP smoke per repo convention (TESTING.md) | - | `npm run typecheck` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npm test` |
| Full | After every code task / before PR | `npm run typecheck && npm run lint && npm test` |
| Build | After phase completion | `npm run build:win` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: ADO type palette (3 tasks)

```
T1 → T2 → T3
```

---

## Task Breakdown

### T1: Map ADO work item types to badge classes with unit tests

**Status**: ✅ Complete

**What**: Replace the `typeClass()` switch in `task-pills.ts` with the ADO type map (Bug, Task, User Story, Feature, Epic, Issue, Impediment, Product Backlog Item → `tp-<slug>` classes; everything else → `muted`), case-insensitive. Co-located unit tests in `task-pills.test.ts`.
**Where**: `src/renderer/src/lib/task-pills.ts`
**Depends on**: None
**Reuses**: Existing `typeClass()` call sites (signature unchanged); test style of `pane-layout.test.ts` / `tree-selection.test.ts`

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `typeClass('Bug')` → `tp-bug`; `'Task'` → `tp-task`; `'User Story'` → `tp-user-story`; `'Feature'` → `tp-feature`; `'Epic'` → `tp-epic`; `'Issue'`/`'Impediment'` → `tp-issue`; `'Product Backlog Item'` → `tp-pbi`; `'Fault'` → `tp-fault` (TYPE-01)
- [ ] `typeClass('Requirement')`, `typeClass('Test Case')`, `typeClass('')`, `typeClass('   ')` → `muted` (TYPE-02, TYPE-05, TYPE-06)
- [ ] `typeClass('user story')` / `typeClass('USER STORY')` match the mapped type (TYPE-03)
- [ ] `stateClass()` unchanged (out of scope)
- [ ] Gate check passes: `npm test`
- [ ] Test count: 631 + N new tests pass (no deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(ui): map ADO work item types to badge colors`

---

### T2: Add the ADO color classes to the pill stylesheet

**Status**: ✅ Complete

**What**: Add `.task-pill.tp-*` classes in `global.css` using the ADO hex colors with the existing tinted-background pattern (text in the ADO color, `color-mix(in oklab, <hex> 16%, transparent)` background).
**Where**: `src/renderer/src/styles/global.css`
**Depends on**: T1
**Reuses**: Existing `.task-pill.red/.amber/.green` pattern (lines 79-102)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `.tp-bug` uses #CC293D, `.tp-task` #F2CB1D, `.tp-user-story` #009F5B, `.tp-feature` #0078D7, `.tp-epic` #773B93, `.tp-issue` #FF9D00, `.tp-pbi` #009CCC, `.tp-fault` #B4009E (TYPE-01)
- [ ] Each class follows the existing tinted-background pattern (works on light and dark themes) (TYPE-04)
- [ ] No existing state-pill class (`red`, `amber`, `green`, `blue`, `accent`, `faint`, `muted`) is changed or removed
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 631 + N pass (no deletions)

**Tests**: none (CSS layer)
**Gate**: full
**Commit**: `feat(ui): add ADO type colors to the pill stylesheet`

---

### T3: Audit all badge surfaces for consistent typeClass usage

**Status**: ⬜ Pending

**What**: Confirm every type-badge surface (Sidebar, TasksPane, BoardView, WorktreeDetail, AgentsView, SessionRail) renders via `typeClass(pin.details.type)` and that no surface hard-codes a type color class; fix any straggler found.
**Where**: `src/renderer/src/components/{Sidebar,TasksPane,BoardView,WorktreeDetail,AgentsView,SessionRail}.tsx`
**Depends on**: T2
**Reuses**: Existing `typeClass` imports

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Grep confirms all six surfaces call `typeClass(<details.type>)` for their type pill (TYPE-01 across surfaces)
- [ ] No `task-pill` with a hard-coded color class from a type is left (only `tp-*` from `typeClass`)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 631 + N pass (no deletions)

**Tests**: none (renderer components - repo convention)
**Gate**: full
**Commit**: `chore(ui): confirm consistent type badge classes across surfaces`

---

## Phase Execution Map

Visual representation of task ordering. Phases run in sequence, and tasks within a phase run in order:

```
Phase 1:  T1 → T2 → T3
```

Execution is strictly sequential - there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order.

3 tasks total = single task-budgeted batch (≤ ~8) → execution is inline, no sub-agents.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: type map + tests | 1 module (+ co-located tests) | ✅ Granular |
| T2: pill CSS classes | 1 stylesheet | ✅ Granular |
| T3: surface audit | read-only audit (fix only if a straggler exists) | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | - | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Renderer pure lib | unit | unit | ✅ OK |
| T2 | CSS | none | none | ✅ OK |
| T3 | React components | none | none | ✅ OK |