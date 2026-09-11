# Session Resume on Respawn — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its
Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill
is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy
review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/session-resume-on-respawn/design.md`
**Status**: T1, T2, T3, T4 done; T5 pending
**Branch**: `feature/session-resume-on-respawn` (born from `main`, per the fork workflow)
**Baseline**: 668 tests / 44 files green (measured on `main` 2026-09-10, `npx vitest run --maxWorkers=2`)
**Final**: 710 tests / 46 files green (after T4; T5 adds no tests)

## Execution Record

| Task | Commit | Tests added | Notes |
| ---- | ------ | ----------- | ----- |
| T1 | `6d8e0da` | +3 | shared `commandKey` created fresh (nothing to move on `main`) |
| T2 | `66ecfd7` | +17 | fixture-backed seam; last `ses_…` id pinned to `ses_fa640905fffe5E4OeSEH33fBLM` |
| T3 | `3ea3187` | +4 | done-when's "id quoted" corrected: needs-quote-only rule (see T3 deviation) |
| T4 | | +18 | ANSI strip via `new RegExp` + inline disable (repo pattern, `ansi.ts`); 0 lint errors |
| T5 | | | |

---

## Test Coverage Matrix

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| `resume-mechanism` (pure table/extraction/resolution) | **unit** | All branches; 1:1 to RSMR-09..17; fixture-backed parse (RSMR-14/15) | `src/main/resume-mechanism.test.ts` | `npm test` |
| `command-key` (shared move) | **unit** | strip path/`.exe`/`.cmd`/`.bat`, lowercase | `src/shared/command-key.test.ts` | `npm test` |
| `spawn-plan` (resumeArgs injection) | **unit** | appended after `agent.args`, per-shell quoting; absent = byte-identical (RSMR-07/16/17) | `src/main/spawn-plan.test.ts` | `npm test` |
| `session-manager` (orchestration) | **unit** | capture retain; persist at stop/onExit/**killAll**; respawn/spawn injection; duplicate/remove/rename (RSMR-01..13, RSMR-18..25) | `src/main/session-manager.test.ts` | `npm test` |
| `shared/config.ts` (optional field) | none | typecheck gate only (additive) | — | build gate |
| Renderer (`terminal-keys.ts` import swap), `index.ts` | none | no behavior change; existing suites green | — | build gate |

**Convention note:** the repo explicitly unit-tests main-process logic and thin OS/Electron
shells are hand-verified (`TESTING.md`). This feature adds **no renderer UI and no IPC** — the
entire surface is main-side and unit-testable with the existing `makeManager`/fake-`PtyPort`
harness (`session-manager.test.ts:89-109`). No mocking library (`vi.mock` is unused here).

## Parallelism Assessment

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --------- | -------------- | --------------- | -------- |
| Unit (injected fake) | **Yes** | Per-test `makeManager()` temp-dir `ConfigStore` + hand-rolled fake `PtyPort`/`emit` | `session-manager.test.ts` |
| Unit (fixture-backed) | **Yes** | Read-only fixture files under `.specs/features/…/fixtures/` | precedent: `terminal-keys`/spike fixtures |
| Real-git suites | **Yes** (under `--maxWorkers=2`) | per-test temp dirs | repo-wide note (L-005) |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npm test` |
| Full | Before PR | `npm run typecheck && npm run lint && npm test` |
| Build | After phase completion | `npm run build` |

> `npm test` with default workers is unreliable for the real-git suites on this machine —
> run `npx vitest run --maxWorkers=2` (see `worktree-post-create-hook/tasks.md` environment note).

---

## Execution Plan

**3 phases → executed inline** (the sub-agent offer threshold is >3 phases). The always-on
Verifier still runs as a fresh sub-agent after T5.

### Phase 1: Main-process logic (Sequential)

```
T1 → T2 → T3
```

### Phase 2: Orchestration (Sequential)

```
T2 → T4
T3 → T4
```

### Phase 3: Docs (Sequential)

```
T4 → T5
```

---

## Task Breakdown

### T1: Create shared `commandKey`

**What**: `commandKey()` — bare command name, lowercased, path and `.exe`/`.cmd`/`.bat`
stripped — as the canonical normalized identity in `src/shared/command-key.ts`. **Deviation
from the design:** on `main` the renderer `terminal-keys.ts` has no `commandKey` yet (that
copy lands upstream via the pending `terminal-copy-undo-fixes` PR), so there is nothing to
move; the seam creates the definition fresh in shared, and the future renderer copy should
import it rather than duplicate. Same requirement (RSMR-13), same outcome.
**Where**: `src/shared/command-key.ts` (new), `src/shared/command-key.test.ts` (new)
**Depends on**: None
**Reuses**: the `commandKey` body as defined on `develop` (`terminal-keys.ts:72-75`)
**Requirement**: RSMR-13 (mechanism keyed on normalized command)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `src/shared/command-key.ts` exports `commandKey`
- [x] New direct tests: `C:\...\claude.exe` and `claude` and `CLAUDE` all key to `claude`;
      `.cmd`/`.bat` suffixes stripped; a bare path segment survives
- [x] `npm run typecheck` clean; quick gate passes: `npm test`
- [x] Test count: 668 → **671** (+3), zero deletions

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(shared): add commandKey normalized-agent identity for main-side reuse`

---

### T2: Resume-mechanism seam (table + extraction + resolution)

**What**: `RESUME_MECHANISMS` table keyed by `commandKey`, `resolveMechanism`,
`extractResumeId` (last `ses_[A-Za-z0-9]+` on ANSI-stripped text), and `resolveResumeArgs`
(spawn-new: id from the last matching session, or `--continue` iff a prior session exists).
Fixtures: the recorded `opencode-help.txt`, `claude-help.txt`, `opencode-session-list.json`.
**Where**: `src/main/resume-mechanism.ts` (new), `src/main/resume-mechanism.test.ts` (new);
fixtures already recorded in `.specs/features/session-resume-on-respawn/fixtures/`
**Depends on**: T1 (`commandKey`)
**Reuses**: `commandKey`; the recorded fixtures
**Requirement**: RSMR-09..13, RSMR-14..17, RSMR-24 (mechanism + resolution)
**Requirement**: RSMR-14/15 fixture rule

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `resolveMechanism('opencode')` → `{ kind: 'id', … }`; `resolveMechanism('claude')` →
      `{ kind: 'continue', … }`; `resolveMechanism('pwsh')` → `null` (RSMR-16); ad-hoc command
      never resolves (RSMR-17)
- [x] `extractResumeId` pulls a real `ses_…` id from the recorded `opencode-session-list.json`
      (the last id in the sample: `ses_fa640905fffe5E4OeSEH33fBLM`) (RSMR-14)
- [x] Last match wins: two `ses_…` tokens → the later one (edge: mid-session tool id superseded
      by the exit hint)
- [x] The mechanism's flag is proven against the CLI's own recorded help: `opencode-help.txt`
      contains `--session`, `claude-help.txt` contains `--continue` (RSMR-15)
- [x] `resolveResumeArgs`: id-agent + last matching session carries `agentSessionId` →
      `['--session', id]` (RSMR-09); id-agent + matching session belongs to a different agent →
      `[]` (RSMR-11); id-agent + no prior → `[]` (RSMR-12); continue-agent + prior session in
      cwd → `['--continue']` (RSMR-10); continue-agent + no prior → `[]` (RSMR-23); several
      matching sessions → the last in array order (RSMR-24)
- [x] Quick gate passes: `npm test`
- [x] Test count: 671 → **688** (+17), zero deletions

**Tests**: unit
**Gate**: quick
**Commit**: `feat(sessions): add resume-mechanism seam keyed by normalized command`

---

### T3: Inject resume args into the spawn plan

**What**: `buildSpawnPlan(agent, cwd, shell, resumeArgs?)` appends `resumeArgs` after
`agent.args`, through the existing per-shell quoting. `buildRawSpawnPlan` unchanged (ad-hoc).
**Where**: `src/main/spawn-plan.ts` (modify), `src/main/spawn-plan.test.ts` (modify)
**Depends on**: T2 (ordering only; no code dependency)
**Reuses**: the existing `quotePwsh`/`quoteCmd` pipeline
**Requirement**: RSMR-05/06 (injection), RSMR-07/16/17 (absent → byte-identical)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `buildSpawnPlan(agent, cwd, 'pwsh', ['--session', 'ses_abc'])` →
      `autoCommand: "opencode --session ses_abc"` (**deviation:** the plan text said the id is
      quoted per pwsh — a plain alphanumeric id needs no quoting under the repo's
      needs-quote-only rule; quoting on demand is proven by the metacharacter case below)
- [x] Same under `cmd` → `"opencode --session ses_abc"`; a `--continue` flag appended after the
      agent args survives under both shells
- [x] `resumeArgs` absent → the exact plans of today (existing tests unchanged, byte-identical)
- [x] A resume arg containing shell metacharacters is quoted, not re-split (`'ses a&b'` →
      `'ses a&b'` under pwsh)
- [x] Quick gate passes: `npm test`
- [x] Test count: 681 → **688** (+4 net; the two quoting expectations above were corrected in
      the same commit), zero deletions

**Tests**: unit
**Gate**: quick
**Commit**: `feat(sessions): append resume args to the agent spawn plan`

---

### T4: SessionManager orchestration — capture, persist, inject

**What**: Wire the seam into the session lifecycle: per running session keep a rolling
ANSI-stripped capture tail + the latest retained id (fed in `onData`); persist `agentSessionId`
on the session in `#finalize` (single patch with `status:'stopped'`) so **stop, onExit and
`killAll`** all land it before the PTY dies; `respawn` injects its own id / continue flag;
`spawn` resolves args via `resolveResumeArgs`; `duplicate` strips the id; `remove` drops it;
`rename` keeps it. Add `agentSessionId?: string` to `PersistedSession`.
**Where**: `src/main/session-manager.ts` (modify), `src/shared/config.ts` (modify),
`src/main/session-manager.test.ts` (modify)
**Depends on**: T2, T3
**Reuses**: `resume-mechanism`, `buildSpawnPlan`'s new param, the existing `makeManager`
harness (`session-manager.test.ts:89-109`) with `emitData` feeding capture
**Requirement**: RSMR-01..08, RSMR-09..13, RSMR-18..25

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] An opencode session's `emitData` containing `opencode --session ses_f7273a311ffeAkg12W9sbfYKpt`
      retains that id (RSMR-01/02); a hint **split across two chunks** still retains it; ANSI
      in the chunk is ignored (RSMR-18)
- [x] `stop()` persists the retained id on the session (RSMR-03); `onExit` (natural exit) too;
      **`killAll()` persists it before the PTY is killed** (RSMR-04) — assert on
      `config.get().sessions`
- [x] A session stopped with no id in its stream stays without `agentSessionId` (RSMR-08)
- [x] `respawn` of an id-session injects `['--session', id]` into the new plan (`port.handles.at(-1).plan`)
      (RSMR-05); respawn of a Claude session injects `['--continue']` (RSMR-06); respawn with
      neither → today's plan (RSMR-07)
- [x] `spawn('opencode', cwd)` with a prior opencode session carrying an id injects it
      (RSMR-09); with a prior **Claude** session → no id (RSMR-11); with no prior → fresh
      (RSMR-12); `spawn('Claude', cwd)` with a prior Claude session in `cwd` → `--continue`
      (RSMR-10/13)
- [x] `duplicate` does not copy `agentSessionId` (RSMR-21); `remove` drops it (RSMR-22);
      `rename` keeps it (RSMR-23)
- [x] Existing 668 tests stay green (no regression in spawn/respawn/ad-hoc behaviour)
- [x] Full gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 684 → **710** (+18, planned +13 — every added test maps to an RSMR/edge
      case), zero deletions

**Tests**: unit
**Gate**: full
**Commit**: `feat(sessions): resume conversations on respawn — capture, persist, inject`

---

### T5: Spec traceability + docs

**What**: Update the spec's requirement table to mark RSMR-01..25 as implemented/verified,
record the execution record + final test count, and write `validation.md` (or fold into the
execution record) with the fixture provenance.
**Where**: `.specs/features/session-resume-on-respawn/{spec,tasks,validation}.md`
**Depends on**: T4
**Reuses**: the feature's fixtures + this file's Execution Record
**Requirement**: spec/design traceability

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Spec requirement table statuses updated (Pending → Implementing/Verified per AC)
- [ ] Execution Record filled (commits, +tests, notes); final test count recorded
- [ ] `validation.md` notes: baseline/final counts, fixtures provenance (`opencode-help.txt`,
      `claude-help.txt`, `opencode-session-list.json` recorded 2026-09-10), and the honest gap
      that the opencode **exit-hint wording** was not recorded verbatim (the design extracts the
      `ses_…` token directly, proven against the `session list` sample)
- [ ] Full gate passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full
**Commit**: `docs(sessions): record session-resume-on-respawn execution + traceability`