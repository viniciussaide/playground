# Workspace Node Collapse Tasks

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
| Config schema (`src/shared/config.ts`) | none | Build gate only (entity/config layer) | - | `npm run typecheck` |
| Renderer pure libs (`src/renderer/src/lib/*`) | unit | All branches; 1:1 to WSCL ACs (toggle add/remove, absent = expanded, drop on remove, unknown id ignored); every listed edge case | co-located `*.test.ts` | `npm test` |
| Renderer React components (`Sidebar`, `App`) | none | Hand-verified / CDP smoke per repo convention (TESTING.md) | - | `npm run typecheck` |

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

### Phase 1: Workspace collapse (single cohesive phase, 4 tasks)

```
T1 (independent)
T2 -> T3 -> T4
T2 -> T4
```

---

## Task Breakdown

### T1: Add the collapsed-workspaces field to the UI config schema

**Status**: ✅ Complete

**What**: Extend `AppConfig.ui` with an optional `collapsedWorkspaces?: string[]` so per-workspace fold state can persist without breaking existing configs (absent = every workspace expanded, WSCL-06).
**Where**: `src/shared/config.ts`
**Depends on**: None
**Reuses**: Existing optional-field pattern in the `ui` block (`sidebarWidth`, `sidebarCollapsed` — PANE-01/PANE-03)
**Requirement**: WSCL-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `AppConfig.ui` gains `collapsedWorkspaces?: string[]` with a doc comment (absent = every workspace expanded, WSCL-06)
- [ ] Existing `DEFAULT_CONFIG` stays valid without the new field (optional = absent is the default)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 667 tests pass (no silent deletions)

**Tests**: none (config/entity layer)
**Gate**: full
**Commit**: `feat(ui): add collapsed-workspaces field to the UI config`

---

### T2: Add workspace-collapse helpers with unit tests

**Status**: ✅ Complete

**What**: Pure, testable collapse-state helpers: `isCollapsed(ids, id)` (absent = expanded, WSCL-06), `toggleCollapsedId(ids, id)` (add when absent, remove when present, WSCL-01), `dropCollapsedId(ids, id)` (remove on workspace deletion, WSCL-09). Co-located unit tests in `workspace-collapse.test.ts`.
**Where**: `src/renderer/src/lib/workspace-collapse.ts` (new)
**Depends on**: None
**Reuses**: Existing co-located test pattern (`pane-layout.test.ts`, `tree-selection.test.ts`) and repo conventions (no mocking library; pure input→output)
**Requirement**: WSCL-01, WSCL-06, WSCL-09, WSCL-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `isCollapsed(ids, id)` returns `true` when `id` is present, `false` when absent or when `ids` is empty (WSCL-06, WSCL-10)
- [ ] `toggleCollapsedId(ids, id)` appends `id` when absent and removes it when present, preserving the other ids and their order; the input array is never mutated (WSCL-01)
- [ ] `dropCollapsedId(ids, id)` removes `id` when present and returns the array unchanged (same ids, no mutation) when absent (WSCL-09)
- [ ] Unit tests cover: present/absent/empty for `isCollapsed`; add and remove for `toggle`; present and absent for `drop`; input immutability for all three (all branches)
- [ ] Gate check passes: `npm test`
- [ ] Test count: 667 + N new tests pass

**Tests**: unit
**Gate**: quick
**Commit**: `feat(ui): add workspace-collapse helpers with tests`

---

### T3: Make the workspace chevron a collapse toggle

**Status**: ✅ Complete

**What**: Turn the decorative chevron on each workspace row (`Sidebar.tsx:172`) into a real `<button>` with `aria-expanded`, and gate the workspace children on the collapsed state: repos and the "no git repos" note are hidden while collapsed, the "folder not found" note stays visible (WSCL-02, WSCL-03, WSCL-04, WSCL-08, WSCL-11).
**Where**: `src/renderer/src/components/Sidebar.tsx`
**Depends on**: T2
**Reuses**: `pane-chevron-right` rotate utility (`ResizablePane.css:106` — chevron-down rotated -90° points right), existing `sidebar-*` styles, `Icon` chevron glyph
**Requirement**: WSCL-01, WSCL-02, WSCL-03, WSCL-04, WSCL-08, WSCL-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `SidebarProps` gains `collapsedIds: string[]` and `onToggleCollapse: (id: string) => void`
- [ ] The workspace-row chevron renders as a `<button>` carrying `aria-expanded` reflecting the current state and an accessible name for the workspace (WSCL-04)
- [ ] Activating the chevron calls `onToggleCollapse(workspace.id)` only — it never triggers the remove button or any row context menu (WSCL-01, WSCL-11)
- [ ] The chevron points down while expanded and right while collapsed (WSCL-03), using `isCollapsed(collapsedIds, workspace.id)` (WSCL-06)
- [ ] While collapsed, the workspace renders neither its repos nor the "no git repos" note (WSCL-02); the "folder not found" note still renders (WSCL-08)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 667 + N pass (no deletions)

**Tests**: none (renderer component - repo convention)
**Gate**: full
**Commit**: `feat(ui): make workspace chevron a collapse toggle`

---

### T4: Wire workspace collapse state into the app config

**Status**: ✅ Complete

**What**: `App.tsx` derives `collapsedIds` from `ui.collapsedWorkspaces` (absent = empty), toggles it via `toggleCollapsedId` through the existing `update()`/`config:patch` path, drops the id on workspace removal, and passes props to the sidebar (WSCL-01, WSCL-05, WSCL-07, WSCL-09, WSCL-10).
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T2, T3
**Reuses**: `update()` + `api.invoke('config:patch', { ui })` (existing pattern, `App.tsx:86-89`), `removeWorkspace` (`App.tsx:180`), `workspace-collapse` helpers
**Requirement**: WSCL-01, WSCL-05, WSCL-07, WSCL-09, WSCL-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `collapsedIds = ui.collapsedWorkspaces ?? []` (absent = every workspace expanded, WSCL-06)
- [ ] Sidebar receives `collapsedIds` and `onToggleCollapse` that persists the toggled list via `config:patch` (WSCL-01, WSCL-05)
- [ ] Removing a workspace drops its id from the persisted list via `dropCollapsedId` (WSCL-09)
- [ ] A restart restores the fold states (WSCL-07); ids matching no registered workspace are ignored (WSCL-10)
- [ ] Persist failure keeps the in-memory state (assumption: logged, non-blocking, matching `update()`)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 667 + N pass (no deletions)

**Tests**: none (renderer component - repo convention)
**Gate**: full
**Commit**: `feat(ui): wire workspace collapse state into the app config`

---

## Phase Execution Map

Visual representation of task ordering. Phases run in sequence, and tasks within a phase run in order:

```
Phase 1:
T1      T2
        |
        v
       T3
        |
        v
       T4
```

Execution is strictly sequential - there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order. T1 and T2 are independent and may be implemented in either order, but the sequence above keeps the schema change first.

4 tasks total = single task-budgeted batch (≤ ~8) → execution is inline, no sub-agents.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: config schema field | 1 file, 1 concept | ✅ Granular |
| T2: workspace-collapse helpers + tests | 1 module + its co-located tests | ✅ Granular |
| T3: Sidebar chevron toggle | 1 component | ✅ Granular |
| T4: App wiring | 1 file | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | - | ✅ Match |
| T2 | None | - | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T2, T3 | T2 → T4, T3 → T4 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Config schema | none | none | ✅ OK |
| T2 | Renderer pure lib | unit | unit | ✅ OK |
| T3 | React component | none | none | ✅ OK |
| T4 | React component (wiring) | none | none | ✅ OK |