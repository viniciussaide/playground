import { afterEach, describe, expect, it } from 'vitest'
import type { GitHubPrFile, PrDetail, PrRef } from '../shared/files'
import type { GitRunner } from './git'
import { GitHubGateway, type GhRunner } from './github-gateway'
import { GitHubPrClient } from './github-pr'

// Every name here is fictitious, and the token is an obvious fake: this
// repository is public (spec privacy guardrail).

const TOKEN = 'gho_FAKE_TOKEN_FOR_TESTS_ONLY'
const UPSTREAM = 'https://github.com/acme/widget.git'
const FORK = 'git@github.com:contoso/widget.git'
const ADO = 'https://dev.azure.com/acme/platform/_git/widget'
const PR: PrRef = { target: { provider: 'github', owner: 'acme', repo: 'widget' }, id: 7 }

const signedIn: GhRunner = async () => ({ stdout: `${TOKEN}\n` })

interface Sent {
  method: string
  url: URL
  /** A GraphQL request's parsed body; null for a REST GET. */
  gql: { query: string; variables: Record<string, unknown> } | null
}

type Route = (req: Sent) => Response | Promise<Response>

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })

/**
 * A stand-in for api.github.com behind the real gateway: answers by the
 * request and records every one, so a test can say what was asked — and what
 * was not.
 */
function fakeGitHub(route: Route): { fetchFn: typeof fetch; sent: Sent[] } {
  const sent: Sent[] = []
  const fetchFn: typeof fetch = async (input, init) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Sent['gql']) : null
    const req: Sent = { method: init?.method ?? 'GET', url: new URL(String(input)), gql: body }
    sent.push(req)
    return route(req)
  }
  return { fetchFn, sent }
}

/** A repository as git would answer for it: its branch, remotes and the branch's tracked remote. */
function fakeGit(repo: {
  branch: string
  remotes: Record<string, string>
  tracked?: string
}): GitRunner {
  return async (_cwd, args) => {
    const command = args.join(' ')
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
}

/** The fork flow: `feature/x` pushed to the fork `contoso/widget`, the upstream `acme/widget`. */
const forkFlow = fakeGit({
  branch: 'feature/x',
  remotes: { origin: UPSTREAM, fork: FORK },
  tracked: 'fork'
})

/** Every request any read test sent, checked after each one: reads never write (FPRG-24). */
let readRequests: Sent[] = []
function client(route: Route, git?: GitRunner, runner: GhRunner = signedIn): GitHubPrClient {
  const github = fakeGitHub(route)
  readRequests = github.sent
  return new GitHubPrClient({
    gateway: new GitHubGateway({ runner, fetchFn: github.fetchFn }),
    run: git
  })
}

afterEach(() => {
  const writes = readRequests.filter(
    (r) =>
      !(r.method === 'GET' && r.gql === null) &&
      !(r.method === 'POST' && r.url.pathname === '/graphql' && /^query\b/.test(r.gql?.query ?? ''))
  )
  expect(writes).toEqual([])
  expect(readRequests.filter((r) => /\bmutation\b/.test(r.gql?.query ?? ''))).toEqual([])
  readRequests = []
})

const restPr = (number: number, title: string, base = 'main', draft = false): unknown => ({
  number,
  title,
  draft,
  base: { ref: base, sha: 'base1' },
  head: { sha: 'head1', repo: { name: 'widget', owner: { login: 'contoso' } } }
})

describe('GitHubPrClient.findPrs (FPRG-06, 07)', () => {
  it('asks every github remote for open PRs whose head is the fork owner and branch', async () => {
    const github = client(({ url }) => {
      if (url.pathname === '/repos/acme/widget/pulls') {
        return json([restPr(7, 'Fix login redirect', 'main', true)])
      }
      if (url.pathname === '/repos/contoso/widget/pulls') return json([restPr(3, 'Try it', 'dev')])
      return json({}, 500)
    }, forkFlow)

    const result = await github.findPrs('/repo')

    expect(readRequests.map((r) => r.url.pathname)).toEqual([
      '/repos/acme/widget/pulls',
      '/repos/contoso/widget/pulls'
    ])
    for (const search of readRequests) {
      expect(search.url.searchParams.get('head')).toBe('contoso:feature/x')
      expect(search.url.searchParams.get('state')).toBe('open')
    }
    expect(result).toEqual({
      kind: 'found',
      prs: [
        {
          target: { provider: 'github', owner: 'acme', repo: 'widget' },
          id: 7,
          title: 'Fix login redirect',
          targetBranch: 'main',
          isDraft: true
        },
        {
          target: { provider: 'github', owner: 'contoso', repo: 'widget' },
          id: 3,
          title: 'Try it',
          targetBranch: 'dev',
          isDraft: false
        }
      ]
    })

    const none = client(() => json([]), forkFlow)
    expect(await none.findPrs('/repo')).toEqual({ kind: 'none', createUrlAvailable: true })
  })

  it('asks github nothing when the branch tracks no github remote, or there is none', async () => {
    const tracksNothing = client(
      () => json([]),
      fakeGit({ branch: 'feature/x', remotes: { origin: UPSTREAM, fork: FORK } })
    )
    // Not pushed to GitHub: no search, and no Create PR (FPRG-06, lesson L-127).
    expect(await tracksNothing.findPrs('/repo')).toEqual({
      kind: 'none',
      createUrlAvailable: false
    })
    expect(readRequests).toEqual([])

    const tracksAdo = client(
      () => json([]),
      fakeGit({ branch: 'feature/x', remotes: { origin: UPSTREAM, ado: ADO }, tracked: 'ado' })
    )
    expect(await tracksAdo.findPrs('/repo')).toEqual({ kind: 'none', createUrlAvailable: false })
    expect(readRequests).toEqual([])

    const adoOnly = client(
      () => json([]),
      fakeGit({ branch: 'feature/x', remotes: { origin: ADO }, tracked: 'origin' })
    )
    expect(await adoOnly.findPrs('/repo')).toEqual({ kind: 'no-remote' })
    expect(readRequests).toEqual([])

    const detached = client(
      () => json([]),
      fakeGit({ branch: 'HEAD', remotes: { origin: UPSTREAM } })
    )
    expect(await detached.findPrs('/repo')).toEqual({ kind: 'detached' })
    expect(readRequests).toEqual([])
  })

  it('reads sign-in, a missing gh and the rate limit as results, and refuses another provider unasked', async () => {
    const signedOut = client(
      () => json([]),
      forkFlow,
      async () => {
        throw Object.assign(new Error('Command failed: gh auth token'), { code: 1 })
      }
    )
    expect(await signedOut.findPrs('/repo')).toEqual({ kind: 'auth' })
    expect(await signedOut.getPr(PR)).toEqual({ kind: 'auth' })
    expect(readRequests).toEqual([])

    const missing = client(
      () => json([]),
      forkFlow,
      async () => {
        throw Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' })
      }
    )
    expect(await missing.findPrs('/repo')).toEqual({
      kind: 'error',
      message: 'The GitHub CLI (gh) is not installed.'
    })

    const limited = client(
      () =>
        json({ message: 'API rate limit exceeded' }, 403, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1760000000'
        }),
      forkFlow
    )
    expect(await limited.findPrs('/repo')).toEqual({
      kind: 'rate-limited',
      resetAt: 1_760_000_000_000
    })
    // One refusal, and no retry (FPRG-26).
    expect(readRequests).toHaveLength(1)

    const ado = client(() => json({}))
    const adoPr: PrRef = {
      target: { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' },
      id: 7
    }
    const refused = { kind: 'error', message: 'This pull request is not on GitHub.' }
    expect(await ado.getPr(adoPr)).toEqual(refused)
    expect(await ado.files(adoPr)).toEqual(refused)
    expect((await ado.fileSides(adoPr, 'src/app.ts')).modified).toEqual(refused)
    expect(readRequests).toEqual([])
  })
})

describe('GitHubPrClient.createTarget and openPage (FPRG-08)', () => {
  it("targets a fork's parent and its default branch, a non-fork itself, and opens the compare page", async () => {
    const github = client(({ url }) => {
      if (url.pathname === '/repos/contoso/widget') {
        return json({
          fork: true,
          default_branch: 'feature-base',
          parent: { name: 'widget', owner: { login: 'acme' }, default_branch: 'main' }
        })
      }
      if (url.pathname === '/repos/acme/widget')
        return json({ fork: false, default_branch: 'trunk' })
      return json({}, 500)
    }, forkFlow)

    expect(
      await github.createTarget({ provider: 'github', owner: 'contoso', repo: 'widget' })
    ).toEqual({
      kind: 'ok',
      value: {
        target: { provider: 'github', owner: 'acme', repo: 'widget' },
        defaultBranch: 'main'
      }
    })
    expect(
      await github.createTarget({ provider: 'github', owner: 'acme', repo: 'widget' })
    ).toEqual({
      kind: 'ok',
      value: {
        target: { provider: 'github', owner: 'acme', repo: 'widget' },
        defaultBranch: 'trunk'
      }
    })

    const opened: string[] = []
    const open = async (url: string): Promise<void> => {
      opened.push(url)
    }
    expect(await github.openPage('/repo', { create: true }, open)).toEqual({ ok: true })
    expect(await github.openPage('/repo', { pr: PR }, open)).toEqual({ ok: true })
    const unpushed = client(
      () => json({}, 500),
      fakeGit({ branch: 'feature/x', remotes: { origin: UPSTREAM } })
    )
    expect(await unpushed.openPage('/repo', { create: true }, open)).toEqual({
      ok: false,
      error: 'This branch is not pushed to GitHub.'
    })
    expect(opened).toEqual([
      'https://github.com/acme/widget/compare/main...contoso:feature/x?expand=1',
      'https://github.com/acme/widget/pull/7'
    ])
  })
})

/** One page of a GraphQL connection, cursors being indexes. */
function connection<T>(all: T[], start = 0): unknown {
  const more = start + 100 < all.length
  return {
    nodes: all.slice(start, start + 100),
    pageInfo: { hasNextPage: more, endCursor: more ? String(start + 100) : null }
  }
}

interface FakeThread {
  id: string
  comments: unknown[]
  [field: string]: unknown
}

interface FakePr {
  fields: Record<string, unknown>
  latestReviews: unknown[]
  reviews: unknown[]
  reviewRequests: unknown[]
  comments: unknown[]
  reviewThreads: FakeThread[]
}

/**
 * GitHub's GraphQL endpoint for one pull request: the first query gets the
 * first page of every connection; a query with `after` gets the next page of
 * the one connection it names, or of one thread's comments.
 */
function graphql(pr: FakePr, gql: NonNullable<Sent['gql']>): Response {
  const after = Number(gql.variables.after ?? 0)
  if (gql.query.includes('node(id: $id)')) {
    const thread = pr.reviewThreads.find((t) => t.id === gql.variables.id)
    return json({ data: { node: { comments: connection(thread?.comments ?? [], after) } } })
  }
  const paged = /(\w+)\(first: 100, after: \$after\)/.exec(gql.query)
  if (paged) {
    const name = paged[1] as Exclude<keyof FakePr, 'fields'>
    const all = pr[name] as unknown[]
    const nodes =
      name === 'reviewThreads'
        ? (all as FakeThread[]).map((t) => ({ ...t, comments: connection(t.comments) }))
        : all
    return json({ data: { repository: { pullRequest: { [name]: connection(nodes, after) } } } })
  }
  return json({
    data: {
      repository: {
        pullRequest: {
          ...pr.fields,
          latestReviews: connection(pr.latestReviews),
          reviews: connection(pr.reviews),
          reviewRequests: connection(pr.reviewRequests),
          comments: connection(pr.comments),
          reviewThreads: connection(
            pr.reviewThreads.map((t) => ({ ...t, comments: connection(t.comments) }))
          )
        }
      }
    }
  })
}

const PR_FIELDS = {
  number: 7,
  title: 'Fix login redirect',
  body: 'Redirects after login.',
  isDraft: true,
  state: 'OPEN',
  createdAt: '2026-10-01T12:00:00Z',
  author: { login: 'contoso-dev' },
  baseRefName: 'main',
  headRefName: 'feature/x',
  baseRefOid: 'base1',
  headRefOid: 'head1',
  headRepository: { name: 'widget', owner: { login: 'contoso' } }
}

function reviewThread(id: string, comments: unknown[], line = 14): FakeThread {
  return {
    id,
    path: 'src/app.ts',
    line,
    startLine: 12,
    originalLine: line,
    originalStartLine: 12,
    diffSide: 'RIGHT',
    subjectType: 'LINE',
    isResolved: false,
    isOutdated: false,
    viewerCanReply: true,
    viewerCanResolve: true,
    viewerCanUnresolve: false,
    comments
  }
}

const reviewComment = (databaseId: number): unknown => ({
  databaseId,
  author: { login: 'robin' },
  body: `Comment ${databaseId}`,
  createdAt: '2026-10-02T09:00:00Z'
})

/** A pull request's routes: GraphQL from `pr`, its files from `files`. */
function pullRequestRoute(pr: FakePr, files: unknown[] = []): Route {
  return ({ url, gql }) => {
    if (url.pathname === '/graphql' && gql) return graphql(pr, gql)
    if (url.pathname === '/repos/acme/widget/pulls/7/files') {
      const page = Number(url.searchParams.get('page'))
      return json(files.slice((page - 1) * 100, page * 100))
    }
    return json({}, 500)
  }
}

describe('GitHubPrClient.getPr (FPRG-09, 10, 13, 14)', () => {
  it('reads the overview, reviews, timeline, threads and files of one pull request', async () => {
    const github = client(
      pullRequestRoute(
        {
          fields: PR_FIELDS,
          latestReviews: [
            {
              author: { login: 'robin' },
              state: 'APPROVED',
              body: '',
              submittedAt: '2026-10-03T10:00:00Z'
            }
          ],
          reviews: [
            {
              author: { login: 'robin' },
              state: 'COMMENTED',
              body: 'One question.',
              submittedAt: '2026-10-02T10:00:00Z'
            },
            {
              author: { login: 'robin' },
              state: 'APPROVED',
              body: '',
              submittedAt: '2026-10-03T10:00:00Z'
            }
          ],
          reviewRequests: [{ requestedReviewer: { __typename: 'Team', name: 'widget-core' } }],
          comments: [
            {
              author: { login: 'contoso-dev' },
              body: 'Rebased.',
              createdAt: '2026-10-02T12:00:00Z'
            }
          ],
          reviewThreads: [reviewThread('PRRT_1', [reviewComment(501)])]
        },
        [
          {
            filename: 'src/app.ts',
            status: 'modified',
            patch: '@@ -10,4 +12,6 @@ export\n context\n+added'
          },
          { filename: 'docs/logo.png', status: 'added' },
          {
            filename: 'src/new-name.ts',
            status: 'renamed',
            previous_filename: 'src/old-name.ts',
            patch: '@@ -1 +1 @@\n-a\n+b'
          }
        ]
      )
    )

    const result = await github.getPr(PR)

    const first = readRequests[0]
    expect(first.url.pathname).toBe('/graphql')
    expect(first.gql?.variables).toEqual({ owner: 'acme', name: 'widget', number: 7 })
    const files: GitHubPrFile[] = [
      { path: 'src/app.ts', status: 'modified', hunks: [{ newStart: 12, newEnd: 17 }] },
      { path: 'docs/logo.png', status: 'added', hunks: null },
      {
        path: 'src/new-name.ts',
        status: 'renamed',
        oldPath: 'src/old-name.ts',
        hunks: [{ newStart: 1, newEnd: 1 }]
      }
    ]
    const detail: PrDetail = {
      target: PR.target,
      id: 7,
      title: 'Fix login redirect',
      targetBranch: 'main',
      isDraft: true,
      status: 'active',
      author: 'contoso-dev',
      description: 'Redirects after login.',
      createdAt: Date.parse('2026-10-01T12:00:00Z'),
      sourceBranch: 'feature/x',
      reviewers: [
        { name: 'robin', state: 'approved', isGroup: false, isRequired: false },
        { name: 'widget-core', state: 'no-vote', isGroup: true, isRequired: false }
      ],
      revision: 'head1',
      github: {
        headSha: 'head1',
        baseSha: 'base1',
        headRepo: { owner: 'contoso', repo: 'widget' },
        filesIncomplete: false
      },
      files,
      threads: [
        {
          id: 'PRRT_1',
          rootCommentId: 501,
          resolution: 'active',
          can: { reply: true, resolve: true, reopen: false },
          comments: [
            {
              id: 501,
              author: 'robin',
              content: 'Comment 501',
              at: Date.parse('2026-10-02T09:00:00Z')
            }
          ],
          place: { kind: 'placed', path: 'src/app.ts', side: 'right', startLine: 12, endLine: 14 }
        }
      ],
      timeline: [
        {
          author: 'robin',
          at: Date.parse('2026-10-02T10:00:00Z'),
          content: 'One question.',
          reviewState: 'commented'
        },
        { author: 'contoso-dev', at: Date.parse('2026-10-02T12:00:00Z'), content: 'Rebased.' }
      ]
    }
    expect(result).toEqual({ kind: 'ok', detail })
  })

  it('pages every connection to its end: 150 threads, a 120-comment thread, 250 reviews', async () => {
    const at = (i: number): string => new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString()
    const pr: FakePr = {
      fields: PR_FIELDS,
      latestReviews: Array.from({ length: 101 }, (_, i) => ({
        author: { login: `reviewer-${i}` },
        state: 'COMMENTED',
        body: '',
        submittedAt: at(i)
      })),
      reviews: Array.from({ length: 250 }, (_, i) => ({
        author: { login: `reviewer-${i}` },
        state: 'COMMENTED',
        body: `Review ${i}`,
        submittedAt: at(i)
      })),
      reviewRequests: Array.from({ length: 105 }, (_, i) => ({
        requestedReviewer: { __typename: 'Team', name: `team-${i}` }
      })),
      comments: Array.from({ length: 130 }, (_, i) => ({
        author: { login: 'contoso-dev' },
        body: `Comment ${i}`,
        createdAt: at(i)
      })),
      reviewThreads: Array.from({ length: 150 }, (_, i) =>
        reviewThread(
          `PRRT_${i}`,
          Array.from({ length: i === 0 ? 120 : 1 }, (_, c) => reviewComment(i * 1000 + c))
        )
      )
    }
    const github = client(pullRequestRoute(pr))

    const result = await github.getPr(PR)

    if (result.kind !== 'ok') throw new Error(`getPr failed: ${JSON.stringify(result)}`)
    expect(result.detail.threads).toHaveLength(150)
    expect(result.detail.threads.map((t) => t.id)).toEqual(pr.reviewThreads.map((t) => t.id))
    expect(result.detail.threads[0].comments).toHaveLength(120)
    expect(result.detail.timeline).toHaveLength(250 + 130)
    expect(result.detail.reviewers).toHaveLength(101 + 105)
    // The first query, then one more page each: latestReviews, reviewRequests,
    // comments, reviewThreads and the long thread's comments; two for reviews.
    expect(readRequests.filter((r) => r.url.pathname === '/graphql')).toHaveLength(8)
  })
})

describe('GitHubPrClient.files (FPRG-11, 22; edge case)', () => {
  const file = (i: number): unknown => ({
    filename: `src/file-${i}.ts`,
    status: 'modified',
    patch: `@@ -${i + 1},2 +${i + 1},3 @@`
  })

  it('pages to the end, keeps each patch as hunks, and flags the 3000-file ceiling', async () => {
    const all = Array.from({ length: 250 }, (_, i) => file(i))
    const github = client(pullRequestRoute({} as FakePr, all))

    const result = await github.files(PR)

    expect(readRequests.map((r) => r.url.searchParams.get('page'))).toEqual(['1', '2', '3'])
    expect(readRequests.map((r) => r.url.searchParams.get('per_page'))).toEqual([
      '100',
      '100',
      '100'
    ])
    if (result.kind !== 'ok') throw new Error('files failed')
    expect(result.value.incomplete).toBe(false)
    expect(result.value.files).toHaveLength(250)
    expect(result.value.files[249]).toEqual({
      path: 'src/file-249.ts',
      status: 'modified',
      hunks: [{ newStart: 250, newEnd: 252 }]
    })

    // GitHub stops listing at 3000 files; the client stops asking there too.
    const many = Array.from({ length: 3100 }, (_, i) => file(i))
    const huge = client(pullRequestRoute({} as FakePr, many))
    const capped = await huge.files(PR)
    expect(capped.kind === 'ok' && capped.value.files.length).toBe(3000)
    expect(capped.kind === 'ok' && capped.value.incomplete).toBe(true)
    expect(readRequests).toHaveLength(30)
  })
})

describe('GitHubPrClient.mergeBase (FPRG-12; T1, S6)', () => {
  it("compares the base sha with the head sha in the base repository, a fork's head included", async () => {
    const github = client(({ url }) =>
      url.pathname === '/repos/acme/widget/compare/base1...head1'
        ? json({ merge_base_commit: { sha: 'merge1' } })
        : json({}, 404)
    )

    expect(
      await github.mergeBase(
        { provider: 'github', owner: 'acme', repo: 'widget' },
        'base1',
        'head1'
      )
    ).toEqual({ kind: 'ok', value: 'merge1' })
    expect(readRequests.map((r) => r.url.pathname)).toEqual([
      '/repos/acme/widget/compare/base1...head1'
    ])
  })
})

/** Base64 as GitHub's contents API sends it: wrapped with newlines (S7). */
const wrapped = (bytes: Buffer): string => bytes.toString('base64').replace(/(.{60})/g, '$1\n')

/** `contents/{path}?ref=` answers, keyed `owner/repo@ref:path`; anything else is a 404. */
function contents(
  byKey: Record<string, { text?: string; bytes?: Buffer; size?: number } | 'fail'>
): Route {
  return ({ url }) => {
    const match = /^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/.exec(url.pathname)
    if (!match) return json({}, 500)
    const entry = byKey[`${match[1]}/${match[2]}@${url.searchParams.get('ref')}:${match[3]}`]
    if (entry === 'fail') return json({ message: 'Repository access blocked' }, 451)
    if (!entry) return json({ message: 'Not Found' }, 404)
    const bytes = entry.bytes ?? Buffer.from(entry.text ?? '')
    return json({
      type: 'file',
      encoding: 'base64',
      size: entry.size ?? bytes.length,
      content: wrapped(bytes)
    })
  }
}

describe('GitHubPrClient.fileSides (FPRG-12; T1, S6)', () => {
  /** The PR, its merge base, then the contents. */
  function prFiles(
    headRepo: { name: string; owner: { login: string } } | null,
    files: Parameters<typeof contents>[0]
  ): Route {
    return (req) => {
      const path = req.url.pathname
      if (path === '/repos/acme/widget/pulls/7') {
        return json({
          number: 7,
          title: 'x',
          base: { ref: 'main', sha: 'base1' },
          head: { sha: 'head1', repo: headRepo }
        })
      }
      if (path === '/repos/acme/widget/compare/base1...head1') {
        return json({ merge_base_commit: { sha: 'merge1' } })
      }
      return contents(files)(req)
    }
  }
  const fork = { name: 'widget', owner: { login: 'contoso' } }
  const contentReads = (): string[] =>
    readRequests
      .filter((r) => r.url.pathname.includes('/contents/'))
      .map((r) => `${r.url.pathname.split('/')[2]}@${r.url.searchParams.get('ref')}`)

  it('reads the head side from the head repository, then from the base repository when the fork is gone', async () => {
    const open = client(
      prFiles(fork, {
        'acme/widget@merge1:src/old.ts': { text: 'old\n' },
        'contoso/widget@head1:src/app.ts': { text: 'new\n' }
      })
    )
    expect(await open.fileSides(PR, 'src/app.ts', 'src/old.ts')).toEqual({
      original: { kind: 'text', text: 'old\n', size: 4 },
      modified: { kind: 'text', text: 'new\n', size: 4 },
      eolChanged: [],
      eolFrom: 'LF',
      eolTo: 'LF'
    })
    expect(contentReads()).toEqual(['acme@merge1', 'contoso@head1'])

    // The fork was deleted: GitHub reports no head repository.
    const deleted = client(
      prFiles(null, {
        'acme/widget@merge1:src/app.ts': { text: 'a\n' },
        'acme/widget@head1:src/app.ts': { text: 'b\n' }
      })
    )
    expect((await deleted.fileSides(PR, 'src/app.ts')).modified).toEqual({
      kind: 'text',
      text: 'b\n',
      size: 2
    })
    expect(contentReads()).toEqual(['acme@merge1', 'acme@head1'])

    // The fork is there but refuses: the base repository serves the same commit.
    const refusing = client(
      prFiles(fork, {
        'acme/widget@merge1:src/app.ts': { text: 'a\n' },
        'contoso/widget@head1:src/app.ts': 'fail',
        'acme/widget@head1:src/app.ts': { text: 'b\n' }
      })
    )
    expect((await refusing.fileSides(PR, 'src/app.ts')).modified).toEqual({
      kind: 'text',
      text: 'b\n',
      size: 2
    })
    expect(contentReads()).toEqual(['acme@merge1', 'contoso@head1', 'acme@head1'])

    // Unavailable only when both reads fail; the base side still shows.
    const gone = client(
      prFiles(null, {
        'acme/widget@merge1:src/app.ts': { text: 'a\n' },
        'acme/widget@head1:src/app.ts': 'fail'
      })
    )
    const sides = await gone.fileSides(PR, 'src/app.ts')
    expect(sides.original).toEqual({ kind: 'text', text: 'a\n', size: 2 })
    expect(sides.modified).toEqual({
      kind: 'error',
      message: 'The head repository is unavailable: Repository access blocked'
    })
  })
})

describe('GitHubPrClient.fileSide (FPRG-12; T1, S7)', () => {
  const repo = { provider: 'github', owner: 'acme', repo: 'widget' } as const

  it('decodes wrapped base64, and refuses a folder, a large file, a binary and a missing path', async () => {
    const text = 'export const greeting = "hello, widget";\n'.repeat(5)
    const github = client(({ url, ...rest }) => {
      if (url.pathname.endsWith('/contents/src')) return json([{ type: 'file', name: 'app.ts' }])
      if (url.pathname.endsWith('/contents/huge.json')) {
        return json({ type: 'file', size: 1024 * 1024 + 1, encoding: 'base64', content: '' })
      }
      return contents({
        'acme/widget@head1:src/app.ts': { text },
        'acme/widget@head1:logo.png': { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1]) }
      })({ url, ...rest })
    })

    expect(await github.fileSide(repo, 'src/app.ts', 'head1')).toEqual({
      kind: 'text',
      text,
      size: text.length
    })
    expect(readRequests[0].url.pathname).toBe('/repos/acme/widget/contents/src/app.ts')
    expect(readRequests[0].url.searchParams.get('ref')).toBe('head1')
    expect(await github.fileSide(repo, 'src', 'head1')).toEqual({
      kind: 'error',
      message: 'src is a folder.'
    })
    expect(await github.fileSide(repo, 'huge.json', 'head1')).toEqual({
      kind: 'too-large',
      size: 1024 * 1024 + 1
    })
    expect(await github.fileSide(repo, 'logo.png', 'head1')).toEqual({ kind: 'binary', size: 7 })
    expect(await github.fileSide(repo, 'src/gone.ts', 'head1')).toEqual({ kind: 'absent' })
  })
})
