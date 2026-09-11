import type { PersistedSession } from '../shared/config'
import { commandKey } from '../shared/command-key'
import type { AgentDef } from './spawn-plan'

/**
 * Per-agent resume strategy (RSMR). Keyed by the normalized bare command
 * (`commandKey`) so a renamed registry entry or an absolute path still resolves
 * (RSMR-13).
 *
 * - `id`: the agent prints its conversation id in the PTY stream; the app
 *   captures it (`extractResumeId`) and re-injects it on respawn/spawn
 *   (`--session <id>` for opencode).
 * - `continue`: the agent resumes the most recent conversation in the cwd on
 *   its own; no id is needed (Claude `--continue`).
 *
 * Only mechanisms proven against a recorded sample of that CLI ship (RSMR-14/15).
 * Codex (`codex resume --last`) and Copilot (`--resume <id>`) are documented but
 * not locally verifiable — no row yet, so they stay fresh until one exists.
 */
export type ResumeMechanism =
  | { kind: 'id'; idPattern: RegExp; args: (id: string) => string[] }
  | { kind: 'continue'; args: string[] }

const RESUME_MECHANISMS: Record<string, ResumeMechanism> = {
  opencode: {
    kind: 'id',
    // opencode session ids are `ses_<alphanumeric>` (pinned by the recorded
    // `opencode-session-list.json`); the global flag is required by matchAll.
    idPattern: /(ses_[A-Za-z0-9]+)/g,
    args: (id) => ['--session', id]
  },
  claude: { kind: 'continue', args: ['--continue'] }
}

export function resolveMechanism(command: string): ResumeMechanism | null {
  return RESUME_MECHANISMS[commandKey(command)] ?? null
}

/** The agent's conversation id from its output. The LAST match wins — the exit
 * hint is the last `ses_…` printed, superseding any earlier tool/session token.
 * A non-id mechanism never yields an id. */
export function extractResumeId(text: string, mechanism: ResumeMechanism): string | null {
  if (mechanism.kind !== 'id') return null
  const matches = Array.from(text.matchAll(mechanism.idPattern))
  return matches.length > 0 ? matches[matches.length - 1][1] : null
}

/**
 * The resume args for spawning `command` in `cwd` (RSMR-09..13, RSMR-23/24).
 * The LAST session in `config.sessions` matching `cwd` and the same normalized
 * command decides: id agents inject their captured id; continue agents inject
 * their flag whenever any such session exists; everything else starts fresh ([]).
 */
export function resolveResumeArgs(
  sessions: PersistedSession[],
  agents: AgentDef[],
  cwd: string,
  command: string
): string[] {
  const mechanism = resolveMechanism(command)
  if (!mechanism) return []
  const key = commandKey(command)
  let lastMatch: PersistedSession | null = null
  for (const session of sessions) {
    const def = agents.find((a) => a.name === session.agent)
    if (!def || session.cwd !== cwd || commandKey(def.command) !== key) continue
    lastMatch = session
  }
  if (!lastMatch) return []
  if (mechanism.kind === 'id') {
    return lastMatch.agentSessionId ? mechanism.args(lastMatch.agentSessionId) : []
  }
  return mechanism.args
}