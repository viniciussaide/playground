import type {
  DiffSide,
  DiffSides,
  GitHubPrFile,
  PrDetailResult,
  PrRef,
  PrSearch,
  PrStatus,
  PrSummary,
  RemoteRef
} from '../shared/files'
import { parsePatchHunks } from '../shared/pr-diff-rules'
import type { LaunchResult } from '../shared/shortcuts'
import { openPrLink } from './ado-pr'
import { lineEndingChanges } from './file-diff'
import { isBinary, MAX_VIEW_BYTES } from './file-reader'
import { git, type GitRunner } from './git'
import type { GhResult, GitHubGateway } from './github-gateway'
import {
  githubRemotes,
  reviewerStates,
  timeline,
  toThreadViews,
  trackedGitHubRemote,
  type GqlIssueComment,
  type GqlReview,
  type GqlReviewComment,
  type GqlReviewRequest,
  type GqlReviewThread
} from './github-pr-model'
import { locateBranch } from './pr-locate'
import { githubCompareUrl, githubPrUrl } from './remote-url'

/**
 * The app's GitHub pull-request client (F5). Every request to GitHub for pull
 * requests goes through here, built from intent the renderer sends — a
 * `PrRef`, a path — never from a URL it holds (FPRG-24, as FPRA-32).
 *
 * Reads send GETs and GraphQL queries only, never a mutation. Every method
 * returns a result and never throws: a missing or signed-out `gh` is the
 * "run `gh auth login`" result (FPRG-04), a rate limit carries its reset time
 * (FPRG-26), anything else an error the view can show.
 */

/** A GitHub repository, as `parseRemote` reduced its remote. */
export type GitHubTarget = Extract<RemoteRef, { provider: 'github' }>

/** What the client needs from the outside, injected so every request is unit-testable. */
export interface GitHubPrDeps {
  /** The one gateway, which holds the `gh` token; a test builds it over a fake `fetch`. */
  gateway: Pick<GitHubGateway, 'rest' | 'graphql'>
  /** The paced `git()`; a test stands in for it. */
  run?: GitRunner
}

/** One read's outcome, in the terms `PrSearch` and `PrDetailResult` share. */
export type GhRead<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'auth' }
  | { kind: 'rate-limited'; resetAt: number }
  | { kind: 'error'; message: string }

/** GitHub lists at most this many files of a pull request (edge case). */
const FILES_CEILING = 3000
const PAGE_SIZE = 100

const NOT_GITHUB = 'This pull request is not on GitHub.'

/** A GraphQL connection's page. */
interface Connection<T> {
  nodes: T[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

type ThreadNode = Omit<GqlReviewThread, 'comments'> & { comments: Connection<GqlReviewComment> }

interface GqlPullRequest {
  number: number
  title: string
  body: string
  isDraft: boolean
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  createdAt: string
  author: { login: string } | null
  baseRefName: string
  headRefName: string
  baseRefOid: string
  headRefOid: string
  headRepository: { name: string; owner: { login: string } } | null
  latestReviews: Connection<GqlReview>
  reviews: Connection<GqlReview>
  reviewRequests: Connection<GqlReviewRequest>
  comments: Connection<GqlIssueComment>
  reviewThreads: Connection<ThreadNode>
}

/** What one GitHub REST pull request carries that the client reads. */
interface RestPullRequest {
  number: number
  title: string
  draft?: boolean
  base: { ref: string; sha: string }
  head: { sha: string; repo: { name: string; owner: { login: string } } | null }
}

interface RestFile {
  filename: string
  status: string
  previous_filename?: string
  /** Absent — not null — for a binary or large file (S7). */
  patch?: string
}

const COMMENT_FIELDS = 'databaseId author { login } body createdAt'
const PAGE_INFO = 'pageInfo { hasNextPage endCursor }'

/** Each paged connection of a pull request, with the fields read from its nodes. */
const CONNECTIONS = {
  latestReviews: 'author { login } state body submittedAt',
  reviews: 'author { login } state body submittedAt',
  reviewRequests: 'requestedReviewer { __typename ... on Actor { login } ... on Team { name } }',
  comments: 'author { login } body createdAt',
  reviewThreads:
    'id path line startLine originalLine originalStartLine diffSide subjectType ' +
    'isResolved isOutdated viewerCanReply viewerCanResolve viewerCanUnresolve ' +
    `comments(first: ${PAGE_SIZE}) { nodes { ${COMMENT_FIELDS} } ${PAGE_INFO} }`
} as const

type ConnectionName = keyof typeof CONNECTIONS

/** The node type of one connection of a pull request. */
type NodeOf<K extends ConnectionName> = GqlPullRequest[K] extends Connection<infer T> ? T : never

const CONNECTION_NAMES = Object.keys(CONNECTIONS) as ConnectionName[]

function connectionPage(name: ConnectionName, after: boolean): string {
  const args = after ? `first: ${PAGE_SIZE}, after: $after` : `first: ${PAGE_SIZE}`
  return `${name}(${args}) { nodes { ${CONNECTIONS[name]} } ${PAGE_INFO} }`
}

const PR_FIELDS =
  'number title body isDraft state createdAt author { login } ' +
  'baseRefName headRefName baseRefOid headRefOid headRepository { name owner { login } }'

/** The pull request and the first page of every connection, in one query. */
const PR_QUERY =
  'query($owner: String!, $name: String!, $number: Int!) { ' +
  'repository(owner: $owner, name: $name) { pullRequest(number: $number) { ' +
  `${PR_FIELDS} ${CONNECTION_NAMES.map((name) => connectionPage(name, false)).join(' ')} } } }`

/** One further page of one connection. */
function connectionQuery(name: ConnectionName): string {
  return (
    'query($owner: String!, $name: String!, $number: Int!, $after: String!) { ' +
    'repository(owner: $owner, name: $name) { pullRequest(number: $number) { ' +
    `${connectionPage(name, true)} } } }`
  )
}

/** One further page of one thread's comments. */
const THREAD_COMMENTS_QUERY =
  'query($id: ID!, $after: String!) { node(id: $id) { ... on PullRequestReviewThread { ' +
  `comments(first: ${PAGE_SIZE}, after: $after) { nodes { ${COMMENT_FIELDS} } ${PAGE_INFO} } } } }`

export class GitHubPrClient {
  private readonly gateway: GitHubPrDeps['gateway']
  private readonly run: GitRunner

  constructor(deps: GitHubPrDeps) {
    this.gateway = deps.gateway
    this.run = deps.run ?? git
  }

  /**
   * The open pull requests whose head is the worktree's branch (FPRG-06, 07).
   * The head's owner is the owner of the GitHub remote the branch tracks, and
   * every GitHub remote is searched as a target, so a fork's branch is found
   * on the upstream too. A branch that tracks no GitHub remote is not pushed
   * to GitHub: nothing is asked of GitHub, and no Create PR is offered.
   */
  async findPrs(worktreePath: string): Promise<PrSearch> {
    const located = await locateBranch(this.run, worktreePath)
    if (located.kind !== 'ok') return located
    const remotes = githubRemotes(located.remotes)
    if (remotes.length === 0) return { kind: 'no-remote' }
    const source = trackedGitHubRemote(located.remotes, located.tracked)
    if (source === null) return { kind: 'none', createUrlAvailable: false }

    const prs: PrSummary[] = []
    for (const target of uniqueTargets(remotes.map((remote) => remote.target))) {
      const query = new URLSearchParams({
        state: 'open',
        head: `${source.target.owner}:${located.branch}`,
        per_page: String(PAGE_SIZE)
      })
      const found = await this.get<RestPullRequest[]>(`${repoPath(target)}/pulls?${query}`)
      if (found.kind !== 'ok') return found
      for (const pr of found.value) {
        prs.push({
          target,
          id: pr.number,
          title: pr.title,
          targetBranch: pr.base.ref,
          isDraft: pr.draft === true
        })
      }
    }
    return prs.length > 0 ? { kind: 'found', prs } : { kind: 'none', createUrlAvailable: true }
  }

  /**
   * Where Create PR lands (FPRG-08): the source's parent when the source is a
   * fork — the fork flow's pull request goes to the upstream — else the source
   * itself, with that repository's default branch.
   */
  async createTarget(
    source: GitHubTarget
  ): Promise<GhRead<{ target: GitHubTarget; defaultBranch: string }>> {
    const repo = await this.get<{
      default_branch: string
      fork: boolean
      parent?: { name: string; default_branch: string; owner: { login: string } }
    }>(repoPath(source))
    if (repo.kind !== 'ok') return repo
    const { parent } = repo.value
    if (repo.value.fork && parent) {
      return {
        kind: 'ok',
        value: {
          target: { provider: 'github', owner: parent.owner.login, repo: parent.name },
          defaultBranch: parent.default_branch
        }
      }
    }
    return { kind: 'ok', value: { target: source, defaultBranch: repo.value.default_branch } }
  }

  /**
   * One pull request in full (FPRG-09..14): one GraphQL query for the PR and
   * the first page of each connection, then every connection — and every
   * thread's comments — paged until GitHub says there is no next page, so
   * nothing is cut at 100 (lesson L-128). The files come from REST, which
   * alone carries each file's patch.
   */
  async getPr(pr: PrRef): Promise<PrDetailResult> {
    const target = githubTarget(pr)
    if (target === null) return notGitHub()
    const vars = { owner: target.owner, name: target.repo, number: pr.id }
    const first = await this.query<{ repository: { pullRequest: GqlPullRequest | null } | null }>(
      PR_QUERY,
      vars
    )
    if (first.kind !== 'ok') return first
    const body = first.value.repository?.pullRequest
    if (!body) {
      return { kind: 'error', message: `Pull request #${pr.id} was not found on GitHub.` }
    }

    const pageOf = <K extends ConnectionName>(name: K): Promise<GhRead<NodeOf<K>[]>> =>
      this.pageAll(body[name] as Connection<NodeOf<K>>, async (after) => {
        const next = await this.query<{
          repository: { pullRequest: Record<K, Connection<NodeOf<K>>> }
        }>(connectionQuery(name), { ...vars, after })
        if (next.kind !== 'ok') return next
        return { kind: 'ok', value: next.value.repository.pullRequest[name] }
      })
    const latestReviews = await pageOf('latestReviews')
    if (latestReviews.kind !== 'ok') return latestReviews
    const reviews = await pageOf('reviews')
    if (reviews.kind !== 'ok') return reviews
    const requests = await pageOf('reviewRequests')
    if (requests.kind !== 'ok') return requests
    const comments = await pageOf('comments')
    if (comments.kind !== 'ok') return comments
    const threadNodes = await pageOf('reviewThreads')
    if (threadNodes.kind !== 'ok') return threadNodes

    const threads: GqlReviewThread[] = []
    for (const thread of threadNodes.value) {
      const threadComments = await this.pageAll(thread.comments, async (after) => {
        const next = await this.query<{
          node: { comments: Connection<GqlReviewComment> } | null
        }>(THREAD_COMMENTS_QUERY, { id: thread.id, after })
        if (next.kind !== 'ok') return next
        if (!next.value.node) return { kind: 'error', message: 'A review thread disappeared.' }
        return { kind: 'ok', value: next.value.node.comments }
      })
      if (threadComments.kind !== 'ok') return threadComments
      threads.push({ ...thread, comments: threadComments.value })
    }

    const files = await this.files(pr)
    if (files.kind !== 'ok') return files

    const headRepo = body.headRepository
    return {
      kind: 'ok',
      detail: {
        target,
        id: body.number,
        title: body.title,
        targetBranch: body.baseRefName,
        isDraft: body.isDraft,
        status: prStatusOf(body.state),
        author: body.author?.login ?? 'ghost',
        description: body.body,
        createdAt: Date.parse(body.createdAt),
        sourceBranch: body.headRefName,
        reviewers: reviewerStates(latestReviews.value, requests.value),
        revision: body.headRefOid,
        github: {
          headSha: body.headRefOid,
          baseSha: body.baseRefOid,
          headRepo: headRepo ? { owner: headRepo.owner.login, repo: headRepo.name } : null,
          filesIncomplete: files.value.incomplete
        },
        files: files.value.files,
        threads: toThreadViews(threads),
        timeline: timeline(reviews.value, comments.value)
      }
    }
  }

  /**
   * Every changed file, page by page (FPRG-11), each with its patch parsed
   * into hunks — null when GitHub sent no patch, as for a binary (S7, FPRG-22).
   * GitHub lists at most 3000 files; reaching that many says the list may be
   * incomplete (edge case).
   */
  async files(pr: PrRef): Promise<GhRead<{ files: GitHubPrFile[]; incomplete: boolean }>> {
    const target = githubTarget(pr)
    if (target === null) return notGitHub()
    const files: GitHubPrFile[] = []
    for (let page = 1; files.length < FILES_CEILING; page++) {
      const read = await this.get<RestFile[]>(
        `${repoPath(target)}/pulls/${pr.id}/files?per_page=${PAGE_SIZE}&page=${page}`
      )
      if (read.kind !== 'ok') return read
      files.push(...read.value.map(fileOf))
      if (read.value.length < PAGE_SIZE) break
    }
    return { kind: 'ok', value: { files, incomplete: files.length >= FILES_CEILING } }
  }

  /**
   * The merge base the PR diff's base side is read at (FPRG-12): compared in
   * the base repository with the head's sha, which resolves even for a commit
   * that exists only in the fork (S6).
   */
  async mergeBase(target: GitHubTarget, baseSha: string, headSha: string): Promise<GhRead<string>> {
    const read = await this.get<{ merge_base_commit: { sha: string } }>(
      `${repoPath(target)}/compare/${encodeURIComponent(baseSha)}...${encodeURIComponent(headSha)}`
    )
    if (read.kind !== 'ok') return read
    return { kind: 'ok', value: read.value.merge_base_commit.sha }
  }

  /**
   * Both sides of one PR file (FPRG-12): the base side at the merge base from
   * the base repository; the head side at the head commit from the head
   * repository — the fork — then from the base repository at that same
   * commit when the fork is gone or refuses (S6). The head side is
   * unavailable only when both reads fail (edge case). A rename reads its base
   * side from `oldPath`.
   */
  async fileSides(pr: PrRef, path: string, oldPath?: string): Promise<DiffSides> {
    const target = githubTarget(pr)
    if (target === null) return bothSides({ kind: 'error', message: NOT_GITHUB })
    const read = await this.get<RestPullRequest>(`${repoPath(target)}/pulls/${pr.id}`)
    if (read.kind !== 'ok') return bothSides({ kind: 'error', message: failureText(read) })
    const { base, head } = read.value

    const mergeBase = await this.mergeBase(target, base.sha, head.sha)
    const original: DiffSide =
      mergeBase.kind === 'ok'
        ? await this.fileSide(target, oldPath ?? path, mergeBase.value)
        : { kind: 'error', message: failureText(mergeBase) }

    const headRepo: GitHubTarget | null = head.repo
      ? { provider: 'github', owner: head.repo.owner.login, repo: head.repo.name }
      : null
    let modified: DiffSide | null = headRepo ? await this.fileSide(headRepo, path, head.sha) : null
    if (modified === null || modified.kind === 'error') {
      const fromBase = await this.fileSide(target, path, head.sha)
      modified =
        fromBase.kind === 'error'
          ? { kind: 'error', message: `The head repository is unavailable: ${fromBase.message}` }
          : fromBase
    }

    if (original.kind !== 'text' || modified.kind !== 'text') {
      return { original, modified, eolChanged: [] }
    }
    const eol = lineEndingChanges(original.text, modified.text)
    return { original, modified, eolChanged: eol.lines, eolFrom: eol.from, eolTo: eol.to }
  }

  /**
   * One side of a file at a commit, from one repository (S7). The size is read
   * first: above F1's 1 MB cap the content is never decoded, and a binary is
   * never turned into text. The base64 content arrives wrapped with newlines,
   * which are stripped before decoding. A path that is not at that commit is
   * a 404 and an absent side; a folder answers with a list and is refused.
   */
  async fileSide(repo: GitHubTarget, path: string, ref: string): Promise<DiffSide> {
    const segments = path.split('/').map(encodeURIComponent).join('/')
    const read = await this.gateway.rest<unknown>(
      'GET',
      `${repoPath(repo)}/contents/${segments}?ref=${encodeURIComponent(ref)}`
    )
    if (read.kind === 'error' && read.status === 404) return { kind: 'absent' }
    const body = toRead(read)
    if (body.kind !== 'ok') return { kind: 'error', message: failureText(body) }
    if (Array.isArray(body.value)) return { kind: 'error', message: `${path} is a folder.` }
    const file = body.value as { type?: string; size: number; content?: string }
    if (file.type !== 'file') return { kind: 'error', message: `${path} is not a file.` }
    const size = file.size
    if (size > MAX_VIEW_BYTES) return { kind: 'too-large', size }
    const bytes = Buffer.from((file.content ?? '').replace(/\s/g, ''), 'base64')
    if (isBinary(bytes)) return { kind: 'binary', size }
    return { kind: 'text', text: bytes.toString('utf8'), size }
  }

  /**
   * Opens the pull request's page, or GitHub's compare page for the branch,
   * in the browser (FPRG-08). The renderer names the PR or asks for the create
   * page; the address is built here and opened only if it is https (AD-044).
   */
  async openPage(
    worktreePath: string,
    req: { pr: PrRef } | { create: true },
    open: (url: string) => Promise<unknown>
  ): Promise<LaunchResult> {
    if ('pr' in req) {
      const target = githubTarget(req.pr)
      if (target === null) return { ok: false, error: NOT_GITHUB }
      return openPrLink(githubPrUrl(target, req.pr.id), open)
    }
    const located = await locateBranch(this.run, worktreePath)
    const source =
      located.kind === 'ok' ? trackedGitHubRemote(located.remotes, located.tracked) : null
    if (located.kind !== 'ok' || source === null) {
      return { ok: false, error: 'This branch is not pushed to GitHub.' }
    }
    const created = await this.createTarget(source.target)
    if (created.kind !== 'ok') return { ok: false, error: failureText(created) }
    const { target, defaultBranch } = created.value
    return openPrLink(
      githubCompareUrl(target, defaultBranch, source.target.owner, located.branch),
      open
    )
  }

  /** Every node of a connection, following `endCursor` while GitHub says there is more. */
  private async pageAll<T>(
    first: Connection<T>,
    next: (after: string) => Promise<GhRead<Connection<T>>>
  ): Promise<GhRead<T[]>> {
    const nodes = [...first.nodes]
    let page = first
    while (page.pageInfo.hasNextPage && page.pageInfo.endCursor) {
      const read = await next(page.pageInfo.endCursor)
      if (read.kind !== 'ok') return read
      page = read.value
      nodes.push(...page.nodes)
    }
    return { kind: 'ok', value: nodes }
  }

  /** One GraphQL query — reads only ever send a query, never a mutation. */
  private async query<T>(query: string, variables: Record<string, unknown>): Promise<GhRead<T>> {
    return toRead(await this.gateway.graphql<T>(query, variables))
  }

  /** One REST GET; reads never send another method (FPRG-24). */
  private async get<T>(path: string): Promise<GhRead<T>> {
    return toRead(await this.gateway.rest<T>('GET', path))
  }
}

/** The gateway's result in the read terms the views share; no `gh` and no sign-in differ only in their text. */
function toRead<T>(result: GhResult<T>): GhRead<T> {
  switch (result.kind) {
    case 'ok':
    case 'rate-limited':
      return result
    case 'not-signed-in':
      return { kind: 'auth' }
    case 'not-installed':
      return { kind: 'error', message: 'The GitHub CLI (gh) is not installed.' }
    case 'error':
      return { kind: 'error', message: result.message }
  }
}

function failureText(read: Exclude<GhRead<unknown>, { kind: 'ok' }>): string {
  switch (read.kind) {
    case 'auth':
      return 'GitHub sign-in failed — run `gh auth login`.'
    case 'rate-limited':
      return `GitHub refuses requests until ${new Date(read.resetAt).toISOString()}.`
    case 'error':
      return read.message
  }
}

/**
 * The GitHub repository a pull request names. Another provider's pull request
 * is the caller's mistake: it reads as an error and nothing is sent.
 */
function githubTarget(pr: PrRef): GitHubTarget | null {
  return pr.target.provider === 'github' ? pr.target : null
}

function notGitHub(): { kind: 'error'; message: string } {
  return { kind: 'error', message: NOT_GITHUB }
}

function bothSides(side: DiffSide): DiffSides {
  return { original: side, modified: side, eolChanged: [] }
}

/** The REST path of one repository, each segment encoded. */
function repoPath(target: GitHubTarget): string {
  return `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`
}

/** Two remotes naming the same repository are searched once. */
function uniqueTargets(targets: GitHubTarget[]): GitHubTarget[] {
  const seen = new Map<string, GitHubTarget>()
  for (const target of targets) {
    const key = `${target.owner}/${target.repo}`.toLowerCase()
    if (!seen.has(key)) seen.set(key, target)
  }
  return [...seen.values()]
}

function fileOf(file: RestFile): GitHubPrFile {
  const out: GitHubPrFile = {
    path: file.filename,
    status: fileStatusOf(file.status),
    hunks: typeof file.patch === 'string' ? parsePatchHunks(file.patch) : null
  }
  if (file.previous_filename !== undefined) out.oldPath = file.previous_filename
  return out
}

function fileStatusOf(status: string): GitHubPrFile['status'] {
  switch (status) {
    case 'added':
    case 'copied':
      return 'added'
    case 'removed':
      return 'deleted'
    case 'renamed':
      return 'renamed'
    default:
      return 'modified'
  }
}

function prStatusOf(state: GqlPullRequest['state']): PrStatus {
  if (state === 'MERGED') return 'completed'
  if (state === 'CLOSED') return 'abandoned'
  return 'active'
}
