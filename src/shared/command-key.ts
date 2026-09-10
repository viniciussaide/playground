/**
 * Bare command name, lowercased and stripped of any path and `.exe`/`.cmd`/`.bat`,
 * so `C:\...\claude.exe`, `claude` and `CLAUDE` are the same agent. Shared so the
 * renderer (`undoByteFor`) and main (`resume-mechanism`) key on the same identity
 * without main importing renderer code.
 */
export function commandKey(command: string): string {
  const leaf = command.split(/[\\/]/).pop() ?? command
  return leaf.toLowerCase().replace(/\.(exe|cmd|bat)$/, '')
}