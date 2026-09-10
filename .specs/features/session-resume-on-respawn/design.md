# Session Resume on Respawn — Design

**Spec**: `spec.md` (RSMR-01..25) · **Scope**: Medium · **Baseline**: main-side feature, no UI; green gate on `main`

---

## The one real decision: how the app knows which conversation to resume

Three families of knowledge were on the table:

| Option | Verdict |
| ------ | ------- |
| **A** — Tail-scan the `SessionRingBuffer` at stop for a printed hint | ❌ Fragile: a hint printed early in a long session scrolls out of any bounded tail; and a TUI exit is hard to even elicit reliably (measured: driving `opencode`'s interactive `/exit` from a PTY harness never terminated cleanly, and the TUI paints text inside ANSI sequences so a plain-text scan sees nothing). Fails the app-close requirement too — a killed PTY leaves no fresh tail. |
| **B** — Query the agent's on-disk transcript store / drive `/session` on close | ❌ Agent-version-dependent, reads private stores, out of the project's "derived, not stored" principle; spec Out-of-Scope. |
| **C** — **Continuous capture from the PTY output stream + mechanism table** ✅ | The agent prints its id at some point (opencode: a `ses_…` id; confirmed live via `opencode session list --format json`, and docs say opencode "ships clear resume commands"). Watch the stream per-chunk, retain the **latest** id, persist it on the session at **any** stop — Stop, agent exit, or app quit (killAll). The id is already in memory at quit, so nothing needs the exit to be graceful. |

**Chosen: C.** The mechanism (which flag per agent) is a **pure table** keyed by the
normalized command; the capture is **continuous**; the persist happens in the existing
synchronous finalize path, so `killAll`'s fire-and-forget `stop()` still lands the id in
`config.sessions` before the PTY dies. This is the hybrid the owner chose at spec:
**id-driven** for opencode (`--session <id>`), **continue-most-recent** for Claude
(`--continue`) — Codex (`codex resume --last`) and Copilot (`--resume <id>`) documented but
**deferred** (neither CLI is installed, so no recorded sample exists).

```
SessionManager (owns lifecycle)
   onData ──► stripAnsi ──► rolling tail (last 4096 chars)
                 └──► extractResumeId(mechanism) ──► retained id (latest wins)
   #finalize (stop / onExit / killAll) ──► persist agentSessionId on the session
   respawn / spawn ──► resolveResumeArgs(sessions, cwd, commandKey) ──► buildSpawnPlan(…, resumeArgs)
```

---

## Modules

| Module | New/Mod | Responsibility | Tests |
| ------ | ------- | -------------- | ----- |
| `src/shared/command-key.ts` | **new** | `commandKey()` moved from `renderer/lib/terminal-keys.ts` (bare name, lowercased, path + `.exe`/`.cmd`/`.bat` stripped). Main must not import renderer code. | existing `terminal-keys` + `spawn-plan` suites stay green; new direct tests |
| `src/main/resume-mechanism.ts` | **new** | `ResumeMechanism` type; `RESUME_MECHANISMS` table keyed by `commandKey` (opencode: id; claude: continue); `resolveMechanism(cmd)`; `extractResumeId(text, mech)` (id extraction, ANSI-stripped input, **last** `ses_…` match wins); `resolveResumeArgs(sessions, cwd, commandKey)` (spawn-new: last matching session's id → `['--session', id]`, or continue → `['--continue']` iff a prior session exists, else `[]`). | unit (fixtures) |
| `src/shared/config.ts` | modify | `PersistedSession.agentSessionId?: string` — the captured id, absent = none. Additive/backward compatible; flows to `SessionView` but renderer ignores it. | via T4 |
| `src/main/spawn-plan.ts` | modify | `buildSpawnPlan(agent, cwd, shell, resumeArgs?: string[])` appends `resumeArgs` after `agent.args`, quoted per shell. `buildRawSpawnPlan` unchanged (ad-hoc). Absent → byte-identical plan. | unit |
| `src/main/session-manager.ts` | modify | Per running session: `captureTail` (rolling, ANSI-stripped) + `retainedId`; feed in `onData`; persist `agentSessionId` in `#finalize` (single patch with `status:'stopped'`); `respawn` and `spawn` resolve args via `resume-mechanism` and pass to `buildSpawnPlan`; `duplicate` never copies `agentSessionId`. | DI'd orchestrator tests |
| `renderer/lib/terminal-keys.ts` | modify | Import `commandKey` from shared (delete local copy). | existing suite green |
| `src/renderer/lib/ansi.ts`, UI, IPC | **untouched** | ANSI stripping for capture is a **local** helper in the capture seam (a minimal CSI regex), not a move of renderer `ansi.ts` — avoids renderer churn in a main-side feature. | — |

---

## Contracts

```ts
// src/main/resume-mechanism.ts
export type ResumeMechanism =
  | { kind: 'id'; args: (id: string) => string[] }
  | { kind: 'continue'; args: string[] }

export function resolveMechanism(commandKey: string): ResumeMechanism | null
export function extractResumeId(text: string): string | null          // last `ses_[A-Za-z0-9]+` match
export function resolveResumeArgs(
  sessions: PersistedSession[],
  cwd: string,
  commandKey: string
): string[]

// src/main/spawn-plan.ts
export function buildSpawnPlan(
  agent: AgentDef, cwd: string, shell: Shell, resumeArgs?: string[]
): SpawnPlan   // resumeArgs appended after agent.args (per-shell quoting)

// src/shared/config.ts
export interface PersistedSession {
  …
  /** Captured agent conversation id (e.g. opencode `ses_…`); absent = no id. */
  agentSessionId?: string
}
```

**Mechanism table (shipped):**

| commandKey | kind | inject | extract |
| ---------- | ---- | ------ | ------- |
| `opencode` | `id` | `['--session', id]` | last `ses_[A-Za-z0-9]+` in the stripped stream (id prefix pinned by recorded `opencode-session-list.json`) |
| `claude` | `continue` | `['--continue']` | — |
| everything else | `null` | — | — (fresh, byte-identical today) |

Codex (`resume --last`) and Copilot (`--resume <id>`) are **documented but not shipped**
(no CLI installed → no recorded sample; the `RESUME_MECHANISMS` table gets a row when one
exists).

**Decision rules:**

- **`extractResumeId`** — runs on the ANSI-stripped rolling tail each chunk; **last match wins**
  (the exit hint is the last `ses_…` printed; a mid-session tool id is superseded). Id-format
  regex `ses_[A-Za-z0-9]+` is asserted against the recorded `session list` sample (RSMR-14).
- **Continue injection condition** — `resolveResumeArgs` returns `['--continue']` for a
  continue-mechanism agent **only if** `config.sessions` has a prior session with that `cwd`
  and command (RSMR-10/RSMR-23); otherwise `[]` → today's plan (RSMR-12).
- **Id injection condition** — id-mechanism agent returns `['--session', id]` only when the
  **last** session matching `cwd` + command carries `agentSessionId` (RSMR-09/RSMR-24);
  different agent or no prior → `[]` (RSMR-11/RSMR-12).
- **Respawn** — id-mechanism session uses its **own** persisted `agentSessionId` (RSMR-05);
  continue-mechanism session injects `--continue` (RSMR-06); neither → today (RSMR-07).
- **Persist timing** — `#finalize` computes the stopped meta (status + retained id if any) and
  patches **once**; because `#finalize` runs synchronously inside `stop()` before the first
  await, `killAll`'s fire-and-forget quit persists every retained id before any PTY is killed
  (RSMR-03/04). No retained id → `agentSessionId` stays absent (RSMR-08).
- **Duplicate** — `duplicate()` spreads the source meta but **strips** `agentSessionId`
  (RSMR-21); **remove** drops it with the session (RSMR-22); **rename** is title-only so it
  survives untouched (RSMR-23).
- **ANSI** — capture strip is a local minimal-CSI regex in the seam; the recorded `claude
  --help` fixture carries `\x1b[7m…\x1b[0m` bold codes, so the strip path is exercised by a
  fixture-backed test (RSMR-18). A hint split across chunks is caught by the rolling tail
  (RSMR-18).

---

## Testing

| Seam | What is asserted | Notes |
| ---- | ---------------- | ----- |
| `resume-mechanism` | `resolveMechanism('opencode')` → `{kind:'id'}`, `('claude')` → `{kind:'continue'}`, `('pwsh')` → `null`; `extractResumeId` pulls `ses_f7273a311ffeAkg12W9sbfYKpt` from the recorded `opencode-session-list.json`; `resolveResumeArgs` id/continue/different-agent/no-prior cases | pure, fixture-backed (RSMR-09..17) |
| `resume-mechanism` (fixture rule) | reading `opencode-help.txt`/`claude-help.txt` asserts the mechanism's flag exists in the CLI's own recorded help (RSMR-14/15) | a never-matching mechanism cannot ship |
| `spawn-plan` | `resumeArgs` appended after `agent.args`, per-shell quoting (pwsh `&` + quote, cmd `/K`); absent → identical to today (RSMR-07/16/17) | additive 4th param |
| `session-manager` | spawn id-agent with a captured-id prior session → `--session <id>`; continue-agent with prior → `--continue`; no prior → today; respawn injects its own persisted id; stop persists retained id; **killAll persists before kill**; duplicate strips; remove drops; rename keeps | DI'd with fake `PtyPort`/`ConfigStore`, real-git suite untouched |

**Gate:** `npm run typecheck && npm run lint && npm test`. No UI seam → no hand-verify
surface beyond the live smoke in `tasks.md`.

---

## Open items (owner)

- (none pending) — the ANSI item flagged `n` in the spec is resolved here (local strip helper
  exercised by the `claude --help` fixture). The opencode **exit-hint wording** is not recorded
  verbatim; the design avoids depending on it by extracting the `ses_…` token directly, which
  the recorded `session list` sample proves extractable.