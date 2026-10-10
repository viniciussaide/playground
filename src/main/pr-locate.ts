import type { RemoteRef } from '../shared/files'
import type { GitRunner } from './git'
import { parseRemote } from './remote-url'

/**
 * Where a worktree's branch lives, read once for every pull request provider
 * (design N6): the branch, every remote the app recognizes with the repository
 * it points at, and the remote the branch tracks — the one its commits are
 * pushed to, which names a pull request's source (FPRA-02, FPRG-06). Each
 * provider's client keeps its own remotes from it.
 */
export type BranchLocation =
  | {
      kind: 'ok'
      branch: string
      /** Remotes `parseRemote` recognizes, by name, with their fetch URL; any other is left out. */
      remotes: { name: string; url: string; ref: RemoteRef }[]
      /** The branch's `branch.<name>.remote`; null when it tracks nothing. */
      tracked: string | null
    }
  | { kind: 'detached' }
  | { kind: 'error'; message: string }

/**
 * Reads a branch's location with three git reads, each through the runner it
 * is given — the paced `git()` in the app (AD-023). A detached HEAD is an
 * answer, not a failure, and so is a branch that tracks nothing.
 */
export async function locateBranch(run: GitRunner, worktreePath: string): Promise<BranchLocation> {
  let branch: string
  let remotes: { name: string; url: string }[]
  try {
    const { stdout: head } = await run(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD'])
    branch = head.trim()
    if (branch === '' || branch === 'HEAD') return { kind: 'detached' }
    remotes = parseRemoteUrls((await run(worktreePath, ['remote', '-v'])).stdout)
  } catch (err) {
    return { kind: 'error', message: messageOf(err) }
  }
  let tracked: string | null
  try {
    const { stdout } = await run(worktreePath, ['config', '--get', `branch.${branch}.remote`])
    tracked = stdout.trim() === '' ? null : stdout.trim()
  } catch {
    // `git config --get` exits 1 when the key is unset: the branch tracks nothing.
    tracked = null
  }
  const recognized = remotes.flatMap(({ name, url }) => {
    const ref = parseRemote(url)
    return ref ? [{ name, url, ref }] : []
  })
  return { kind: 'ok', branch, remotes: recognized, tracked }
}

/** `git remote -v` as name and fetch URL pairs, once per remote. */
function parseRemoteUrls(stdout: string): { name: string; url: string }[] {
  const remotes = new Map<string, string>()
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line.trim())
    if (match && !remotes.has(match[1])) remotes.set(match[1], match[2])
  }
  return [...remotes].map(([name, url]) => ({ name, url }))
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message.split('\n')[0] : String(err)
}
