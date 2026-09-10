import type { AgentDef } from '../main/spawn-plan'

// Re-exported so the renderer can type agent props without reaching into main.
export type { AgentDef, Shell } from '../main/spawn-plan'

/**
 * The fixed seed agent list for AM2. Both main (to resolve a session's stored
 * agent name to its launch definition) and the renderer (to render the agent
 * chips in the New Session dialog) import this. AM3 relocates the list into
 * `AppConfig` behind a Settings editor; until then it is a shared constant.
 *
 * Commands mirror `design/handoff/DESIGN_HANDOFF_AGENTS.md`. The `AgentDef`
 * type lives in `spawn-plan.ts`; the import is type-only, so this shared module
 * pulls no main-process code into the renderer bundle.
 */
/**
 * `undoByte` is spelled out for every seeded agent rather than left to the
 * default, so the reason each one gets its byte is on the record:
 *
 * - Claude Code binds undo to Ctrl+_ (US, 0x1F); Ctrl+Z is suspend there and
 *   has been reported to crash it on Windows.
 * - opencode's `input_undo` default is literally `ctrl+z` — its docs say the
 *   binding exists because Windows terminals have no POSIX suspend.
 * - Codex undoes with Esc Esc and Copilot documents no Ctrl+Z undo, so both
 *   get the plain terminal byte and are free to ignore it.
 */
export const SEEDED_AGENTS: AgentDef[] = [
  { name: 'Claude', command: 'claude', args: [], color: '--accent', undoByte: '\x1f' },
  { name: 'Copilot', command: 'gh', args: ['copilot'], color: '--blue', undoByte: '\x1a' },
  { name: 'Codex', command: 'codex', args: ['--full-auto'], color: '--green', undoByte: '\x1a' },
  { name: 'opencode', command: 'opencode', args: [], color: '--amber', undoByte: '\x1a' }
]
