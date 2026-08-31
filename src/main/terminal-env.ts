/**
 * PTY environment for agent sessions (INPUT-01, INPUT-02). TUI CLIs like
 * Claude Code degrade their renderer on a minimal `TERM` (box-drawing falls
 * back to ASCII, palette drops to 8 colors) and only parse extended key
 * sequences when `TERM_PROGRAM` is one they recognize — so these three values
 * are forced after merging the parent env, overriding whatever the host
 * process inherited.
 */
export const PTY_ENV_FORCED = {
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  TERM_PROGRAM: 'WezTerm'
} as const

export function buildPtyEnv(parentEnv: NodeJS.ProcessEnv): Record<string, string> {
  return { ...parentEnv, ...PTY_ENV_FORCED } as Record<string, string>
}
