import { describe, expect, it } from 'vitest'
import type { GitRunner } from './git'
import { locateBranch } from './pr-locate'

// Every name here is fictitious: this repository is public.

const GITHUB_FORK = 'git@github.com:contoso/widget.git'
const ADO_UPSTREAM = 'https://dev.azure.com/acme/platform/_git/widget'

/**
 * A repository as git would answer for it, recording every command asked:
 * its branch, remotes and the branch's tracked remote (`git config` exits 1
 * when there is none).
 */
function fakeGit(repo: { branch: string; remotes: Record<string, string>; tracked?: string }): {
  run: GitRunner
  asked: string[]
} {
  const asked: string[] = []
  const run: GitRunner = async (_cwd, args) => {
    const command = args.join(' ')
    asked.push(command)
    if (command === 'rev-parse --abbrev-ref HEAD') return { stdout: `${repo.branch}\n` }
    if (command === 'remote -v') {
      const lines = Object.entries(repo.remotes).flatMap(([name, url]) => [
        `${name}\t${url} (fetch)`,
        `${name}\t${url} (push)`
      ])
      return { stdout: lines.join('\n') + '\n' }
    }
    if (command === `config --get branch.${repo.branch}.remote`) {
      if (repo.tracked === undefined) throw new Error('exit 1')
      return { stdout: `${repo.tracked}\n` }
    }
    throw new Error(`unexpected git ${command}`)
  }
  return { run, asked }
}

describe('locateBranch (FPRG-06, design N6)', () => {
  it('says the HEAD is detached, and reads nothing more', async () => {
    const git = fakeGit({ branch: 'HEAD', remotes: { origin: ADO_UPSTREAM } })

    expect(await locateBranch(git.run, '/repo')).toEqual({ kind: 'detached' })
    expect(git.asked).toEqual(['rev-parse --abbrev-ref HEAD'])
  })

  it('tracks nothing when the branch has no tracked remote', async () => {
    const git = fakeGit({ branch: 'feature/x', remotes: { origin: ADO_UPSTREAM } })

    const located = await locateBranch(git.run, '/repo')

    expect(located).toEqual({
      kind: 'ok',
      branch: 'feature/x',
      remotes: [
        {
          name: 'origin',
          url: ADO_UPSTREAM,
          ref: { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' }
        }
      ],
      tracked: null
    })
  })

  it('lists a GitHub and an Azure DevOps remote side by side, with the one the branch tracks', async () => {
    const git = fakeGit({
      branch: 'feature/x',
      remotes: { fork: GITHUB_FORK, upstream: ADO_UPSTREAM },
      tracked: 'fork'
    })

    const located = await locateBranch(git.run, '/repo')

    expect(located).toEqual({
      kind: 'ok',
      branch: 'feature/x',
      remotes: [
        {
          name: 'fork',
          url: GITHUB_FORK,
          ref: { provider: 'github', owner: 'contoso', repo: 'widget' }
        },
        {
          name: 'upstream',
          url: ADO_UPSTREAM,
          ref: { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' }
        }
      ],
      tracked: 'fork'
    })
  })

  it('leaves out a remote it does not recognize, while still naming it as tracked', async () => {
    const git = fakeGit({
      branch: 'feature/x',
      remotes: { mirror: 'https://git.example.com/acme/widget.git', origin: GITHUB_FORK },
      tracked: 'mirror'
    })

    const located = await locateBranch(git.run, '/repo')

    expect(located.kind === 'ok' && located.remotes.map((remote) => remote.name)).toEqual([
      'origin'
    ])
    expect(located.kind === 'ok' && located.tracked).toBe('mirror')
  })
})
