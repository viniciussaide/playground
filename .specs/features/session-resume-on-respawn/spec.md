# Session Resume on Respawn Specification

## Problem Statement

`SessionManager.respawn` re-runs a stopped session's agent in the same `cwd`, but the
agent starts a **brand-new conversation**: the history of the previous one is lost.
Coding agents expose their own resume mechanism — opencode prints a `-s <id>` /
`--session <id>` hint when it exits, Claude Code accepts `-c/--continue` (most recent
conversation in the current directory), Codex has `resume --last`, Copilot has
`--continue`/`--resume <id>` — yet the app never captures or uses any of it. The user's
stated workflow today is "find the session I used last time in that folder" via
`/session`; the app should do that for them.

Closing the app makes it worse: `killAll()` kills every live PTY (`session-manager.ts:208`),
so a session's conversation is orphaned with no record — after a restart there is nothing
left to resume but an empty prompt.

## Goals

- [ ] Respawn of a stopped session resumes the agent conversation it had, in that same folder
- [ ] A brand-new spawn in a folder resumes the last conversation that agent had in that exact cwd
- [ ] Resume ids the agent printed while the app ran survive an **app close**, so respawn reuses them after a restart
- [ ] Agents with no known or verifiable resume mechanism keep today's fresh-start behaviour
- [ ] The resume token is captured from the agent's own output stream — no agent-side hooks, no reading the agent's on-disk storage

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Ad-hoc sessions | A raw shell line has no agent semantics to resume; `buildRawSpawnPlan` is untouched. Matching today's rule in `session-activity-status`: no known mechanism, no derived behaviour |
| Codex and Copilot resume **patterns** | Their mechanisms are documented (`codex resume --last`; `copilot --continue` / `--resume <id>`), but neither CLI is installed on the development machine, so no mechanism can be recorded and asserted per the fixture rule. They stay fresh-start until recordable — the `commandKey` table is designed so a later feature adds a row, not a rework |
| Detecting "agent exited while the shell lives" | The deferred AM3 amber sub-status. Capture is driven by the output stream, not a new live signal |
| Editing resume mechanisms in the settings registry editor | Mechanisms ship keyed by command (like `UNDO_BYTE_BY_COMMAND`); exposing them is a follow-up with its own UI cost |
| Pre-filling the New Session dialog's agent from the folder's last session | A separate concern (the earlier interpretation of this feature). This feature injects the resume token keyed on the agent the user actually chooses |
| Querying the agent's on-disk transcript store, or sending in-app slash commands, to solicit a session id on app close | Capture is limited to what the agent already printed in the PTY. Reading `~/.claude/projects/…`, `.opencode/sessions`, or driving `/session` is agent-version-dependent and out of the "derived, not stored" principle |
| Any UI change | The injection is main-side; the existing Respawn button and spawn path are the only surfaces touched |
| Validating the captured id against the agent | The agent itself rejects a stale id (error in the terminal); the app makes no second guess (owner decision, see failure posture) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| What "restore the last session" means | The agent **conversation** is resumed via the agent's own CLI flag — not the app's session record | The user's examples are agent-level: opencode prints `-s <id>` on exit; Claude is found via `/session`. The app's session is already restored by respawn; the gap is the conversation | y |
| Where the resume flag is injected | Respawn of a stopped session **and** a brand-new spawn in the same cwd | Owner decision at spec: both paths reuse the token. "A sessão anterior daquela pasta seria restaurada" | y |
| **Mechanism strategy (hybrid)** | **Id-driven** for opencode (`--session <id>`) and Copilot (`--resume <id>`): capture the id the agent prints and inject it. **Continue-most-recent** for Claude (`--continue`) and Codex (`resume --last`): no id needed, always resume the latest conversation in the cwd. Unknown/ad-hoc → fresh | Owner decision. The docs pin both families for all four agents: opencode `-s/--session` + `-c/--continue`; Claude `-c/--continue` + `-r/--resume`; Codex `codex resume [id]`/`--last`; Copilot `--continue`/`--resume <id>`. Id-driven is precise; continue-last is the only option for Claude/Codex, whose docs never mention printing an id on exit | y |
| Which agents **ship** in this feature | Only those installed and locally recordable: **opencode (id-driven)** and **Claude (continue-last)** | The fixture rule needs a recorded sample; `claude` and `opencode` are installed, `codex`/`copilot` are NOT FOUND. Codex/Copilot mechanisms are documented and deferred | y |
| How the token is captured | **Continuously, from the PTY output stream**: each data chunk is scanned for the agent's printed id pattern; the latest match is retained on the running session in memory | A tail-only scan at stop misses an id printed earlier in a long session. Continuous capture decouples capture from the tail window entirely and makes app-close capture possible (the id is already in memory) | y |
| App-close capture | `killAll()` persists each running session's retained id **before** killing its PTY | `stop()`/`#finalize` runs synchronously before the awaited exit (`session-manager.ts:138-162`), so the config patch lands before the process dies; the persisted id survives the restart | y |
| Where the id persists | New optional `resumeArgs?: string[]` (or `agentSessionId?: string`) on `PersistedSession` (shared/config.ts); absent = no id | Per-session data already survives restart via `config.sessions`; optional field is backward compatible, no migration, satisfies "derive from config.sessions" (owner choice) | y |
| Continue-last injection condition | Only when that agent has **at least one prior session in the same cwd** (derivable from `config.sessions`) | `claude --continue` with zero history in the folder would error or surprise; the folder's last session is the evidence a conversation exists to continue | y |
| Agent identity for mechanism lookup | Normalized bare command (`commandKey`: bare name, lowercased, path and `.exe`/`.cmd`/`.bat` stripped) | Already the project's answer for `undoByte` (`terminal-keys.ts:49-70`): a persisted registry entry survives renames. Requires moving `commandKey` to `src/shared/` — capture runs in main, and main must not import renderer code | y |
| Pattern authorship | Every shipped **parse pattern** (id hints) is derived from **recorded PTY output** and ships with that recording as a fixture; every **continue mechanism** is asserted against that CLI's recorded `--help` output | Same rule as `session-activity-status` ACTV-12: a regex written from memory silently never matches. The `--help` recording is non-interactive and deterministic (the interactive TUI exit capture proved fragile) | y |
| Failure posture | Id-driven agent without a captured id → **fresh start**, silent. Continue-last agent → always continue (that is its mechanism). Unknown agent → fresh | Owner decision: no app-level retry, no toast, no question. A bad id surfaces in the agent's own terminal output; a false "resumed" would be worse than a fresh start | y |
| Folder key for the spawn-new lookup | Exact `cwd` match, agent-scoped | Owner chose exact cwd (agent conversations are scoped by working directory — Claude escapes the cwd, opencode is per-project). Agent-scoped because injecting one agent's token into another's launch would be wrong | y |
| Which session is "the last" in a cwd | The last element in `config.sessions` matching `cwd` (+ agent command) | `#persistUpsert` appends new sessions and never reorders on stop/rename/respawn (`session-manager.ts:279-284`), so array order is creation order; the last match is the most recently created | y |
| Duplicate behaviour | The duplicate does **not** inherit the captured id — it starts fresh | Two live PTYs resuming the same conversation would fight over one agent session; duplicate's purpose is a second agent run | y |
| ANSI in the captured stream | Each chunk is matched after stripping ANSI escapes | The PTY stream is raw bytes (`session-ring-buffer.ts:5-8`); hints carry colour codes. Requires a shared `stripAnsi` (currently renderer-only `ansi.ts`) or an ANSI-tolerant matcher — design detail | n |
| Remaining implicit dimensions (concurrency, auth, external calls, data lifecycle, observability) | N/A for this scope | Pure main-side string + spawn-plan work; no network, no credential, no new failure surface. A wrong pattern is observable as a session that starts fresh, which is today's behaviour | y |

**Open questions:** none for behaviour. One design item (ANSI handling — shared `stripAnsi` vs ANSI-tolerant matcher) is flagged `n` above and pinned in Design.

---

## User Stories

### P1: Respawn resumes the conversation ⭐ MVP

**User Story**: As a user respawning a stopped agent session, I want it to pick up the
conversation I was having in that folder — including after the app was closed — so that I
don't lose the agent's context every time the session stops or the app restarts.

**Why P1**: It is the reported gap and the vertical slice — continuous capture in main,
persist on the session (stop and app close), inject on respawn. Everything else builds on
it.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHERE a session's agent has an id-based resume mechanism THEN WHILE the session runs the app SHALL watch its output stream for the agent's printed resume id.  <!-- complex -->
2. WHEN the agent's resume id appears in the output THEN the app SHALL retain the latest match for that session.  <!-- event-driven -->
3. WHEN a session stops THEN the app SHALL persist any retained resume id on that session.  <!-- event-driven -->
4. WHEN the app quits with sessions still running THEN the app SHALL persist each running session's retained resume id before killing its PTY.  <!-- event-driven -->
5. WHEN the user respawns a stopped session that carries a persisted resume id THEN the app SHALL launch the agent with that id injected (`--session <id>` for opencode).  <!-- event-driven -->
6. WHERE a session's agent has a continue-most-recent mechanism THEN respawn SHALL launch with that mechanism's flag (`--continue` for Claude), regardless of any captured id.  <!-- optional-feature -->
7. WHERE a stopped session carries no resume id AND its agent has neither mechanism THEN respawn SHALL launch exactly as it does today, with no resume flag.  <!-- optional-feature -->
8. WHEN a session stops WITHOUT any resume id having appeared in its output THEN the app SHALL NOT persist a resume id (the field stays absent).  <!-- unwanted-behavior -->

**Independent Test**: Start opencode in a worktree, give it a task, exit the agent
(`/exit`). The session stops. Respawn it — the new PTY runs `opencode --session <id>` and
the conversation is back. Repeat the exit+respawn cycle: the same conversation resumes.
Then close the app while an opencode session is idle at its exit hint, reopen, respawn —
the id printed before the close is still injected.

---

### P2: A new spawn in the same folder resumes too

**User Story**: As a user opening a new session in a folder where an agent already
worked, I want the new session to resume that agent's last conversation there, so that a
fresh spawn does not silently orphan the previous thread.

**Why P2**: The owner picked "Respawn + spawn novo na pasta". Separable and demoable on
its own.

**Acceptance Criteria**:

1. WHEN a registry agent with an id-based mechanism is spawned in a cwd WHERE the last session for that cwd and that agent carries a persisted resume id THEN the app SHALL launch with that id.  <!-- complex -->
2. WHEN a registry agent with a continue-most-recent mechanism is spawned in a cwd WHERE that agent has at least one prior session in that cwd THEN the app SHALL launch with the continue flag.  <!-- complex -->
3. WHERE the last session in the cwd belongs to a different agent THEN the new spawn SHALL NOT receive that other agent's resume id.  <!-- optional-feature -->
4. WHERE no session in the cwd matches the spawned agent THEN the spawn SHALL launch fresh, exactly as today.  <!-- optional-feature -->
5. WHEN the app resolves which agent's mechanism applies THEN it SHALL key the agent identity on the normalized bare command, so an absolute path, a `.exe`/`.cmd`/`.bat` suffix, or a renamed registry entry still resolves.  <!-- event-driven -->

**Independent Test**: Run opencode in a worktree and exit it, so an id is captured. Open
a new session for that worktree and pick opencode — the spawn resumes the previous
conversation. Pick Claude — no id applies, and with no prior Claude session there the
spawn is fresh. Run Claude once, exit, then open a new Claude session in the same folder —
it launches with `--continue`.

---

### P3: Every shipped mechanism is proven against recorded output

**User Story**: As a maintainer, I want each resume mechanism to be derived from that
CLI's real output and asserted by a test, so that a silently never-matching pattern
cannot ship.

**Why P3**: The project rule (same as `session-activity-status` ACTV-12). A mechanism
guaranteed by a fixture is a mechanism that keeps working.

**Acceptance Criteria**:

1. Every shipped id-resume **parse pattern** SHALL be asserted against a recorded sample of that CLI's output, shipped as a test fixture.  <!-- ubiquitous -->
2. Every shipped continue mechanism SHALL be asserted against that CLI's recorded `--help` output showing the flag.  <!-- ubiquitous -->
3. WHERE an agent resolves to no mechanism THEN the app SHALL never attempt a resume for it.  <!-- optional-feature -->
4. WHEN the app spawns a session for an agent resolving to no mechanism THEN the launch SHALL be byte-identical to today's spawn plan.  <!-- event-driven -->

**Independent Test**: The opencode fixture contains the recorded `-s <id>` exit output;
the pattern extracts the id and the test asserts the produced `--session` argument. The
Claude fixture contains the recorded `claude --help` lines for `-c, --continue`; the test
asserts the mechanism resolves to `--continue`. An ad-hoc command spawn produces a plan
with no resume flag.

---

## Edge Cases

- IF the agent's resume id is split across output chunks or carries ANSI codes THEN matching against the output stream SHALL still detect it.  <!-- unwanted-behavior -->
- WHEN the agent is killed before printing any resume id THEN nothing is retained and respawn falls back to the continue mechanism or fresh.  <!-- event-driven -->
- IF a captured id is stale or rejected by the agent THEN the app SHALL make no correction or retry; the agent's own terminal output is the feedback.  <!-- unwanted-behavior -->
- WHEN a session is duplicated THEN the duplicate SHALL NOT inherit the retained resume id.  <!-- event-driven -->
- WHEN a session is removed THEN its resume id is dropped with it; no cleanup is required elsewhere.  <!-- event-driven -->
- WHEN the user renames a session THEN the retained resume id SHALL survive (renaming is title-only).  <!-- event-driven -->
- IF a continue-mechanism agent has no prior session in the cwd THEN the app SHALL NOT inject the continue flag.  <!-- unwanted-behavior -->
- WHEN several sessions in the same cwd carry resume ids THEN the spawn-new lookup SHALL use the last one in `config.sessions` order.  <!-- event-driven -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| RSMR-01 | P1: Respawn resumes the conversation | - | Verified |
| RSMR-02 | P1: Respawn resumes the conversation | - | Verified |
| RSMR-03 | P1: Respawn resumes the conversation | - | Verified |
| RSMR-04 | P1: Respawn resumes the conversation | - | Verified |
| RSMR-05 | P1: Respawn resumes the conversation | - | Verified |
| RSMR-06 | P1: Respawn resumes the conversation | - | Verified |
| RSMR-07 | P1: Respawn resumes the conversation | - | Verified |
| RSMR-08 | P1: Respawn resumes the conversation | - | Verified |
| RSMR-09 | P2: A new spawn in the same folder resumes too | - | Verified |
| RSMR-10 | P2: A new spawn in the same folder resumes too | - | Verified |
| RSMR-11 | P2: A new spawn in the same folder resumes too | - | Verified |
| RSMR-12 | P2: A new spawn in the same folder resumes too | - | Verified |
| RSMR-13 | P2: A new spawn in the same folder resumes too | - | Verified |
| RSMR-14 | P3: Every shipped mechanism is proven against recorded output | - | Verified |
| RSMR-15 | P3: Every shipped mechanism is proven against recorded output | - | Verified |
| RSMR-16 | P3: Every shipped mechanism is proven against recorded output | - | Verified |
| RSMR-17 | P3: Every shipped mechanism is proven against recorded output | - | Verified |
| RSMR-18 | Edge cases | - | Verified |
| RSMR-19 | Edge cases | - | Verified |
| RSMR-20 | Edge cases | - | Verified |
| RSMR-21 | Edge cases | - | Verified |
| RSMR-22 | Edge cases | - | Verified |
| RSMR-23 | Edge cases | - | Verified |
| RSMR-24 | Edge cases | - | Verified |
| RSMR-25 | Edge cases | - | Verified |

**ID format:** `RSMR-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 25 total, 25 verified (T1–T4, 2026-09-10), 0 unmapped

---

## Success Criteria

- [ ] Respawn of a stopped opencode session with a captured id resumes that exact conversation (the `--session` id is preserved and re-used)
- [ ] Closing the app persists a running session's already-printed resume id; after a restart, respawn still injects it
- [ ] A Claude session respawns with `--continue` (most recent conversation in the cwd)
- [ ] A brand-new spawn in a folder resumes the folder's last conversation for the chosen agent
- [ ] Ad-hoc sessions and agents with no mechanism behave byte-identical to today
- [ ] Codex and Copilot (uninstalled) stay fresh-start until a mechanism can be recorded