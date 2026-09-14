# Agents Rail v2 Validation

**Date**: 2026-09-13
**Spec**: `.specs/features/agents-rail-v2/spec.md` (RAIL-01..28)
**Diff range**: `83e67ce..HEAD` (11 commits, branch `feature/agents-rail-v2`)
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero
**Verdict**: **PASS ✅**

---

## Gate class split (read this before the AC table)

This repo has no jsdom and no testing-library; `.specs/codebase/TESTING.md` states
renderer components are deliberately not unit-tested. The spec's approved
Assumption #4 therefore routes the criteria to two gates, and this report grades
them separately — following the precedent set by **AD-016** (`VS26-02/03/05`
verified by executed tests; `VS26-01/04` code-verified pending owner-run gates).

| Class | Gate | Meaning of a ✅ here |
| ----- | ---- | ------------------- |
| **1 — executed** | `rail-groups.test.ts`, 36 tests, run and green | Verified. The asserted value was checked against the spec-defined outcome, and the discrimination sensor proves the assertion kills a real fault. |
| **2 — owner-run** | `scripts/smoke-rail-v2.mjs` (CDP) + a two-theme visual pass | **RESOLVED for the smoke half on 2026-09-14 — see Owner-Run Gate Results below.** The scripts were executed by the owner against a live dev app and pass. The visual half (RAIL-26, RAIL-27) is still outstanding. |

**Split**: **20 of 28 have class-1 executed-test evidence** (RAIL-01..16, 19, 21,
22, 25, 28 — several of these also carry a class-2 rendering half). **8 were
class-2 only** (RAIL-17, 18, 20, 23, 24, 26, 27, and the rendering half of
RAIL-07/08/11/12).

**As of 2026-09-14, 6 of those 8 now carry executed smoke evidence** (RAIL-17,
18, 20, 23, 24, plus the rendering halves of RAIL-07/08/11/12). **2 remain
open**: RAIL-26 and RAIL-27, which no script can decide — they need the
two-theme visual pass.

---

## Task Completion

All nine tasks in `tasks.md` are checked (`grep -c '^- \[ \]'` → **0** unchecked).
T1–T9 each carry a Gate line marked `[x]`.

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 Build the rail view model | ✅ Done | `rail-groups.ts`, no sort call anywhere in the module |
| T2 Keyboard traversal order | ✅ Done | `flatRows` / `adjacentRowId` |
| T3 Rewrite the rail as a group renderer | ✅ Done | Carries one documented `// SPEC_DEVIATION` (see below) |
| T4 Listbox semantics + arrows | ✅ Done | class-2 surface |
| T5 Restyle to the v2 specs | ✅ Done | Amended by `7568fa6` — see Findings |
| T6–T7 Smoke retargeting | ✅ Done | `smoke-agents.mjs`, `smoke-agent-config.mjs` |
| T8 CDP smoke for the v2 rail | ✅ Done | Written, **not executed** |
| T9 AD-018 + AGCF-08 supersession | ✅ Done | `.specs/STATE.md:28` |

---

## Spec-Anchored Acceptance Criteria

Abbreviations: `RG` = `src/renderer/src/lib/rail-groups.ts`,
`RGT` = `src/renderer/src/lib/rail-groups.test.ts`,
`SR` = `src/renderer/src/components/SessionRail.tsx`,
`CSS` = `src/renderer/src/components/SessionRail.css`,
`SM` = `scripts/smoke-rail-v2.mjs`.

### P1: The rail groups sessions by task

| Criterion | Spec-defined outcome | `file:line` + assertion expression | Class | Result |
| --------- | -------------------- | ---------------------------------- | ----- | ------ |
| **RAIL-01** derive at render time, no persisted grouping field | model is a pure function of `(sessions, tree, tasks)`; inputs untouched, repeat call identical | `RGT:87` `expect(sessions).toEqual(snapshot)`; `RGT:88` `expect(first.map(g=>g.key)).toEqual(second.map(g=>g.key))`; `RGT:89-91` labels identical. Structural: `RG:1-4` imports are types + `session-attribution` only — no config/IPC/storage surface exists to read or write | 1 | ✅ PASS |
| **RAIL-02** key `task:<id>` else `session:<id>` | literally `task:24173` / `session:s2` | `RGT:101` `expect(groups.map(g=>g.key)).toEqual(['task:24173','session:s2'])` | 1 | ✅ PASS |
| **RAIL-03** two worktrees, one task; header branch from the **first** session | `groups.length === 1`, branch = `WT_B.branch` (s1 is first) | `RGT:111` `toHaveLength(1)`; `RGT:112` rows `['s1','s2']`; `RGT:113` `expect(taskGroup(groups[0]).branch).toBe(WT_B.branch)` | 1 | ✅ PASS |
| **RAIL-04** order = first appearance while walking `sessions` | `['session:z','task:24173','session:m']`, rows `['a','b']` | `RGT:128` keys toEqual; `RGT:129` `expect(groups[1].rows.map(r=>r.id)).toEqual(['a','b'])` | 1 | ✅ PASS |
| **RAIL-05** status flip → identical group and row order | before/after arrays equal | `RGT:147` keys equal; `RGT:148-150` nested row ids equal | 1 | ✅ PASS |
| **RAIL-06** never merge two orphans | three distinct `session:` keys, every group 1 row | `RGT:164` `toEqual(['session:s1','session:s2','session:s3'])`; `RGT:165` `every(g=>g.rows.length===1)` — note the fixture gives s1 and s2 the **same** cwd, the exact merge temptation | 1 | ✅ PASS |
| **RAIL-07** resolved+pinned header: type pill `typeClass(badgeTypeOf(details))`, `#<id>`, state pill `stateClass(state)`, title clamped 2 lines, branch as `title` attr | model half: taskId 24173, details object, branch string | model: `RGT:174` `expect(group.taskId).toBe(24173)`; `RGT:175` `expect(group.details).toEqual(details)`; `RGT:176` branch `'user/otavio/24173-fix-login'` | 1 | ✅ PASS |
| " (render half) | pills use the app-wide maps; `title` attr = branch | `SR:170` `` className={`task-pill ${typeClass(badgeTypeOf(group.details))}`} ``; `SR:175` `#{group.taskId}`; `SR:178` `stateClass(group.details.state)`; `SR:167` `title={group.branch}`; `CSS:189` `-webkit-line-clamp: 2` | 2 | 🟡 Code-verified, pending owner-run gate |
| **RAIL-08** resolves but no details: `#<id>`, no pills, branch in place of title | `details === null`, branch kept | `RGT:184` `expect(group.details).toBeNull()`; `RGT:185` branch kept; `RGT:191` same for a pin whose details have not resolved | 1 | ✅ PASS |
| " (render half) | pills omitted, `.rail-group-branch` instead of `.rail-group-title` | `SR:169`/`SR:177` `{group.details && …}` guards; `SR:186` `<span className="rail-group-branch">{group.branch}</span>` | 2 | 🟡 Code-verified, pending owner-run gate |
| **RAIL-09** no worktree → orphan, cwd folder leaf, note `detached · <folder>` | reason `'detached'`, label `'sandbox'`, note `'detached · sandbox'`, 1 row | `RGT:202-205` `expect(group.reason).toBe('detached')`, `expect(group.label).toBe('sandbox')`, `expect(group.note).toBe('detached · sandbox')`, `toHaveLength(1)` | 1 | ✅ PASS |
| **RAIL-10** worktree, no task id → note `untagged worktree`, labelled with branch | reason `'untagged'`, label `'user/otavio/main'`, note `'untagged worktree'` | `RGT:212-214` all three `toBe` assertions | 1 | ✅ PASS |
| **RAIL-11** `pathMissing` + no task → note `worktree path missing`, beats detached and untagged | reason `'missing'`, note `'worktree path missing'` in both collision cases | `RGT:225-226` (vs detached); `RGT:237-238` (vs untagged); `RGT:244-245` boundary: a path-missing session that *does* resolve stays in `task:24173` with row status `'path missing'` | 1 | ✅ PASS |
| " (`var(--red)` treatment) | note rendered red | `CSS:221-223` `.rail-group-note.missing { … color: var(--red) }`; `SR:195` `` className={`rail-group-note ${group.reason}`} `` | 2 | 🟡 Code-verified, pending owner-run gate |
| **RAIL-12** row = tile + name + short status + dot + actions, and **no** worktree name / branch line / last-output preview | row object carries exactly `actions,id,label,session,status,tooltip` | `RGT:275-282` `expect(Object.keys(row).sort()).toEqual(['actions','id','label','session','status','tooltip'])` — fixture deliberately passes `lastOutput` and it does not reach the row | 1 | ✅ PASS |
| " (render half) | zero preview elements in the rail | `SR:280-299` renders tile/label/status/dot/actions only; `scripts/smoke-agent-config.mjs:265` `check('rail renders no last-output preview (RAIL-12, AD-018)', previewDom === 0)` — **not executed** | 2 | 🟡 Code-verified, pending owner-run gate |
| **RAIL-13** duplicate agent names → `<agent> <n>`, 1-based, group order; unique names bare | `['Claude 1','Codex','Claude 2']`; bare `'Claude'` in each of two groups | `RGT:297` `toEqual(['Claude 1','Codex','Claude 2'])`; `RGT:307-308` `expect(groups[0].rows[0].label).toBe('Claude')` and `groups[1]` likewise | 1 | ✅ PASS |
| **RAIL-14** `running` > `pathMissing` > `stopped` | `['running','path missing','stopped']` | `RGT:322` `expect(groups[0].rows.map(r=>r.status)).toEqual(['running','path missing','stopped'])` — row 1 is `running` **and** `pathMissing`, so the precedence is genuinely exercised. `RGT:426-428` `statusClass` folds to `'missing'` | 1 | ✅ PASS |
| " (colours `--green` / `--red` / `--text-faint`) | per handoff §4.4 | `CSS:301-307` running → `var(--green)` + dot halo; `CSS:311-316` stopped → `var(--text-faint)`; `CSS:319-324` missing → `var(--red)` | 2 | 🟡 Code-verified, pending owner-run gate |
| **RAIL-15** tooltip `<title> · <branch>`, cwd when detached | `'Claude · login · user/otavio/24173-fix-login'` / `'Ad-hoc · scratch · C:/scratch/sandbox'` | `RGT:332` and `RGT:342` — exact-string `toBe` on both branches | 1 | ✅ PASS |
| **RAIL-16** Stop running; Remove alone on non-running pathMissing; Respawn then Remove otherwise | `[['stop'],['remove'],['respawn','remove']]` | `RGT:356-360` exact nested array; `RGT:370` `expect(…actions).toEqual(['stop'])` for running+pathMissing (running wins the action slot) | 1 | ✅ PASS |
| **RAIL-17** action click acts and does **not** change selection | selected session unchanged after a Stop click | `SR:259-262` `act()` calls `event.stopPropagation()` before the handler; `SM:318` fires the action, `SM:323-327` `check('a row action button does NOT change the selected session (RAIL-17)', afterAction.selected === 'Claude 1')` — **not executed** | 2 | 🟡 Code-verified, pending owner-run gate |
| **RAIL-18** row click → active + tint `color-mix(in oklab, var(--accent) 12%, transparent)` + group border `1px solid color-mix(in oklab, var(--accent) 45%, var(--border))` | those exact two declarations | `CSS:257` `background: color-mix(in oklab, var(--accent) 12%, transparent);` — **byte-identical to the spec string**; `CSS:126` `border: 1px solid color-mix(in oklab, var(--accent) 45%, var(--border));` — **byte-identical**; wiring `SR:271`, `SR:162`, `SR:277`; `SM:289-293` asserts row tinted + group outlined — **not executed** | 2 | 🟡 Code-verified, pending owner-run gate |

### P2: Keyboard-navigable and screen-reader legible

| Criterion | Spec-defined outcome | `file:line` + assertion expression | Class | Result |
| --------- | -------------------- | ---------------------------------- | ----- | ------ |
| **RAIL-19** `role=listbox` / `role=group` + aria-label `#<id> <title>` / `role=option` | aria-label `'#24173 Fix the login redirect'`; orphan `'sandbox'`; branch fallback `'#24173 user/otavio/24173-fix-login'` | `RGT:255-256` both `toBe`; `RGT:262` fallback `toBe`. Roles: `SR:106` `role="listbox"`, `SR:163` `role="group" aria-label={group.ariaLabel}`, `SR:272` `role="option"` | 1 (labels) / 2 (roles) | ✅ PASS (labels) · ⚠️ see spec-precision gap SP-1 |
| **RAIL-20** `aria-selected="true"` on active, `"false"` on every other row | exactly one `true` | `SR:273` `aria-selected={selected}` — every row receives the attribute, `selected` computed at `SR:204` `row.id === selectedId`; row ids proven unique across the whole rail at `RGT:381-382`. `SM:282-287` asserts `ariaSelected === 'true'` on the clicked row — **not executed**; **no evidence asserts the `"false"` branch** | 2 | 🟡 Code-verified, pending owner-run gate (see gap 1) |
| **RAIL-21** ArrowDown → next row across groups; stays on last | `'top'→'a'`, `'b'→'bottom'`, `'bottom'→'bottom'` | `RGT:447` flatRows `['top','a','b','bottom']`; `RGT:457-458` `expect(adjacentRowId(groups,'top',1)).toBe('a')`, `…('b',1)).toBe('bottom')`; `RGT:462` `…('bottom',1)).toBe('bottom')` (clamp, not wrap); `RGT:479` unknown id → `null` | 1 | ✅ PASS |
| " (component wiring) | ArrowDown moves focus, does not select | `SR:74-82` `adjacentRowId` + `rowRefs…focus()`, no `onSelect`; `SM:350-355` — **not executed** | 2 | 🟡 Code-verified, pending owner-run gate |
| **RAIL-22** ArrowUp → previous across groups; stays on first | `'a'→'top'`, `'bottom'→'b'`, `'top'→'top'` | `RGT:468-469` both `toBe`; `RGT:473` `…('top',-1)).toBe('top')`; `RGT:480` unknown id → `null` | 1 | ✅ PASS |
| " (component wiring) | same handler branch as ArrowDown | `SR:75-77` `event.key === 'ArrowDown' ? 1 : -1`. **Not covered by the smoke** (only ArrowDown is exercised) — see gap 2 | 2 | 🟡 Code-verified, pending owner-run gate |
| **RAIL-23** Enter or Space → session becomes active | focused row becomes selected | `SR:83-86` `if (event.key === 'Enter' \|\| event.key === ' ') { preventDefault(); onSelect(id) }`; `SM:357-361` `check('Enter selects the focused row (RAIL-23)', traversal.selectedAfterEnter === 'Codex')` — **not executed**; Space not exercised (see gap 3) | 2 | 🟡 Code-verified, pending owner-run gate |
| **RAIL-24** icon-only buttons carry `aria-label` naming action + agent, e.g. `Stop Claude session` | exact template `<Verb> <label> session` | `SR:293` `` aria-label={`${ACTION_ICON[action].verb} ${row.label} session`} `` with verbs `Stop`/`Respawn`/`Remove` at `SR:234-236`; `SM:252-256` asserts zero unlabelled buttons, and `SM:300` queries `[aria-label="Stop Claude 2 session"]` — which pins the **exact wording**, not just non-emptiness — **not executed** | 2 | 🟡 Code-verified, pending owner-run gate |

### Edge cases

| Criterion | Spec-defined outcome | `file:line` + assertion expression | Class | Result |
| --------- | -------------------- | ---------------------------------- | ----- | ------ |
| **RAIL-25** empty `sessions` → `No sessions yet.`, no group cards | `buildRailGroups([],…)` → `[]` | `RGT:388` `expect(buildRailGroups([], tree(WT_A), pinned)).toEqual([])`; `RGT:451` `expect(flatRows([])).toEqual([])`. Render: `SR:107-108` `groups.length === 0 ? <div className="session-rail-empty">No sessions yet.</div>` — string byte-identical to the spec | 1 (+2 render) | ✅ PASS |
| **RAIL-26** long title clamps at 2 lines, rows stay visible, no horizontal overflow | `-webkit-line-clamp: 2` | `CSS:182-194` `display:-webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow:hidden; overflow-wrap:anywhere`. `SM:18-19` explicitly lists this as **hand-verify** ("computed line-clamp does not prove how it reads") | 2 | 🟡 Code-verified, pending owner-run gate |
| **RAIL-27** unknown agent → default accent tile, not untinted/broken | tile keeps a visible tint | `src/renderer/src/lib/agent-color.ts:19-20` `if (!color) return undefined` (pre-existing, untouched by this diff, **no unit test in the repo**); the new half is `CSS:262-270` — the base `.rail-row-tile` already carries `background: color-mix(in oklab, var(--accent) 15%, transparent)`, so an `undefined` inline style falls back to a tinted tile rather than a bare one. `SM:20-21` lists this as hand-verify (needs a hand-edited config) | 2 | 🟡 Code-verified, pending owner-run gate |
| **RAIL-28** last session of a group removed → card goes, remaining order unchanged | `['session:z','task:24173','session:m']` → `['session:z','session:m']` | `RGT:407-408` both `toEqual`; `RGT:418-419` the converse — a group with several sessions survives losing one, keeping `['a']` | 1 | ✅ PASS |

**Status**: ✅ All 28 criteria have located evidence. **0 criteria uncovered.**
20 carry executed unit-test evidence; a further 6 gained executed smoke
evidence on 2026-09-14 (see Owner-Run Gate Results). **RAIL-26 and RAIL-27
remain code-verified only** — the visual pass has not been run. **1
spec-precision gap** (SP-1, below), closed in `789468b`.

> The 🟡 markers in the tables above were written before the owner-run gate and
> are superseded for every AC named in Owner-Run Gate Results. They are left in
> place rather than rewritten so the report still shows what was and was not
> known at Verifier time.

---

## Owner-Run Gate Results

Executed by the owner on 2026-09-14 against a live dev app
(`npm run dev -- -- --remote-debugging-port=9222`). These are the class-2 gates
the Verifier could not run.

| Script | Result | Covers |
| ------ | ------ | ------ |
| `scripts/smoke-rail-v2.mjs` | **16/16 ✅** | RAIL-02, 06, 09 (real DOM grouping), 17, 18, 20, 21, 22, 23, 24 |
| `scripts/smoke-agents.mjs` | **16/16 ✅** | rail renders one row per session (RAIL-12 render half) |
| `scripts/smoke-agent-config.mjs` | **✅** | AGCF-07 tile tint on `.rail-row-tile`; AGCF-08 inverted — zero preview elements in the rail (RAIL-12, AD-018) |

**Seed used**: `user/otavio/20754-monitor-acesso/23688-patch-14.0.3` → `#23688`.
Worth recording: the task ID resolves from the **last** branch segment, so the
`20754` in the parent segment correctly loses to `23688` — an unplanned
end-to-end confirmation of the `taskIdFromBranch` change from PR #81.

### Two failures on the first run, both harness defects, both fixed

1. **RAIL-23 (Enter and Space did not select)** — `f3f330d`. Not a rail defect.
   The traversal block pressed five keys and asserted all of them inside one
   synchronous IIFE, reading `aria-selected` before React re-rendered. Every
   check reading a synchronous DOM side effect passed (both focus moves); only
   the two reading React state failed. Each press and its judging read are now
   separate evaluations. Re-run: **16/16**.
2. **`New Session dialog shows 3 seeded agents`** — `3453f42`. **Pre-existing,
   unrelated to this feature.** `.ns-agent-chip` also matches the Ad-hoc chip
   (`NewSessionDialog.tsx:136`), so the selector counts registry agents + 1; the
   hardcoded `3` had been wrong since that chip gained the class, and
   `SEEDED_AGENTS` has since grown to four. Now derived from `config:get`.

### Still outstanding

**RAIL-26** (a long task title clamps at 2 lines with no horizontal overflow at
344px) and **RAIL-27** (a session whose stored agent matches no registry entry
still renders a tinted tile) are **not decidable by any script** — computed
`-webkit-line-clamp` does not prove how the title reads, and RAIL-27 needs a
hand-edited config. Both remain code-verified only. The same pass should report
how `opencode` and `Ad-hoc` read at 22×22 now that both resolve to `--amber`
(pre-existing collision, surfaced but not fixed by this feature).

---

## Spec-Precision Gaps

**SP-1 — RAIL-19's orphan aria-label paraphrase contradicts RAIL-09.**
RAIL-19 says the group `aria-label` is "`#<taskId> <task title>` (the branch for
an orphan group)". A **detached** orphan has no branch — RAIL-09 mandates the
`cwd` **folder leaf** as its label, and that is what ships (`RG:147`
`const label = branch ?? folder`; `RG:188` `ariaLabel: group.label`; asserted at
`RGT:256` `expect(groups[1].ariaLabel).toBe('sandbox')`). The implementation
follows RAIL-09, which is the criterion that pins a precise value; RAIL-19's
parenthetical is a loose restatement that is wrong for one of the three orphan
reasons. **No code change needed** — the two ACs should be reconciled in the spec
so a future reader does not "fix" the label back to a branch that does not exist.

---

## Discrimination Sensor

**Isolation**: a detached `git worktree` at
`…/scratchpad/sensor-wt` (HEAD `e427cc6`) with a directory junction to the real
`node_modules`. `git stash` was **never** invoked — the unrelated
`stash@{0}` (`wip(reconciler-core): AD-017 line in STATE.md + RC1 …`) was
confirmed intact before and after. Baseline in the scratch: **36/36 green**.
Each mutation was applied to the scratch copy of `rail-groups.ts`, run, then
reverted with `git checkout --` inside the scratch.

| # | Mutation | File | Killed? | Killed by |
| - | -------- | ---- | ------- | --------- |
| M1 | Reverse orphan-reason precedence — `detached` evaluated before `pathMissing` | `RG:148` | ✅ Killed (1 failed / 35 passed) | `RGT:217` *ranks a missing path above the detached note (RAIL-11)* |
| M2 | Reverse status precedence — `pathMissing` checked before `status === 'running'` | `RG:70-74` | ✅ Killed (2 failed / 34 passed) | `RGT:311` *resolves status by running > path missing > stopped (RAIL-14)*; `RGT:363` *offers Stop on a running path-missing row (RAIL-16)* |
| M3 | Drop the per-group ordinal suffix — `label: session.agent` unconditionally | `RG:213` | ✅ Killed (1 failed / 35 passed) | `RGT:286` *ordinal-suffixes duplicate agent names in group order (RAIL-13)* |
| M4 | `adjacentRowId` **wraps** instead of clamping (first↔last) | `RG:238-239` | ✅ Killed (2 failed / 34 passed) | `RGT:461` *leaves focus on the last row (RAIL-21)*; `RGT:472` *leaves focus on the first row (RAIL-22)* |
| M5 | Group header branch taken from the group's **last** session's worktree | `RG:133` | ✅ Killed (1 failed / 35 passed) | `RGT:104` *merges two worktrees of one task and takes the header branch from the first (RAIL-03)* |
| M6 | Add a `.sort()` over groups that floats groups holding a running row | `RG:136` | ✅ Killed (1 failed / 35 passed) | `RGT:132` *keeps group and row order identical when a status flips (RAIL-05)* |

**Sensor depth**: 6 behaviour-level mutations (above the lightweight default of 1–3).
**Result**: **6/6 killed — PASS ✅**. Every mutant was killed by the test that
carries the matching requirement ID in its name, so the kills are attributable,
not incidental.

**Isolation verified**: scratch worktree removed (`git worktree remove --force`
+ `git worktree prune`); `git worktree list` shows only
`M:/obogoni/playground`; `git status --porcelain` is **empty**, byte-identical
to the pre-sensor baseline; `git stash list` unchanged.

---

## Payload / Conjunction Check

Every field is asserted by **value**, not merely by existence.

| Type | Field | Value asserted at |
| ---- | ----- | ----------------- |
| `RailRow` | `id` | `RGT:112`, `RGT:381` (`['s1','s2','s3']`) |
| `RailRow` | `session` | `RGT:283` `expect(row.session.agent).toBe('Claude')` |
| `RailRow` | `label` | `RGT:297` (`['Claude 1','Codex','Claude 2']`), `RGT:307-308` (bare) |
| `RailRow` | `status` | `RGT:322` (all three members), `RGT:246` (`'path missing'` inside a task group) |
| `RailRow` | `tooltip` | `RGT:332`, `RGT:342` — full exact strings, both branch and cwd forms |
| `RailRow` | `actions` | `RGT:356-360` (all three shapes), `RGT:370` |
| `RailRow` | *shape* | `RGT:275-282` — the **closed** key set, so a re-added preview/branch field fails |
| `TaskGroup` | `key` | `RGT:101`, `RGT:128`, `RGT:164`, `RGT:407-408` |
| `TaskGroup` | `kind` | `RGT:70` (inside `taskGroup()`, applied at every task-group assertion) |
| `TaskGroup` | `taskId` | `RGT:174` `toBe(24173)` |
| `TaskGroup` | `branch` | `RGT:113`, `RGT:176`, `RGT:185` |
| `TaskGroup` | `details` | `RGT:175` `toEqual(details)` (deep), `RGT:184`/`RGT:191` `toBeNull()` |
| `TaskGroup` | `ariaLabel` | `RGT:255`, `RGT:262` |
| `TaskGroup` | `rows` | `RGT:112`, `RGT:129`, `RGT:419` |
| `OrphanGroup` | `kind` | `RGT:76` (inside `orphanGroup()`) |
| `OrphanGroup` | `reason` | `RGT:202`, `RGT:212`, `RGT:225`, `RGT:237` — all three members plus both precedence collisions |
| `OrphanGroup` | `label` | `RGT:203` (`'sandbox'`), `RGT:213` (`'user/otavio/main'`) |
| `OrphanGroup` | `note` | `RGT:204`, `RGT:214`, `RGT:226`, `RGT:238` — all three note strings verbatim |
| `OrphanGroup` | `ariaLabel` | `RGT:256` |
| `OrphanGroup` | `rows` | `RGT:205` `toHaveLength(1)`, `RGT:165` |

No field is left as "the object was produced". Both `RailGroup` variants are
covered, both `kind` discriminants are asserted, and every member of the
`RowStatus`, `RowAction` and `OrphanReason` unions appears in an asserted value.

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`
- **typecheck**: ✅ clean (both `tsconfig.node.json` and `tsconfig.web.json`)
- **lint**: ✅ **0 errors, 18 warnings** — all `prettier/prettier` nits in
  `scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`,
  `scripts/smoke-agents.mjs`, `src/shared/tasks.test.ts`; the pre-existing baseline,
  not authored by this feature
- **tests**: **747 passed, 1 failed, 748 total** (46 files)
- **Test count before feature**: 712 · **after**: 748 · **Delta**: **+36**, all in
  `rail-groups.test.ts`. **Zero existing tests deleted or weakened** —
  `git diff 83e67ce..HEAD` touches no `*.test.ts` other than the new file.
- **Failures**: `src/main/worktree-manager.test.ts > removeWorktree > force-removes a worktree with mixed dirt and reports each change` — the **known, persistent, pre-existing** local `rmSync` non-ASCII-path failure on this machine (the user profile contains `á`), unrelated to this diff, which touches no main-process code. Not a defect of this feature.
- **Skipped tests**: none.
- **Scratch-isolated re-run** of `rail-groups.test.ts` alone: **36/36 green** in
  855 ms, confirming no L-005 duration-overrun flake in the feature's own tests.

**Not executed (owner-run gates):**

| Gate | Command | Covers |
| ---- | ------- | ------ |
| CDP smoke | `node scripts/smoke-rail-v2.mjs` (needs a live dev app **and** a registered workspace holding a worktree whose branch yields a task id) | RAIL-02/06/09 in real DOM, 17, 18, 21, 23, 24 |
| CDP smoke | `node scripts/smoke-agent-config.mjs` | RAIL-12 (zero preview elements) + AGCF-07 tile tint |
| CDP smoke | `node scripts/smoke-agents.mjs` | rail repaints live, ≥2 `.rail-row` |
| Two-theme visual pass | manual, 344px, light + dark | RAIL-26, RAIL-27, all pill/tile/dot/hover/active-tint legibility, and the known `opencode`/`Ad-hoc` amber collision at 22×22 (spec Assumptions) |

---

## Code Quality

| Principle | Status | Note |
| --------- | ------ | ---- |
| Minimum code | ✅ | `rail-groups.ts` is 240 lines for 28 criteria; no dead exports |
| Surgical changes | ✅ | 4 production files touched (`rail-groups.ts` new, `SessionRail.tsx`, `SessionRail.css`, 3 smoke scripts) |
| No scope creep | ✅ | `SessionDetail`, `AgentsView`, IPC, `SessionView` and `SessionStatus` untouched; props signature unchanged, so `AgentsView.tsx` needed no edit |
| No abstraction for single-use code | ✅ | `statusClass` is the only exported helper beyond the three model functions, and it is used twice (`SR:284`, `SR:285`) |
| Matches existing patterns | ✅ | Follows the `session-attribution.ts` / `task-pills.ts` / `tree-selection.ts` pure-seam precedent named in `.specs/codebase/TESTING.md`; reuses `typeClass`/`stateClass`/`agentTileStyle` rather than re-deriving the colour maps (spec Assumptions rows 8–9) |
| Didn't "improve" unrelated code | ✅ | `agent-color.ts` and `session-attribution.ts` untouched |
| Spec-anchored outcome check | ✅ | Every class-1 assertion checked against the spec value; 1 spec-precision gap flagged (SP-1) |
| Per-layer coverage expectation | ✅ | Decision logic has 1:1 AC mapping; every test name carries its `RAIL-NN` id |
| No unclaimed tests | ✅ | All 36 tests name a requirement id in their title |
| Documented guidelines followed | ✅ | `.specs/codebase/TESTING.md` (pure-seam convention, no jsdom); `design/handoff/DESIGN_HANDOFF_AGENTS_RAIL_V2.md` |
| Would a senior engineer approve? | ✅ | Yes — the component derives nothing (`SR:37-39` states the seam rule and the code honours it) |

### Documented deviation

`SessionRail.tsx:264-268` carries an explicit `// SPEC_DEVIATION`: `design.md`
typed the row as `<button role="option">`; it ships as a `div role="option"`
because the row contains its own action buttons and a button inside a button is
invalid HTML. **Accepted** — handoff §6 names `role="option"` as the sanctioned
alternative ("rows are the focusable elements (`button` or `role="option"`)"),
and the roles, roving `tabIndex`, focus and `aria-selected` semantics the ACs
name are all preserved (`SR:270-279`). Keyboard operability is not reduced: the
div carries `tabIndex`, `onKeyDown` and Enter/Space activation.

---

## Findings (non-blocking)

**F-1 — `design.md` over-froze a region the handoff re-specified.** The original
CSS-strategy row told T5 to keep `SessionRail.css` "lines 1-95" byte-for-byte,
which swept in `.session-rail-list` — the scroll body that handoff §3 explicitly
re-specs as `padding 11px 12px 16px · gap 9px`. The T5 worker hit the
contradiction, kept the conservative v1 value (`padding: 12px; gap: 10px`) and
flagged it rather than guessing — the correct call, since the two sources
genuinely disagreed. Corrected in `7568fa6`, which fixed both the CSS
(`CSS:79-87`) and the `design.md:220` / `tasks.md` rows. Root cause is upstream:
the handoff's own `← gap unchanged` annotation on that line is **factually wrong**
(v1 was `gap: 10px`, the handoff specifies `9px`), so the line reads as a
restatement when it is in fact a change. Fully resolved in the diff; recorded as
a lesson so the freeze-by-line-range pattern is not repeated.

**F-2 — the AD-number collision candidate is NOT grounded in this diff.** I
checked. `AD-018` was chosen *deliberately to avoid* a collision: `.specs/STATE.md:28`
states "Numbered 018 because `origin/main` already carries `AD-017`
(`dev-alias-setting`, 2026-09-10)". The colliding `AD-017` line lives in the
unrelated `stash@{0}` and is explicitly scoped out. **No lesson recorded** —
this feature got the numbering right.

---

## Edge Cases

- [x] RAIL-25 empty session list → `[]` model, `No sessions yet.` empty state (`RGT:388`, `RGT:451`, `SR:107-108`)
- [x] RAIL-28 last session removed → group card goes, order preserved (`RGT:407-408`, `RGT:418-419`)
- [x] RAIL-11 boundary — a path-missing session that **does** resolve to a task stays in its task group and is not promoted to an orphan (`RGT:241-246`)
- [x] RAIL-16 boundary — a session that is both `running` and `pathMissing` gets `['stop']` (`RGT:363-371`)
- [x] `adjacentRowId` with an id the model no longer holds → `null`, caller no-ops (`RGT:476-481`, `SR:78`)
- [x] `folderLeaf` handles both path separators and a trailing separator (`RG:64-67`); exercised via `'C:/scratch/sandbox'` → `'sandbox'`
- [ ] RAIL-26 long-title clamp at 344px — **pending the visual pass**
- [ ] RAIL-27 unknown registry agent — **pending a hand-edited config**

---

## Requirement Traceability Update

| Requirement | Previous | New |
| ----------- | -------- | --- |
| RAIL-01..06, 13, 14, 15, 16, 21, 22, 25, 28 | Implementing | ✅ **Verified** (executed tests + sensor) |
| RAIL-07, 08, 09, 10, 11, 12, 19 | Implementing | ✅ **Verified** (model half by executed tests) · 🟡 rendering half pending owner-run gate |
| RAIL-17, 18, 20, 23, 24, 26, 27 | Implementing | 🟡 **Code-verified, pending owner-run gate** |

---

## Summary

**Overall**: ✅ **Ready** — subject to the two owner-run gates the spec itself
assigned to a human (Assumption #4).

**Spec-anchored check**: 28/28 criteria located with `file:line` evidence;
27 matched the spec-defined outcome exactly, **1 spec-precision gap** (SP-1,
RAIL-19's orphan-label parenthetical contradicts RAIL-09 — spec text, not code).
**Gate class split**: 20 executed-test-verified · 8 code-verified pending owner-run gate.
**Sensor**: **6/6 mutations killed**, each by its requirement-named test.
**Gate**: typecheck ✅ · lint 0 errors / 18 pre-existing warnings ✅ · tests 747/748,
the single failure being the known pre-existing `rmSync` non-ASCII-path
environment failure on untouched main-process code.

**What works**: the grouping model is genuinely discriminating — all four
precedence rules (orphan reason, row status, header-branch-from-first,
no-sort order stability) are killed by targeted mutations, which is the part of
this feature that would fail silently and invisibly if it regressed. The pure-seam
split means 20 of 28 criteria are gated by code rather than by eyeballs, in a repo
that has no renderer test harness at all. The two spec values the handoff pins
byte-for-byte (the 12% active tint and the 45% group border) ship byte-identical.

**Issues found**: none blocking. One spec-precision gap (SP-1, doc-only), three
minor coverage thinnesses in the unexecuted smoke (ranked below), and one
correctly-documented, handoff-sanctioned `SPEC_DEVIATION`.

**Next steps** (owner):
1. Run `node scripts/smoke-rail-v2.mjs` against a live dev app with a
   task-tagged worktree registered — this converts RAIL-17, 18, 21, 23, 24 from
   code-verified to verified.
2. Run `node scripts/smoke-agent-config.mjs` and `node scripts/smoke-agents.mjs`.
3. Do the two-theme visual pass at 344px (RAIL-26, RAIL-27, and how the shared
   `opencode`/`Ad-hoc` amber reads at 22×22).
4. Optionally reconcile SP-1 in `spec.md`.

**Ranked gaps** (all minor, none blocking):

1. **RAIL-20's negative half has no evidence.** Nothing asserts
   `aria-selected="false"` on the non-selected rows; `SM:284` checks only that
   the clicked row reports `"true"`. A bug that set the attribute on every row
   would pass every gate that exists. One extra line in the smoke
   (`rows.filter(r => r.getAttribute('aria-selected') === 'true').length === 1`)
   would close it.
2. **RAIL-22's component wiring is not smoke-covered.** `SM:329-355` exercises
   `ArrowDown` only. `adjacentRowId(…, -1)` is well covered by executed tests
   (`RGT:465-474`) and `SR:75-77` shares one branch with ArrowDown, so the risk
   is low — but the `ArrowUp` keypress path itself is unproven.
3. **RAIL-23's `Space` key is not smoke-covered.** `SM:358` presses `Enter`
   only; `Space` shares the `SR:83` condition.
4. **SP-1 — spec text only.** RAIL-19 says the orphan `aria-label` is "the
   branch"; RAIL-09 mandates the folder leaf for detached orphans, and that is
   what ships and is tested.
