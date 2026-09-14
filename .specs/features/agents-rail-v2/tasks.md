# Agents Rail v2 Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/agents-rail-v2/spec.md`
**Design**: `.specs/features/agents-rail-v2/design.md`
**Status**: Draft

---

## Test Baseline

Measured on `feature/agents-rail-v2` @ `53aa150`, two consecutive full runs:

| Run | Result |
| --- | ------ |
| 1 | 712 tests / 45 files — **710 passed, 2 failed** |
| 2 | 712 tests / 45 files — **711 passed, 1 failed** |

- **Persistent (1):** `worktree-manager.test.ts > removeWorktree > force-removes a worktree with mixed dirt and reports each change`. Pre-existing and local-only — `rmSync` no-ops under a profile path containing a non-ASCII character, so a `deleted` entry never materializes. Recorded in `.specs/STATE.md`; unrelated to this feature.
- **Intermittent (≥1):** a second suite failed in run 1 only. `tree`, `post-create-hook`, `hook-shell` and `workflow-loader` were then re-run together and passed **60/60**, so the failure is duration overrun under full parallel load, not a defect — confirmed lesson **L-005**.

**Consequence for every gate below:** do not assert a global pass count. Assert
**712 + N total** and **no new failing test name**. Every test this feature adds
is a pure in-memory unit test that spawns no process and touches no disk, so it
adds no parallel-load pressure (L-005).

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (governing test principle + the "deliberately NOT unit-tested" list), `.specs/codebase/CONVENTIONS.md` (git/PR), `vitest.config.ts` (include globs + AD-003 report-only coverage), `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Renderer pure logic module (`rail-groups.ts`) | unit | All branches; 1:1 to spec ACs; every listed edge case has a test | `src/renderer/src/lib/<module>.test.ts` | `npm test` |
| Renderer React component (`SessionRail.tsx`) | none | Build gate only — CDP smoke + visual pass (`TESTING.md`: renderer components are deliberately not unit-tested; no jsdom/testing-library in the repo) | — | `node scripts/smoke-*.mjs` |
| Component stylesheet (`SessionRail.css`) | none | Build gate only — two-theme visual pass | — | visual |
| CDP smoke script (`scripts/smoke-*.mjs`) | manual only | Script runs clean against a live dev app; never in CI | `scripts/smoke-<feature>.mjs` | `node scripts/smoke-<feature>.mjs` |
| Spec / project memory (`.specs/**`) | none | Structural validators only | — | `validate_spec.py` / `validate_state.py` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are this feature's unit tests | `npx vitest run src/renderer/src/lib/rail-groups.test.ts` |
| Full | After a logic-bearing task, and at every phase boundary | `npm run typecheck && npm run lint && npm test` |
| Build | After the component + CSS rewrite lands | `npm run build:win` |
| Manual | User-facing behaviour not unit-testable | `npm run dev -- -- --remote-debugging-port=9222`, then `node scripts/smoke-rail-v2.mjs` |

The Quick gate is scoped to this feature's own file deliberately: the full suite
takes ~400 s and carries a flaky real-git failure, so using it for per-task
iteration would make a green gate unreadable. Every phase still ends on Full.

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Logic seam (2 tasks)

The whole decision surface, behind `npm test`, before any markup exists.

```
T1 → T2
```

### Phase 2: View rewrite (3 tasks)

Markup, focus and styling — each consuming the model, deriving nothing.

```
T1 → T3 → T4
T3 → T5
```

### Phase 3: Verification & bookkeeping (4 tasks)

Repair what this change breaks, prove what unit tests cannot, record what it retires.

```
T3 → T6 → T9
T3 → T7
T4 → T8
T5 → T8
```

---

## Task Breakdown

### T1: Build the rail view model ✅

**What**: Create `rail-groups.ts` with the `RailGroup`/`RailRow` types, `buildRailGroups()` and `statusClass()` — the complete view model (groups, headers, orphan classification, row labels, statuses, tooltips, action sets, aria-labels).
**Where**: `src/renderer/src/lib/rail-groups.ts`
**Depends on**: None
**Reuses**: `src/renderer/src/lib/session-attribution.ts` (`deriveAttribution`, `linkedPinFor`)
**Requirement**: RAIL-01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 13, 14, 15, 16, 19, 20, 25, 28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `buildRailGroups(sessions, tree, tasks)` returns **fully-resolved** rows — no optional `label`/`status`/`tooltip`/`actions` fields left for a later task to tighten (lesson **L-001**)
- [x] Group key is `task:<id>` when a task resolves, else `session:<id>`; orphans never merge (RAIL-02, RAIL-06)
- [x] Group order and row order come from a single in-order walk of `sessions` with **no sort call anywhere in the module** (RAIL-04, RAIL-05)
- [x] Header data is fixed from each group's **first** session's worktree (RAIL-03)
- [x] Orphan reason precedence is `missing` > `detached` > `untagged` (RAIL-09/10/11)
- [x] Row status precedence is `running` > `path missing` > `stopped` (RAIL-14)
- [x] Ordinal suffixes apply per group, only to agent names appearing ≥2 times in that group (RAIL-13)
- [x] No React import; the module is callable from a plain `.test.ts`
- [x] Unit tests cover every requirement ID above, 1:1, plus the edge cases RAIL-25 and RAIL-28; branch fixtures use nested names (`user/otavio/24173-slug`) because `taskIdFromBranch` reads only the last segment
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/rail-groups.test.ts`
- [x] Test count: 712 + N total, no new failing test name

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agents): derive the rail view model from sessions, tree and tasks`

---

### T2: Add keyboard traversal order ✅

**What**: Add `flatRows()` and `adjacentRowId()` to the module — visual-order flattening and clamped neighbour lookup.
**Where**: `src/renderer/src/lib/rail-groups.ts` (modify)
**Depends on**: T1
**Reuses**: `RailGroup` / `RailRow` from T1
**Requirement**: RAIL-21, RAIL-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `flatRows()` returns every row in visual order, crossing group boundaries
- [x] `adjacentRowId(groups, fromId, +1|-1)` clamps at both ends — returns the same id, never wrapping (RAIL-21, RAIL-22)
- [x] An unknown `fromId` returns `null` rather than throwing
- [x] Unit tests cover traversal across ≥3 groups, both clamp ends, and the unknown-id path
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/rail-groups.test.ts`
- [x] Test count: 712 + N total, no new failing test name

**Tests**: unit
**Gate**: full

**Commit**: `feat(agents): add rail row traversal order for keyboard navigation`

---

### T3: Rewrite the rail as a group renderer ✅

**What**: Replace `SessionCard` with `TaskGroupCard` + `SessionRow`, rendering the T1 model — three header variants, compact rows, per-state actions, selection tint. Removes the worktree name, branch line and last-output preview.
**Where**: `src/renderer/src/components/SessionRail.tsx`
**Depends on**: T1
**Reuses**: `agentTileStyle` (`lib/agent-color.ts`), `typeClass`/`stateClass`/`badgeTypeOf` (`lib/task-pills.ts`), `Icon` (`git-fork`, `stop-square`, `refresh`, `trash`)
**Requirement**: RAIL-07, 08, 09, 10, 11, 12, 16, 17, 18, 25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The component derives **nothing** — no label, status, tooltip, aria-label or ordering logic survives in the `.tsx` (design §Architecture "seam rule")
- [x] Props are unchanged, so `AgentsView.tsx` needs no edit
- [x] All three header variants render: task+details, task-without-details, orphan (RAIL-07, RAIL-08, RAIL-09/10/11)
- [x] Every action handler calls `stopPropagation()` (RAIL-17)
- [x] The `stripAnsi` import and the preview block are gone (RAIL-12)
- [x] Rail header, New-session button, concurrency warning and empty state are untouched (RAIL-25)
- [x] `npm run typecheck` and `npm run lint` are clean, warning count no worse than the 18-warning baseline
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 712 + N total, no new failing test name

**Tests**: none (renderer component — matrix says build gate + smoke/visual)
**Gate**: full

**Commit**: `feat(agents): render the session rail as task groups with compact rows`

---

### T4: Add listbox semantics and arrow-key navigation ✅

**What**: Add the accessibility and focus layer — `listbox`/`group`/`option` roles, `aria-selected`, `aria-label`s on icon-only buttons, roving `tabIndex`, `ArrowUp`/`ArrowDown` via `adjacentRowId`, `Enter`/`Space` to select.
**Where**: `src/renderer/src/components/SessionRail.tsx` (modify)
**Depends on**: T3
**Reuses**: `adjacentRowId` / `flatRows` from T2; `ariaLabel` already on the model from T1
**Requirement**: RAIL-19, 20, 21, 22, 23, 24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Scroll body is `role="listbox"` with an `aria-label`; groups are `role="group"` carrying the model's `ariaLabel`; rows are `role="option"` (RAIL-19)
- [x] Exactly one row carries `aria-selected="true"` (RAIL-20)
- [x] Roving `tabIndex`: one row at `0`, all others `-1`
- [x] `ArrowUp`/`ArrowDown` move **focus only** — the active session and therefore the `TerminalPane` mount do not change (RAIL-21, RAIL-22)
- [x] `Enter`/`Space` select the focused row (RAIL-23)
- [x] Every icon-only action button has an `aria-label` naming action and agent (RAIL-24)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 712 + N total, no new failing test name

**Tests**: none (renderer component — matrix says build gate + smoke/visual)
**Gate**: full

**Commit**: `feat(agents): make rail rows a keyboard-navigable listbox`

---

### T5: Restyle the rail to the v2 specs ✅

**What**: Rewrite the card/row rules to handoff §4 — group card, header pills, 22×22 tile, row hover/active tint, status dot with pulse, 24×24 action buttons, 2-line title clamp. Keeps the rail/header/warning/empty rules.
**Where**: `src/renderer/src/components/SessionRail.css`
**Depends on**: T3
**Reuses**: `.task-pill` base (`styles/global.css`), `@keyframes pulse` shape from `RunDetail.css:14`
**Requirement**: RAIL-18, RAIL-26, RAIL-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Every measurement matches `design/handoff/DESIGN_HANDOFF_AGENTS_RAIL_V2.md` §4.1-§4.4 (radii, padding, gaps, type sizes, `color-mix` percentages)
- [x] The rail, header, new-button, warning and empty-state rules are unchanged (handoff §3 "unchanged header + concurrency warning"); the scroll body takes §3's `padding: 11px 12px 16px` / `gap: 9px` *(corrected after T5 — see `fix(agents)` commit)*
- [x] Active row tint and group accent border match RAIL-18 exactly
- [x] Task title clamps at 2 lines and no rule can horizontally overflow the 344px rail (RAIL-26)
- [x] The base `.rail-row-tile` carries a default accent tint so an unknown agent renders correctly when `agentTileStyle` returns `undefined` (RAIL-27)
- [x] `npm run build:win` completes
- [x] Gate check passes: `npm run build:win`

**Tests**: none (stylesheet — matrix says build gate + visual pass)
**Gate**: build

**Commit**: `style(agents): restyle the session rail to the v2 group and row specs`

---

### T6: Repair the agent-config smoke assertions ✅

**What**: Retarget the tile-tint check to the v2 row tile, and **retire** the `.session-card-preview` check whose behaviour RAIL-12 removes — replacing it with an assertion that no preview element exists.
**Where**: `scripts/smoke-agent-config.mjs`
**Depends on**: T3
**Reuses**: the script's existing `evaluate` / `check` helpers
**Requirement**: RAIL-12 (evidence)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Line ~239's `.session-card-tile` check targets the v2 row tile class and still asserts an inline `color-mix` tint (AGCF-07 preserved)
- [x] Line ~251's preview check is **inverted, not deleted** — it now asserts zero preview elements, with a comment citing RAIL-12 and AD-018 as the reason
- [x] The AGCF-06 concurrency-banner and `.session-rail-new` checks are untouched
- [x] The file's header comment records that step 7 now proves a removal
- [x] Gate check passes: `npm run lint`

**Tests**: manual (CDP smoke — matrix says manual only; requires a live dev app)
**Gate**: quick

**Commit**: `test(agents): retarget agent-config smoke at the v2 rail row`

---

### T7: Repair the agents smoke card count ✅

**What**: Retarget the `.session-card` count to the v2 group-card and row classes.
**Where**: `scripts/smoke-agents.mjs`
**Depends on**: T3
**Reuses**: the script's existing `evaluate` / `check` helpers
**Requirement**: RAIL-12 (evidence)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Line ~198 counts v2 rows (one per session) instead of `.session-card`, so the assertion keeps its original meaning
- [x] The `.session-rail` / `.session-rail-new` checks are untouched
- [x] Gate check passes: `npm run lint`

**Tests**: manual (CDP smoke — matrix says manual only; requires a live dev app)
**Gate**: quick

**Commit**: `test(agents): count v2 rail rows in the agents smoke script`

---

### T8: Add the rail v2 CDP smoke script ✅

**What**: New smoke script proving what unit tests structurally cannot — real grouping in the DOM, click-to-select, action-button isolation, and arrow-key traversal across a group boundary.
**Where**: `scripts/smoke-rail-v2.mjs`
**Depends on**: T4, T5
**Reuses**: the CDP driver shape of `scripts/smoke-agent-config.mjs` (`pageTarget`, `evaluate`, `check`)
**Requirement**: RAIL-17, RAIL-18, RAIL-23, RAIL-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Seeds two sessions on one cwd plus one detached session, then asserts **one** two-row group and **one** single-row orphan group
- [x] Asserts clicking a row selects it and outlines its group (RAIL-18)
- [x] Asserts clicking a row's action button does **not** change the selected session (RAIL-17)
- [x] Asserts `ArrowDown` across a group boundary moves focus without changing `aria-selected`, and `Enter` then selects (RAIL-23)
- [x] Asserts every action button carries a non-empty `aria-label` (RAIL-24)
- [x] Header comment lists what is NOT automatable here and must be hand-verified (the two-theme visual pass, RAIL-26/27)
- [x] Gate check passes: `npm run lint`

**Tests**: manual (CDP smoke — matrix says manual only; requires a live dev app)
**Gate**: quick

**Commit**: `test(agents): add a CDP smoke for the v2 grouped rail`

---

### T9: Record AD-018 for the retired preview AC ✅

**What**: Append AD-018 to `.specs/STATE.md` `## Decisions`, superseding **AGCF-08 AC-2 only**, and mark AGCF-08's status in the `agent-config` spec accordingly.
**Where**: `.specs/STATE.md`
**Depends on**: T6
**Reuses**: the existing AD-NNN table format
**Requirement**: none (project memory)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] AD-018 states that RAIL-12 removes the rail's last-output preview, superseding AGCF-08 **AC-2 only**
- [x] It records explicitly that AGCF-08 ACs 1, 3 and 4 remain true and remain covered by `session-manager.test.ts:332-353`, and that `lastOutput` stays on `SessionView`
- [x] It notes the number is `AD-018` because `origin/main` already carries `AD-017` (`dev-alias-setting`), and flags that the stashed reconciler `AD-017` needs renumbering independently
- [x] `python3 <skill-dir>/scripts/validate_state.py agents-rail-v2` is **not** run here — it gates the Verifier's report at feature close, not this task
- [x] Gate check passes: `npm test`

**Tests**: none (project memory — matrix says structural validators only)
**Gate**: quick

**Commit**: `docs(state): record AD-018 retiring the rail last-output preview`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ------→ T2

Phase 2:  T1 ------→ T3 ------→ T4
                     T3 ------→ T5

Phase 3:  T3 ------→ T6 ------→ T9
          T3 ------→ T7
          T4 ------→ T8
          T5 ------→ T8
```

Cross-phase edges (`T1 → T3`, `T3 → T6`, `T3 → T7`, `T4 → T8`, `T5 → T8`) are
drawn explicitly rather than left implicit in the phase ordering, so the diagram
and the `Depends on` fields are verifiably the same graph.

Execution is strictly sequential - there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Build the rail view model | 1 module, 1 primary function | ✅ Granular |
| T2: Add keyboard traversal order | 2 cohesive functions, same file | ✅ Granular |
| T3: Rewrite the rail as a group renderer | 1 component file | ✅ Granular |
| T4: Add listbox semantics and arrow keys | 1 file, 1 cohesive concern | ✅ Granular |
| T5: Restyle the rail | 1 stylesheet | ✅ Granular |
| T6: Repair agent-config smoke | 1 script | ✅ Granular |
| T7: Repair agents smoke | 1 script | ✅ Granular |
| T8: Add rail v2 smoke | 1 script | ✅ Granular |
| T9: Record AD-018 | 1 file | ✅ Granular |

T1 is the largest task and was deliberately **not** split into "structure" and
"row resolution". Splitting would force the interim task to type `label`,
`status`, `tooltip` and `actions` as optional so its typecheck passes, then
tighten them in the next — the exact pattern confirmed lesson **L-001** was
distilled from.

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | (no inbound arrow) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T1 | T1 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T3 | T3 → T5 | ✅ Match |
| T6 | T3 | T3 → T6 | ✅ Match |
| T7 | T3 | T3 → T7 | ✅ Match |
| T8 | T4, T5 | T4 → T8, T5 → T8 | ✅ Match |
| T9 | T6 | T6 → T9 | ✅ Match |

No dependency points at a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Renderer pure logic module | unit | unit | ✅ OK |
| T2 | Renderer pure logic module | unit | unit | ✅ OK |
| T3 | Renderer React component | none | none | ✅ OK |
| T4 | Renderer React component | none | none | ✅ OK |
| T5 | Component stylesheet | none | none | ✅ OK |
| T6 | CDP smoke script | manual only | manual | ✅ OK |
| T7 | CDP smoke script | manual only | manual | ✅ OK |
| T8 | CDP smoke script | manual only | manual | ✅ OK |
| T9 | Spec / project memory | none | none | ✅ OK |

Every `Tests: none` traces to a matrix row that says `none`, each grounded in
`.specs/codebase/TESTING.md`'s explicit "deliberately NOT unit-tested" list —
not to deferral. T1 and T2 carry the entire unit-test obligation because T1 and
T2 carry the entire decision surface.
