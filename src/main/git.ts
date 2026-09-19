import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * The single way this app runs git (AD-023, STBR-27): `execFile`, so no shell
 * ever parses the arguments, a hidden window, and `GIT_TERMINAL_PROMPT=0`.
 * `timeoutMs` maps to `execFile`'s `timeout`: the process is killed once it
 * elapses, and the rejection satisfies `isTimeout` (STBR-24).
 */
export function git(
  cwd: string,
  args: string[],
  opts: { timeoutMs?: number } = {}
): Promise<{ stdout: string }> {
  // GIT_TERMINAL_PROMPT=0: a fetch with no cached credentials fails fast instead
  // of hanging the main process on an un-answerable prompt (WBR-02 → blocks).
  return run('git', args, {
    cwd,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: opts.timeoutMs
  })
}

/** Git's own first stderr line (e.g. "fatal: …") reads better than execFile's wrapper message. */
export function gitFailureLine(err: unknown): string {
  const stderr = (err as { stderr?: string }).stderr
  const line = stderr?.split(/\r?\n/).find((l) => l.trim() !== '')
  if (line) return line.trim()
  return err instanceof Error ? err.message.split('\n')[0] : String(err)
}

/** True when `execFile` killed the process because `timeoutMs` elapsed, not when git merely failed. */
export function isTimeout(err: unknown): boolean {
  return (err as { killed?: unknown } | null)?.killed === true
}
