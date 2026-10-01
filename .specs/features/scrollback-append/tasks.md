# Scrollback Append Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/scrollback-append/design.md`. In one line: `SessionRingBuffer` keeps its API
and stores its content as a list of pieces with running counts of newlines, walk weight and surrogate
pairs, so a cap check reads only counts and a trim scans only what it drops; a frozen copy of today's
class in a `*.fixture.ts` is the oracle every output test compares against.
**Status**: Approved (planned 2026-10-01, approved by the owner 2026-10-01).

**Branch**: `feature/scrollback-append`, stacked on `feature/perf-diagnostics` (plan commit `d4a3da9`,
#147). **This feature executes only after #147 is executed**: it needs #147's bench
(`scripts/bench-sessions.mjs`), its log (`PLAYGROUND_DIAGNOSTICS=1`, `perf-diagnostics.jsonl`,
`pty.<sessionId>.appendMs` / `appendMaxMs` from `Diagnostics.measureAppend`) and its recorded baseline
(`## Baseline` in `.specs/features/perf-diagnostics/validation.md`). T1 rebases this branch onto the
executed #147 branch, or onto `origin/main` once #147 is merged. The future PR body carries
`Closes #148` and, while #147 is open, `Depends on #<the #147 PR>`.

**Stop rule (T1)**: if #147's `--sessions 6` baseline already shows the mean append under 0.1 ms, or
`loop p99` under the loop target in force in every steady row, **stop after T1** and report to the
owner. No code changes before that verdict is written.

**Stop rule (T6)**: if the branch's `--sessions 6` run reads FAIL on either target line, stop and report
both summaries to the owner before the PR.

**Test baseline**: **re-measure** with `npx vitest run` in T1, after the rebase and setup; record the
test count, the file count, the suite's wall time and the lint warning count.

**Running the app**: only through `scripts/bench-sessions.mjs`, which starts the BUILT app on a
throwaway `--user-data-dir` with the three anti-throttling flags and `Ad-hoc` sessions running
`scripts/bench-tui.mjs`; no registry agent is started. Confirm no `electron` process is left after
each run.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (deep main modules and pure helpers unit-tested, hand-rolled fakes, no `vi.mock`; scripts and manual runs by hand), `vitest.config.ts` (`src/**/*.test.ts`, 30 s timeouts, report-only coverage), `package.json` scripts; style sampled from `src/main/session-ring-buffer.test.ts`, `src/main/terminal-mode-tracker.test.ts`, `src/main/activity-sequences.fixture.ts` with its tests; confirmed lessons L-005 and L-009, and candidates L-017, L-019, L-028, L-031 and L-092 applied; the memory "smoke checks that cannot fail" applied to the random generator (T3 mutants) and the bench (T6 before run).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Scrollback buffer (`SessionRingBuffer`) | unit | The existing file unchanged and passing; every named case of the spec's edge-case table on both classes; 200 random sequences of 300 appends equal to the reference after every append; one default-cap sequence; piece bounds; defaults pinned by literal (L-009, L-019) | `src/main/session-ring-buffer.test.ts`, `src/main/session-ring-buffer.equivalence.test.ts` | `npx vitest run src/main/session-ring-buffer` |
| Reference fixture (`ReferenceSessionRingBuffer`) | unit (as the oracle) | Gives the spec's literal outputs on every named case | `src/main/session-ring-buffer.equivalence.test.ts` | same |
| Mode tracker | unit (existing) | Unchanged file, passing | `src/main/terminal-mode-tracker.test.ts` | `npx vitest run src/main/terminal-mode-tracker.test.ts` |
| Cost of an append | manual (bench) | Before and after `--sessions 6` in one sitting, both target lines judged | `.specs/features/scrollback-append/validation.md` | `node scripts/bench-sessions.mjs --sessions 6 --json <file>` |
| Notes (`tasks.md`, `validation.md`) | none | — | — | — |

**Evidence split** (L-021, L-025): SBAP-04, 05, 26, 27 are T6's named runs; SBAP-25 is T1's written
verdict; SBAP-01, 02 and 17 (cost shape) are read against the code by T4, T5 and the Verifier, and
shown in numbers by T6. Every other ID has a unit test named in its task.

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | A task whose only tests are unit tests | `npx vitest run src/main/session-ring-buffer src/main/terminal-mode-tracker.test.ts` |
| Full | Every code task, after its quick gate | `npm run typecheck && npm run lint && npm test` |
| Build | T6, and after T5 | `npx electron-vite build` |
| Manual | T1, T6 | the reading or the runs the task names |

**Lint is judged by exit code AND by warning count**: record the count at T1 and diff it at every gate.

**Contract files never change**: at every gate, `git diff --stat <T1 base> -- src/main/session-ring-buffer.test.ts src/main/terminal-mode-tracker.test.ts src/main/session-manager.ts src/main/session-ring-buffer-reference.fixture.ts` lists nothing (the fixture from T2's commit on).

**Mutating for a falsification** (T3, T6): through a script written with the Write tool, which copies
the file to `.orig`, writes the mutant, and restores in `finally`; `git status --porcelain` must match
the baseline afterwards. For `git show <rev>:<path>` in Git Bash, set `MSYS_NO_PATHCONV=1`.

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: The baseline gate

```
T1
```

### Phase 2: Pin today's behaviour

```
T1 → T2 → T3
```

### Phase 3: The new buffer

```
T3 → T4 → T5
```

### Phase 4: Measure

```
T5 → T6
```

---

## Task Breakdown

### T1: Read #147's baseline and decide whether to proceed

**What**: Rebase onto the executed #147, set up the worktree, record the test baseline, and write the
stop-rule verdict from #147's `## Baseline`.
**Where**: `.specs/features/scrollback-append/tasks.md`
**Depends on**: None
**Reuses**: `.specs/features/perf-diagnostics/validation.md` (`## Baseline`), #147's `tasks.md` T17
**Requirement**: SBAP-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Steps**:

1. Confirm #147 is executed: its `validation.md` holds `## Baseline` with the `--sessions 6` summary and
   the targets in force. If it does not, stop: this feature cannot start.
2. Rebase `feature/scrollback-append` onto the executed `feature/perf-diagnostics` (or `origin/main` if
   #147 is merged). The branch is local and unpushed, so the rebase rewrites nothing anyone has.
3. Setup: `npm ci --ignore-scripts`, then `node node_modules/electron/install.js`.
4. Baseline: `npx vitest run` (tests, files, wall time) and `npm run lint` (warnings); write all four
   here. Record the rebased base commit as `<T1 base>`.
5. From `## Baseline`, copy the `--sessions 6` run's steady rows and its `worst` row: `append mean/max
   ms` and `loop p50/p99/max ms`, and the loop target in force (30 ms, or the recalibrated value).
6. Verdict, written here: the work proceeds only if the mean append is 0.1 ms or more AND `loop p99`
   reaches the loop target in at least one steady row. Otherwise stop and report to the owner with the
   figures.

**Done when**:

- [ ] `<T1 base>`, test count, file count, suite wall time and lint warning count recorded here
- [ ] The `--sessions 6` figures and the loop target in force copied here, with the commit #147 ran on
- [ ] The verdict written: "proceed" with the two figures that justify it, or "stopped, owner told: ..."

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): record the scrollback baseline verdict (#148)`

---

### T2: The reference copy and the named cases

**What**: `ReferenceSessionRingBuffer`, a verbatim copy of today's class, and the equivalence test file
with the pinned defaults and every named case of the spec's edge-case table, run on both classes.
**Where**: `src/main/session-ring-buffer-reference.fixture.ts`
**Depends on**: T1
**Reuses**: `src/main/session-ring-buffer.ts:31-93` (copied), `src/main/activity-sequences.fixture.ts` (naming and header style)
**Requirement**: SBAP-08, SBAP-09, SBAP-10, SBAP-11, SBAP-12, SBAP-13, SBAP-15, SBAP-18, SBAP-19, SBAP-20, SBAP-24, SBAP-28 to SBAP-40

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The fixture's class body equals `src/main/session-ring-buffer.ts:31-93` with only the class name changed (`diff` of the two bodies written here), imports the real `TerminalModeTracker`, and carries the "test-only, never edited" header
- [ ] `grep -rn "session-ring-buffer-reference" src --include=*.ts` lists only `src/main/session-ring-buffer.equivalence.test.ts`
- [ ] Tests (`src/main/session-ring-buffer.equivalence.test.ts`): `new SessionRingBuffer()` and `new ReferenceSessionRingBuffer()` have `maxBytes` `1000000` and `maxLines` `5000`, by literal (L-009, L-019)
- [ ] Tests: one `it.each` row per edge case SBAP-28 to SBAP-40, each asserting the spec's literal `snapshot()` and listed `tail(n)` values on both classes; SBAP-30 also asserts `Buffer.byteLength(snapshot)` is `7`
- [ ] Tests: SBAP-12 asserts `snapshot()` and `tail(2)` before and after `append('')` from a buffer that has already dropped a mode sequence (a non-empty prefix, L-017)
- [ ] The existing two contract test files have no diff and pass
- [ ] Gate check passes: quick gate, then the full gate
- [ ] Test count: T1 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `test(sessions): pin the scrollback buffer's output against a frozen reference`

---

### T3: Random sequences against the reference

**What**: The seeded generator and the after-every-append comparison, shown able to fail on three
mutants of today's algorithm.
**Where**: `src/main/session-ring-buffer.equivalence.test.ts`
**Depends on**: T2
**Reuses**: T2's fixture and file
**Requirement**: SBAP-07, SBAP-14, SBAP-16, SBAP-21, SBAP-22, SBAP-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: 200 seeds (`mulberry32`, seeds 1..200), each 300 appends at caps drawn from `maxBytes` 1-512 and `maxLines` 1-40, from the token classes design.md lists, cut at random code-unit offsets into chunks of 0 to `2 * maxBytes` units; `snapshot()` and `tail(n)` for n = 0, 1, 2, 3, `maxLines + 1` equal the reference's after every append
- [ ] Tests: one default-cap sequence of 600 TUI-like frames as design.md describes; `tail(2)` after every append, `snapshot()` every 25 appends and at the end
- [ ] A failure message names seed, append index, caps and the chunk as JSON (shown by one mutant's output, pasted here)
- [ ] Generator reach, counted once and written here: across the 200 seeds, chunks that end inside a surrogate pair, chunks that end inside an escape sequence, empty chunks, chunks with no newline, chunks over `maxBytes`, and appends where each cap trimmed; every count above 0
- [ ] Sensitivity (SBAP-23): mutants of `SessionRingBuffer` (still today's code): (1) walk by code point, (2) `cut = i` always, (3) the byte trim drops without feeding the tracker; each fails at least one random sequence (seed written here); each restored; `git status --porcelain` equals the baseline
- [ ] The file's run time written here, under 5 s (L-005); the full suite's wall time compared with T1's
- [ ] Gate check passes: quick gate, then the full gate
- [ ] Test count: T2 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `test(sessions): compare the scrollback buffer with the reference on random chunk sequences`

---

### T4: Pieces, running counts and amortised trims

**What**: Rewrite the inside of `SessionRingBuffer` (`append`, both trims, `snapshot`) as design.md
describes, with `pieceUnits`, `DEFAULT_PIECE_UNITS` and `pieceCount`; `tail` keeps today's split over
the joined content until T5.
**Where**: `src/main/session-ring-buffer.ts`
**Depends on**: T3
**Reuses**: `TerminalModeTracker` unchanged; design.md, "`SessionRingBuffer`"
**Requirement**: SBAP-01, SBAP-02, SBAP-03, SBAP-06, SBAP-07, SBAP-08 to SBAP-15, SBAP-18, SBAP-21, SBAP-22, SBAP-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Every T2 and T3 test passes unchanged against the new class; the two contract files have no diff
- [ ] Tests: T3's random sequences extended so each seed also draws `pieceUnits` from `[1, 2, 3, 7, 64, 16384]` for the class under test, and the failure message names it; all 200 pass
- [ ] Tests: `DEFAULT_PIECE_UNITS` is `16384` by literal; 50,000 one-character chunks at default caps leave `pieceCount <= 4`; 2,000,000 ASCII characters in 4,096-character chunks without newlines leave `pieceCount <= 64`, and a mutant that never joins pieces fails the first (L-031)
- [ ] Read against design.md and written here: `append` calls no `split`, `join`, `Buffer.byteLength` or whole-content `slice`; every scan in the trims starts at `#offset` or skips whole pieces by their counts (SBAP-01, 02)
- [ ] `src/main/session-manager.ts` has no diff (SBAP-06)
- [ ] Gate check passes: quick gate, then the full gate
- [ ] Test count: T3 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `perf(sessions): append scrollback chunks in time proportional to the chunk`

---

### T5: `tail` reads from the end

**What**: `tail(n)` walks back from the last piece, as design.md describes, instead of splitting the
joined content.
**Where**: `src/main/session-ring-buffer.ts`
**Depends on**: T4
**Reuses**: T4's pieces and counts
**Requirement**: SBAP-06, SBAP-16, SBAP-17, SBAP-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Every T2, T3 and T4 test passes unchanged; SBAP-32 and SBAP-38 pass with `pieceUnits` 1 (the dropped newline in the head piece, and a trailing newline, across piece edges)
- [ ] Tests: with `maxLines` 3, one chunk `a\nb\nc\nd\ne` leaves `c\nd\ne` in one piece whose dropped part holds two newlines; `tail(2)` is `d\ne`, and `tail(3)` and `tail(4)` are `c\nd\ne` (a tail that counted the dropped newlines would return `b\nc\nd\ne` for `tail(4)`)
- [ ] Read and written here: `tail` calls no `split` and no whole-content `join` or `slice`; it stops at the first piece holding the n-th newline from the end (SBAP-17)
- [ ] Gate check passes: quick gate, then the full gate, then `npx electron-vite build`
- [ ] Test count: T4 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `perf(sessions): read the scrollback tail from its end`

---

### T6: Before and after on the bench

**What**: Run #147's bench with 6 sessions on today's algorithm and on the branch in one sitting, and
write both summaries and the verdict into `validation.md` under `## Bench`.
**Where**: `.specs/features/scrollback-append/validation.md`
**Depends on**: T5
**Reuses**: `scripts/bench-sessions.mjs` (#147), the mutation procedure under Gate Check Commands
**Requirement**: SBAP-04, SBAP-05, SBAP-26, SBAP-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Steps**:

1. Quiet machine, as #147's T17 required (no other build running, the owner's app closed or idle).
2. Before: a script swaps `src/main/session-ring-buffer.ts` for `git show <T3 commit>:src/main/session-ring-buffer.ts`
   (today's algorithm), runs `npx electron-vite build`, runs
   `node scripts/bench-sessions.mjs --sessions 6 --json before.json`, restores the file in `finally`,
   and confirms `git status --porcelain` equals the baseline. `before.json` stays outside the repo.
3. After: `npx electron-vite build`, then `node scripts/bench-sessions.mjs --sessions 6 --json after.json`.
4. Write `## Bench`: the machine without names (CPU class, cores, RAM), both commits, both printed
   summaries verbatim, #147's `--sessions 6` figures quoted beside them, and a table of `append mean`,
   `append max`, `loop p99` and `loop max` per run (worst steady row). A note at the top: the Verifier
   keeps this section and adds its report below.
5. Verdict: both target lines PASS on the after run, and the before run's append line reads FAIL (the
   bench sees today's cost; otherwise the comparison proves nothing). Any other outcome stops here and
   goes to the owner with both summaries.

**Done when**:

- [ ] Both summaries in `## Bench`, each with its commit and options, and #147's figures quoted
- [ ] The after run's `append mean < 0.1 ms per chunk` and `loop p99` target lines read PASS, or the stop is written with "owner told: ..."
- [ ] The before run's append line reads FAIL, or the stop is written
- [ ] `git status --porcelain` after the swap equals the baseline; no `electron` process left
- [ ] Gate check passes: `npm run lint`

**Tests**: manual
**Gate**: manual

**Commit**: `docs(specs): record the scrollback bench before and after (#148)`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
Phase 2:  T1 ------→ T2 ------→ T3
Phase 3:  T3 ------→ T4 ------→ T5
Phase 4:  T5 ------→ T6
```

Six tasks: one batch, executed inline. T1 and T6 are stop points.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: baseline verdict | setup + notes | ⚠️ Cohesive (setup and the reading are one act) |
| T2: reference and named cases | 1 fixture + its first tests | ⚠️ Cohesive (the fixture is only meaningful with its oracle tests) |
| T3: random sequences | 1 test block | ✅ Granular |
| T4: pieces and trims | 1 class's storage and both trims | ⚠️ Cohesive (each append runs both trims; equivalence cannot be checked with one) |
| T5: tail | 1 method | ✅ Granular |
| T6: bench | 2 runs, notes | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | Phase 1 start | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: baseline verdict | notes | none | none | ✅ OK |
| T2: reference and named cases | reference fixture, buffer tests | unit | unit | ✅ OK |
| T3: random sequences | buffer tests | unit | unit | ✅ OK |
| T4: pieces and trims | scrollback buffer | unit | unit | ✅ OK |
| T5: tail | scrollback buffer | unit | unit | ✅ OK |
| T6: bench | cost of an append, notes | manual | manual | ✅ OK |

## Requirement Coverage

| SBAP ID | Unit (task) | Manual (task, run) |
| ------- | ----------- | ------------------ |
| 01 | — | T4 (read), T6 |
| 02 | — | T4 (read), T6 |
| 03 | T4 | — |
| 04 | — | T6 after run |
| 05 | — | T6 after run |
| 06 | T2, T4 (defaults, existing tests) | T4 (`session-manager.ts` diff) |
| 07 | T3, T4 | — |
| 08-12 | T2, T3, T4 | — |
| 13-15 | T2, T3, T4 | — |
| 16 | T3, T5 | — |
| 17 | — | T5 (read), Verifier |
| 18 | T2, T4, T5 | — |
| 19 | — | T2 (diff, grep) |
| 20 | T2 | — |
| 21 | T3, T4 | — |
| 22 | — | T3 (pasted message), T4 |
| 23 | — | T3 (mutants) |
| 24 | T2, T4 | — |
| 25 | — | T1 |
| 26 | — | T6 |
| 27 | — | T6 |
| 28-40 | T2 (one row each), T5 (32, 38 at `pieceUnits` 1) | — |
