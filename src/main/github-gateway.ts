import { execFile } from 'node:child_process'
import { fetchWithTimeout } from './ado-gateway'

/**
 * The app's one way to reach GitHub (F5; issue #50 extends it). The token
 * comes from `gh auth token` and nothing else, and lives in this object's
 * memory only: no method returns it, no message carries it, nothing logs it
 * (FPRG-01). Every method returns a result and never throws.
 */

const API_ROOT = 'https://api.github.com'
const API_VERSION = '2022-11-28'

/** Bound each request, as the Azure DevOps clients do, so a hung connection cannot hold a view. */
const GITHUB_FETCH_TIMEOUT_MS = 10_000
/** Bound `gh auth token`; a CLI that hangs reads as not signed in. */
const GH_TIMEOUT_MS = 10_000
/** When GitHub refuses with neither a reset time nor a retry-after, wait this long. */
const FALLBACK_RATE_LIMIT_MS = 60_000

/** Starts `gh` with these arguments; injected so the exit paths are unit-tested without a CLI. */
export type GhRunner = (args: string[]) => Promise<{ stdout: string }>

export interface GitHubGatewayDeps {
  runner?: GhRunner
  fetchFn?: typeof fetch
  /** Epoch milliseconds; injected for the retry-after arithmetic. */
  now?: () => number
}

/** What `gh` reports about itself (FPRG-03, 04). */
export type GhCliState = 'ok' | 'not-installed' | 'not-signed-in'

/** One request's outcome. `status` is null when no response arrived. */
export type GhResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not-installed' }
  | { kind: 'not-signed-in' }
  | { kind: 'rate-limited'; resetAt: number }
  | { kind: 'error'; status: number | null; message: string }

export type GhMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

/**
 * The real runner (AD-059): `execFile` with no shell — `gh` is a native
 * executable, so no shim needs one — a hidden window, a timeout, and stdin
 * ended at once so nothing `gh` starts can wait on keyboard input.
 */
export const execGh: GhRunner = (args) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      'gh',
      args,
      { shell: false, windowsHide: true, timeout: GH_TIMEOUT_MS },
      (err, stdout) => (err ? reject(err) : resolve({ stdout: String(stdout) }))
    )
    child.stdin?.end()
  })

export class GitHubGateway {
  private readonly runner: GhRunner
  private readonly fetchFn: typeof fetch
  private readonly now: () => number
  private token: string | null = null

  constructor(deps: GitHubGatewayDeps = {}) {
    this.runner = deps.runner ?? execGh
    this.fetchFn = deps.fetchFn ?? fetch
    this.now = deps.now ?? Date.now
  }

  /**
   * Asks `gh` afresh — the chip re-checks on focus (FPRG-05) — and keeps the
   * token it prints. `ENOENT` is not installed; any other failure, an empty
   * answer included, is not signed in.
   */
  async ghStatus(): Promise<GhCliState> {
    try {
      const { stdout } = await this.runner(['auth', 'token'])
      const token = stdout.trim()
      this.token = token === '' ? null : token
      return this.token ? 'ok' : 'not-signed-in'
    } catch (err) {
      this.token = null
      return (err as { code?: unknown } | null)?.code === 'ENOENT'
        ? 'not-installed'
        : 'not-signed-in'
    }
  }

  /** One REST call to `api.github.com{path}`; `value` is the parsed body, null when empty. */
  async rest<T>(method: GhMethod, path: string, body?: unknown): Promise<GhResult<T>> {
    const res = await this.send(method, path, body)
    if (res.kind !== 'ok') return res
    const parsed = await readJson(res.value)
    if (!parsed.ok) return this.error(res.value.status, parsed.message)
    return { kind: 'ok', value: parsed.value as T }
  }

  /**
   * One GraphQL call. A `RATE_LIMITED` error is the rate limit (FPRG-26); any
   * other error is GitHub's first message; otherwise `value` is `data`.
   */
  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<GhResult<T>> {
    const res = await this.send('POST', '/graphql', { query, variables })
    if (res.kind !== 'ok') return res
    const parsed = await readJson(res.value)
    if (!parsed.ok) return this.error(res.value.status, parsed.message)
    const body = parsed.value as {
      data?: unknown
      errors?: { type?: unknown; message?: unknown }[]
    }
    const errors = Array.isArray(body?.errors) ? body.errors : []
    if (errors.some((e) => e?.type === 'RATE_LIMITED')) {
      return { kind: 'rate-limited', resetAt: this.resetAt(res.value.headers) }
    }
    if (errors.length > 0) {
      const message = errors.map((e) => e?.message).find((m) => typeof m === 'string')
      return this.error(res.value.status, message ?? 'GitHub GraphQL request failed')
    }
    return { kind: 'ok', value: body.data as T }
  }

  /** The token, from memory or from `gh` when there is none yet. */
  private async ensureToken(): Promise<
    { kind: 'ok'; token: string } | { kind: 'not-installed' } | { kind: 'not-signed-in' }
  > {
    if (this.token) return { kind: 'ok', token: this.token }
    const state = await this.ghStatus()
    if (state !== 'ok' || !this.token) {
      return { kind: state === 'not-installed' ? 'not-installed' : 'not-signed-in' }
    }
    return { kind: 'ok', token: this.token }
  }

  /** The request itself; a successful response comes back unread, every refusal as a result. */
  private async send(method: GhMethod, path: string, body: unknown): Promise<GhResult<Response>> {
    const token = await this.ensureToken()
    if (token.kind !== 'ok') return token
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    let res: Response
    try {
      res = await fetchWithTimeout(
        this.fetchFn,
        `${API_ROOT}${path}`,
        { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
        GITHUB_FETCH_TIMEOUT_MS
      )
    } catch (err) {
      return this.error(null, messageOf(err))
    }
    if (res.status === 401) {
      this.token = null
      return { kind: 'not-signed-in' }
    }
    if (
      res.status === 429 ||
      (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')
    ) {
      return { kind: 'rate-limited', resetAt: this.resetAt(res.headers) }
    }
    if (!res.ok) return this.error(res.status, await failureMessage(res))
    return { kind: 'ok', value: res }
  }

  /** `x-ratelimit-reset` (epoch seconds), else `retry-after` (seconds from now), else a minute. */
  private resetAt(headers: Headers): number {
    const reset = Number(headers.get('x-ratelimit-reset'))
    if (Number.isFinite(reset) && reset > 0) return reset * 1000
    const retryAfter = Number(headers.get('retry-after'))
    if (Number.isFinite(retryAfter) && retryAfter > 0) return this.now() + retryAfter * 1000
    return this.now() + FALLBACK_RATE_LIMIT_MS
  }

  /** Every message leaves through here, with the token masked wherever something echoed it. */
  private error(status: number | null, message: string): GhResult<never> {
    const masked = this.token ? message.split(this.token).join('***') : message
    return { kind: 'error', status, message: masked }
  }
}

async function readJson(
  res: Response
): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  try {
    const text = await res.text()
    return { ok: true, value: text === '' ? null : JSON.parse(text) }
  } catch (err) {
    return { ok: false, message: messageOf(err) }
  }
}

/** GitHub's own message and its validation details, or the HTTP status when it gave none. */
async function failureMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown; errors?: unknown }
    if (typeof body.message === 'string' && body.message !== '') {
      const details = (Array.isArray(body.errors) ? body.errors : [])
        .map((e: unknown) => {
          if (typeof e === 'string') return e
          const { field, message, code } = (e ?? {}) as Record<string, unknown>
          return [field, message ?? code].filter((part) => typeof part === 'string').join(' ')
        })
        .filter((detail) => detail !== '')
      return details.length > 0 ? `${body.message}: ${details.join('; ')}` : body.message
    }
  } catch {
    // Not JSON: the status is all there is to say.
  }
  return `GitHub request failed (HTTP ${res.status})`
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message.split('\n')[0] : String(err)
}
