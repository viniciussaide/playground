import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { GitHubGateway, type GhRunner } from './github-gateway'

// Every name here is fictitious, and the token is an obvious fake: this
// repository is public (spec privacy guardrail).

const TOKEN = 'gho_FAKE_TOKEN_FOR_TESTS_ONLY'

/** `gh auth token` answering with a token, as a signed-in CLI does. */
function signedIn(): { runner: GhRunner; calls: string[][] } {
  const calls: string[][] = []
  const runner: GhRunner = async (args) => {
    calls.push(args)
    return { stdout: `${TOKEN}\n` }
  }
  return { runner, calls }
}

/** `execFile` rejecting the way it does when `gh` is not on the PATH. */
const notInstalled: GhRunner = async () => {
  throw Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' })
}

/** `execFile` rejecting the way it does when `gh` exits non-zero (signed out). */
const signedOut: GhRunner = async () => {
  throw Object.assign(new Error('Command failed: gh auth token'), {
    code: 1,
    stderr: 'no oauth token found for github.com\n'
  })
}

interface Sent {
  url: string
  init: RequestInit
}

function fakeGitHub(answer: (url: string, init: RequestInit) => Response | Promise<Response>): {
  fetchFn: typeof fetch
  sent: Sent[]
} {
  const sent: Sent[] = []
  const fetchFn: typeof fetch = async (input, init) => {
    sent.push({ url: String(input), init: init ?? {} })
    return answer(String(input), init ?? {})
  }
  return { fetchFn, sent }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })

const header = (sent: Sent, name: string): string | null => new Headers(sent.init.headers).get(name)

/** Every console line the module could write, gathered to prove the token never reaches one. */
let consoleSpies: MockInstance[] = []
beforeEach(() => {
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => {})
  )
})
afterEach(() => {
  const lines = consoleSpies.flatMap((spy) => spy.mock.calls.map((call) => JSON.stringify(call)))
  expect(lines.filter((line) => line.includes(TOKEN))).toEqual([])
  for (const spy of consoleSpies) spy.mockRestore()
})

describe('GitHubGateway.ghStatus', () => {
  it('reads not installed when gh cannot be started, and never asks GitHub', async () => {
    const github = fakeGitHub(() => json({}))
    const gateway = new GitHubGateway({ runner: notInstalled, fetchFn: github.fetchFn })

    expect(await gateway.ghStatus()).toBe('not-installed')
    expect(await gateway.rest('GET', '/user')).toEqual({ kind: 'not-installed' })
    expect(github.sent).toEqual([])
  })

  it('reads not signed in when gh auth token exits non-zero', async () => {
    const github = fakeGitHub(() => json({}))
    const gateway = new GitHubGateway({ runner: signedOut, fetchFn: github.fetchFn })

    expect(await gateway.ghStatus()).toBe('not-signed-in')
    expect(await gateway.graphql('query { viewer { login } }', {})).toEqual({
      kind: 'not-signed-in'
    })
    expect(github.sent).toEqual([])
  })

  it('reads ok from gh auth token alone and keeps the token in memory for the requests', async () => {
    const gh = signedIn()
    const github = fakeGitHub(() => json({ login: 'contoso' }))
    const gateway = new GitHubGateway({ runner: gh.runner, fetchFn: github.fetchFn })

    const status = await gateway.ghStatus()
    expect(status).toBe('ok')
    expect(gh.calls).toEqual([['auth', 'token']])

    await gateway.rest('GET', '/user')
    await gateway.rest('GET', '/user')
    // One gh process: the token was kept, not asked for again or stored elsewhere.
    expect(gh.calls).toEqual([['auth', 'token']])
    expect(github.sent.map((s) => header(s, 'Authorization'))).toEqual([
      `Bearer ${TOKEN}`,
      `Bearer ${TOKEN}`
    ])
  })
})

describe('GitHubGateway requests', () => {
  it('sends REST and GraphQL to api.github.com with the bearer token and the API version', async () => {
    const github = fakeGitHub((url) =>
      url.endsWith('/graphql')
        ? json({ data: { viewer: { login: 'contoso' } } })
        : json({ id: 7 }, 201)
    )
    const gateway = new GitHubGateway({ runner: signedIn().runner, fetchFn: github.fetchFn })

    const posted = await gateway.rest('POST', '/repos/acme/widget/issues/7/comments', {
      body: 'Looks good'
    })
    const read = await gateway.graphql('query($n: Int!) { viewer { login } }', { n: 7 })

    expect(posted).toEqual({ kind: 'ok', value: { id: 7 } })
    expect(read).toEqual({ kind: 'ok', value: { viewer: { login: 'contoso' } } })
    const [rest, graphql] = github.sent
    expect(rest.url).toBe('https://api.github.com/repos/acme/widget/issues/7/comments')
    expect(rest.init.method).toBe('POST')
    expect(JSON.parse(String(rest.init.body))).toEqual({ body: 'Looks good' })
    expect(graphql.url).toBe('https://api.github.com/graphql')
    expect(graphql.init.method).toBe('POST')
    expect(JSON.parse(String(graphql.init.body))).toEqual({
      query: 'query($n: Int!) { viewer { login } }',
      variables: { n: 7 }
    })
    for (const sent of github.sent) {
      expect(header(sent, 'Authorization')).toBe(`Bearer ${TOKEN}`)
      expect(header(sent, 'X-GitHub-Api-Version')).toBe('2022-11-28')
    }
  })

  it('returns rate-limited with the reset time on a 403 whose remaining quota is 0', async () => {
    const github = fakeGitHub(() =>
      json({ message: 'API rate limit exceeded' }, 403, {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '1791600000'
      })
    )
    const gateway = new GitHubGateway({ runner: signedIn().runner, fetchFn: github.fetchFn })

    expect(await gateway.rest('GET', '/repos/acme/widget/pulls')).toEqual({
      kind: 'rate-limited',
      resetAt: 1_791_600_000_000
    })
  })

  it('returns rate-limited on a 429, with the reset header or else retry-after from now', async () => {
    const answers = [
      json({ message: 'slow down' }, 429, { 'x-ratelimit-reset': '1791600060' }),
      json({ message: 'slow down' }, 429, { 'retry-after': '30' })
    ]
    const github = fakeGitHub(() => answers.shift() as Response)
    const gateway = new GitHubGateway({
      runner: signedIn().runner,
      fetchFn: github.fetchFn,
      now: () => 1_791_500_000_000
    })

    expect(await gateway.rest('GET', '/repos/acme/widget')).toEqual({
      kind: 'rate-limited',
      resetAt: 1_791_600_060_000
    })
    expect(await gateway.rest('GET', '/repos/acme/widget')).toEqual({
      kind: 'rate-limited',
      resetAt: 1_791_500_030_000
    })
  })

  it('returns rate-limited on a GraphQL RATE_LIMITED error, with the reset header', async () => {
    const github = fakeGitHub(() =>
      json(
        { errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded for user' }] },
        200,
        { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1791600120' }
      )
    )
    const gateway = new GitHubGateway({ runner: signedIn().runner, fetchFn: github.fetchFn })

    expect(await gateway.graphql('query { viewer { login } }', {})).toEqual({
      kind: 'rate-limited',
      resetAt: 1_791_600_120_000
    })
  })

  it('drops the token on a 401 and reads not signed in, asking gh again next time', async () => {
    const gh = signedIn()
    const answers = [json({ message: 'Bad credentials' }, 401), json({ login: 'contoso' })]
    const github = fakeGitHub(() => answers.shift() as Response)
    const gateway = new GitHubGateway({ runner: gh.runner, fetchFn: github.fetchFn })

    expect(await gateway.rest('GET', '/user')).toEqual({ kind: 'not-signed-in' })
    expect(gh.calls).toHaveLength(1)
    expect(await gateway.rest('GET', '/user')).toEqual({ kind: 'ok', value: { login: 'contoso' } })
    expect(gh.calls).toHaveLength(2)
  })

  it('never throws and never lets the token out, on any failure path', async () => {
    const leakyGh: GhRunner = async () => {
      throw Object.assign(new Error(`Command failed: gh auth token\n${TOKEN}`), {
        code: 1,
        stdout: TOKEN
      })
    }
    const answers: (() => Response | Promise<Response>)[] = [
      // A network failure whose message echoes the request headers.
      () => Promise.reject(new Error(`connect ECONNREFUSED (Authorization: Bearer ${TOKEN})`)),
      // A refusal whose body echoes the token, with GitHub's validation details.
      () =>
        json(
          {
            message: `Validation Failed for ${TOKEN}`,
            errors: [{ field: 'pull_request_review_thread.line', message: 'could not be resolved' }]
          },
          422
        ),
      // A body that is not JSON.
      () => new Response(`<html>${TOKEN}</html>`, { status: 502 }),
      // A GraphQL error that is not a rate limit.
      () => json({ errors: [{ type: 'NOT_FOUND', message: `Could not resolve ${TOKEN}` }] }),
      // A 403 with quota left: a permission refusal, not a rate limit.
      () =>
        json({ message: 'Resource not accessible by integration' }, 403, {
          'x-ratelimit-remaining': '4999'
        })
    ]
    const github = fakeGitHub(() => (answers.shift() as () => Response | Promise<Response>)())
    const gateway = new GitHubGateway({ runner: signedIn().runner, fetchFn: github.fetchFn })
    const leaky = new GitHubGateway({ runner: leakyGh, fetchFn: github.fetchFn })

    const results = [
      await gateway.ghStatus(),
      await gateway.rest('GET', '/repos/acme/widget'),
      await gateway.rest('POST', '/repos/acme/widget/pulls/7/comments', { body: 'x' }),
      await gateway.rest('GET', '/repos/acme/widget'),
      await gateway.graphql('query { viewer { login } }', {}),
      await gateway.rest('POST', '/repos/acme/widget/issues/7/comments', { body: 'x' }),
      await leaky.ghStatus(),
      await leaky.rest('GET', '/user')
    ]

    expect(results).toEqual([
      'ok',
      { kind: 'error', status: null, message: 'connect ECONNREFUSED (Authorization: Bearer ***)' },
      {
        kind: 'error',
        status: 422,
        message: 'Validation Failed for ***: pull_request_review_thread.line could not be resolved'
      },
      { kind: 'error', status: 502, message: 'GitHub request failed (HTTP 502)' },
      { kind: 'error', status: 200, message: 'Could not resolve ***' },
      { kind: 'error', status: 403, message: 'Resource not accessible by integration' },
      'not-signed-in',
      { kind: 'not-signed-in' }
    ])
    expect(JSON.stringify(results)).not.toContain(TOKEN)
  })
})
