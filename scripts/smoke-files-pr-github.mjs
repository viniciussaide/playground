/* CDP smoke for the Files Pull request mode on GitHub (FPRG-01..26), against
 * live GitHub pull requests.
 *
 *   SMOKE_PR_WORKTREE=<a worktree whose branch has an open GitHub PR> \
 *     node scripts/smoke-files-pr-github.mjs
 *
 *   SMOKE_GH_FORK=<owner>/<repo of your fork of this repository> \
 *     node scripts/smoke-files-pr-github.mjs --allow-writes
 *
 * Nothing about either pull request lives in this file: no owner, repository,
 * branch, number or path. The output names checks and counts, never content.
 *
 * The script launches its own dev app and tears it down:
 *   - a throwaway --user-data-dir under the OS temp folder, holding one
 *     workspace: the folder that contains the repository under test, which the
 *     app scans one level deep as it scans any workspace. Nothing of the
 *     owner's real configuration is in scope;
 *   - CDP on SMOKE_PORT (default 9333); a port that already answers is refused;
 *   - every process it started is killed, and the temp folder removed, in
 *     `finally`. No agent session is ever started.
 *
 * Read-only by default: nothing reaches GitHub but the app's own reads and
 * this script's GETs (GraphQL queries included, never a mutation). It reads
 * the pull request the app finds for SMOKE_PR_WORKTREE's branch — a fork's
 * branch with its PR open on the upstream is the case this is for — and
 * launches the app twice more, once with `gh` signed out (an empty
 * GH_CONFIG_DIR and a GH_HOST it holds no token for) and once with `gh` off
 * the PATH, to read the chip's states.
 *
 * --allow-writes writes to the fork SMOKE_GH_FORK names and nowhere else. It
 * refuses, before any push, a repository that is not a fork; and, before any
 * comment, a pull request whose base is the fork's upstream, whose base or
 * head is not the fork, or that is not a draft. In a throwaway local
 * repository outside this one, it pushes orphan branches `smoke/f5-*` (no
 * workflow in them, so no CI runs), opens draft pull requests between them in
 * the fork, seeds what the app must read (threads, one resolved, one made
 * outdated by a second push, a general comment), then drives the app's own UI:
 * a reply, Resolve and Reopen, anchored comments and a general one. Every
 * comment carries a random run marker. In `finally` the script deletes every
 * comment carrying the marker, closes the pull requests, deletes the branches,
 * and reads each back. It never touches a pull request or comment it did not
 * create.
 *
 * SMOKE_ONLY=chip | overview | diff | writes runs one section alone, from a
 * fresh launch, for iterating on it; the whole smoke runs once before the PR.
 * SMOKE_KEEP=1 leaves the app up after the checks.
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.SMOKE_PORT) || 9333
const ONLY = process.env.SMOKE_ONLY ?? null
const WRITES = process.argv.includes('--allow-writes')
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MARK = `smoke-${randomBytes(4).toString('hex')}`
const STARTED = new Date().toISOString()
const GH_API = 'https://api.github.com'

if (ONLY !== null && !['chip', 'overview', 'diff', 'writes'].includes(ONLY)) {
  console.error('SMOKE_ONLY must be chip, overview, diff or writes.')
  process.exit(2)
}
if (ONLY === 'writes' && !WRITES) {
  console.error('SMOKE_ONLY=writes needs --allow-writes.')
  process.exit(2)
}
if (ONLY === 'chip' && WRITES) {
  console.error('SMOKE_ONLY=chip is read-only; drop --allow-writes.')
  process.exit(2)
}
const runs = (section) => ONLY === null || ONLY === section

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const J = JSON.stringify
const lf = (s) => String(s ?? '').replace(/\r\n/g, '\n')

/* ---------------------------------------------------------- coordinates -- */

const FORK = process.env.SMOKE_GH_FORK ?? null
if (WRITES && (!FORK || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(FORK))) {
  console.error(
    'Set SMOKE_GH_FORK to <owner>/<repo> of your fork of this repository; the writes go there and nowhere else.'
  )
  process.exit(2)
}
const WT_INPUT = WRITES ? null : (process.env.SMOKE_PR_WORKTREE ?? null)
if (!WRITES && !WT_INPUT) {
  console.error('Set SMOKE_PR_WORKTREE to a worktree whose branch has an open GitHub pull request.')
  process.exit(2)
}

const git = (args, cwd, env = undefined) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env }
  }).trim()

let WT = null // the worktree the app is asked about
let BRANCH = null
let REPO_ROOT = null
if (!WRITES) {
  try {
    WT = git(['rev-parse', '--show-toplevel'], WT_INPUT)
    BRANCH = git(['branch', '--show-current'], WT)
    REPO_ROOT = dirname(git(['rev-parse', '--path-format=absolute', '--git-common-dir'], WT))
  } catch {
    console.error('SMOKE_PR_WORKTREE is not a git worktree.')
    process.exit(2)
  }
  if (!BRANCH) {
    console.error('SMOKE_PR_WORKTREE has a detached HEAD; it must be on the PR branch.')
    process.exit(2)
  }
}

/** owner / repo of a github.com remote URL, or null. */
function githubRepoOf(url) {
  const m = String(url).match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i)
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null
}

/* ---------------------------------------------------------------- REST -- */

let token = null
function ghToken() {
  if (token) return token
  // The same command the app runs (GitHubGateway); gh is a native executable.
  token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', windowsHide: true }).trim()
  return token
}

/** One GitHub REST call; the error names the status and GitHub's message, never the path. */
async function gh(method, path, body) {
  const res = await fetch(`${GH_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ghToken()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : J(body)
  })
  if (!res.ok) {
    let why = ''
    try {
      why = (await res.json()).message ?? ''
    } catch {
      /* no body */
    }
    const err = new Error(`GitHub ${method} answered ${res.status}${why ? `: ${why}` : ''}`)
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

/** Every item of a paged REST list. */
async function ghAll(path) {
  const out = []
  for (let page = 1; page < 50; page++) {
    const items = await gh(
      'GET',
      `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`
    )
    out.push(...items)
    if (items.length < 100) break
  }
  return out
}

/** One GraphQL call. Read-only queries, plus the one resolve the sandbox seeds. */
async function gql(query, variables) {
  const body = await gh('POST', '/graphql', { query, variables })
  if (body.errors?.length) throw new Error(`GraphQL: ${body.errors[0].message}`)
  return body.data
}

/** Review threads of a pull request, as GitHub holds them: the script's own reading. */
async function threadsOf(owner, name, number) {
  const data = await gql(
    `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) {
      pullRequest(number: $number) { reviewThreads(first: 100) { nodes {
        id path line startLine originalLine subjectType isResolved isOutdated
        comments(first: 100) { nodes { databaseId body } } } } } } }`,
    { owner, name, number }
  )
  return data.repository.pullRequest.reviewThreads.nodes
}

/* ---------------------------------------------------------- the guard -- */

/**
 * Why --allow-writes must not write, or null when it may (T27). The
 * repository named must be a fork, as GitHub reports it; a pull request
 * written to must be a draft whose base and head are both that fork — never
 * a pull request on the fork's upstream. The upstream is the fork's parent,
 * read from GitHub, so no owner is named here.
 */
function writeRefusal(fork, repo, pr) {
  const name = (s) => String(s ?? '').toLowerCase()
  if (!repo || repo.fork !== true || !repo.parent) return 'the repository named is not a fork'
  if (name(repo.full_name) !== name(fork)) return 'the repository read is not the one named'
  if (pr === null) return null
  const base = name(pr.base?.repo?.full_name)
  if (base === name(repo.parent.full_name)) return 'the pull request is based on the upstream'
  if (base !== name(repo.full_name)) return 'the pull request is not based on the fork'
  if (name(pr.head?.repo?.full_name) !== name(repo.full_name)) {
    return 'the pull request head is not in the fork'
  }
  if (pr.draft !== true) return 'the pull request is not a draft'
  return null
}

/* ------------------------------------------------------------ sandbox -- */

const FILE = 'smoke.txt'
const BINARY = 'smoke.bin'
// Lines 5 and 30 change, so the hunks are 2–8 and 27–33 and the diff folds
// 9–26 and 34–40. Line 8 is empty and line 33 is not: a thread sits on each,
// the last line before a folded region.
const BASE_LINES = Array.from({ length: 40 }, (_, i) =>
  i === 7 ? '' : `line ${String(i + 1).padStart(2, '0')}: fictitious text for the smoke`
)
const HEAD1_LINES = BASE_LINES.map((line, i) =>
  i === 4
    ? 'line 05: changed by the head commit'
    : i === 29
      ? 'line 30: changed by the head commit'
      : line
)
const HEAD2_LINES = HEAD1_LINES.map((line, i) =>
  i === 29 ? 'line 30: changed again by a second commit' : line
)
/** Pushed while the app shows the pull request, for the new-changes banner (FPRG-25). */
const HEAD3_LINES = HEAD2_LINES.map((line, i) =>
  i === 34 ? 'line 35: changed by a third commit' : line
)
const text = (lines) => `${lines.join('\n')}\n`

/** What --allow-writes created, recorded as soon as each exists, for `finally`. */
let sandbox = null

class Refusal extends Error {}

/**
 * Builds the write mode's pull requests in the fork: a local repository in
 * the temp folder whose `origin` is the fork, orphan branches pushed there,
 * two draft pull requests between them (two, so the picker shows), and the
 * threads and comments the app must read.
 */
async function buildSandbox() {
  const [owner, name] = FORK.split('/')
  const repoPath = `/repos/${owner}/${name}`
  const repo = await gh('GET', repoPath)
  const before = writeRefusal(FORK, repo, null)
  if (before) throw new Refusal(`Refusing --allow-writes: ${before}`)

  const tag = MARK.slice('smoke-'.length)
  const base = `smoke/f5-base-${tag}`
  const head = `smoke/f5-head-${tag}`
  const alt = `smoke/f5-alt-${tag}`
  sandbox = { owner, name, repoPath, repo, branches: [], prs: [], pr: null, alt: null }

  const local = join(DIR, 'ws', 'smoke-repo')
  mkdirSync(local, { recursive: true })
  git(['init', '-q', '-b', base], local)
  git(['config', 'user.name', 'Smoke'], local)
  git(['config', 'user.email', 'smoke@example.com'], local)
  git(['config', 'core.autocrlf', 'false'], local)
  writeFileSync(join(local, FILE), text(BASE_LINES))
  git(['add', FILE], local)
  git(['commit', '-q', '-m', 'Smoke base'], local)
  git(['checkout', '-q', '-b', head], local)
  writeFileSync(join(local, FILE), text(HEAD1_LINES))
  writeFileSync(join(local, BINARY), Buffer.from(Array.from({ length: 64 }, (_, i) => i)))
  git(['add', FILE, BINARY], local)
  git(['commit', '-q', '-m', 'Smoke head'], local)
  const head1 = git(['rev-parse', 'HEAD'], local)
  git(['remote', 'add', 'origin', `https://github.com/${FORK}.git`], local)

  // gh's own credential helper, so a push never waits on a sign-in window.
  const push = (...refs) =>
    git(
      [
        '-c',
        'credential.helper=',
        '-c',
        'credential.helper=!gh auth git-credential',
        'push',
        '-q',
        ...refs
      ],
      local
    )
  sandbox.branches.push(base, head)
  if (runs('overview')) sandbox.branches.push(alt)
  push(
    '-u',
    'origin',
    head,
    base,
    ...(runs('overview') ? [`refs/heads/${base}:refs/heads/${alt}`] : [])
  )

  const open = async (baseBranch) => {
    const pr = await gh('POST', `${repoPath}/pulls`, {
      title: `Smoke ${MARK}`,
      head,
      base: baseBranch,
      draft: true,
      body: 'A throwaway pull request of the Files smoke. The script closes it and deletes its branches.'
    })
    sandbox.prs.push(pr.number)
    const read = await gh('GET', `${repoPath}/pulls/${pr.number}`)
    const refusal = writeRefusal(FORK, repo, read)
    if (refusal) throw new Refusal(`Refusing --allow-writes: ${refusal}`)
    return pr.number
  }
  sandbox.pr = await open(base)
  if (runs('overview')) sandbox.alt = await open(alt)

  // Seeds, each on the first head commit. GitHub computes a new PR's diff a
  // moment after it opens, so the first anchored comment may need a retry.
  const anchored = async (line, body) => {
    for (let i = 0; ; i++) {
      try {
        return await gh('POST', `${repoPath}/pulls/${sandbox.pr}/comments`, {
          body,
          commit_id: head1,
          path: FILE,
          line,
          side: 'RIGHT'
        })
      } catch (err) {
        if (err.status !== 422 || i >= 10) throw err
        await sleep(2000)
      }
    }
  }
  const active = await anchored(
    5,
    `${MARK} seeded thread [js](javascript:alert(1)) and [web](https://example.com/acme)`
  )
  const resolved = await anchored(8, `${MARK} seeded thread to stay resolved`)
  const outdated = await anchored(30, `${MARK} seeded thread made outdated`)
  const aboveFold = await anchored(33, `${MARK} seeded thread above a folded region`)
  await gh('POST', `${repoPath}/issues/${sandbox.pr}/comments`, {
    body: `${MARK} seeded general comment`
  })

  const byRoot = (threads, id) => threads.find((t) => t.comments.nodes[0]?.databaseId === id)
  let threads = await threadsOf(owner, name, sandbox.pr)
  await gql(
    'mutation($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { id } } }',
    {
      id: byRoot(threads, resolved.id).id
    }
  )

  // A second commit changes line 30 again: its thread becomes outdated (S5).
  writeFileSync(join(local, FILE), text(HEAD2_LINES))
  git(['commit', '-q', '-a', '-m', 'Smoke head again'], local)
  const head2 = git(['rev-parse', 'HEAD'], local)
  push('origin', head)
  for (let i = 0; i < 30; i++) {
    threads = await threadsOf(owner, name, sandbox.pr)
    if (byRoot(threads, outdated.id)?.isOutdated) break
    await sleep(2000)
  }
  const thread = (comment) => {
    const t = byRoot(threads, comment.id)
    return { id: t.id, root: comment.id, isOutdated: t.isOutdated, isResolved: t.isResolved }
  }
  Object.assign(sandbox, {
    local,
    push,
    base,
    head,
    head1,
    head2,
    active: thread(active),
    resolved: thread(resolved),
    outdated: thread(outdated),
    aboveFold: thread(aboveFold)
  })
  const current = [sandbox.active, sandbox.resolved, sandbox.aboveFold]
  if (!sandbox.outdated.isOutdated || current.some((t) => t.isOutdated)) {
    throw new Error('GitHub did not mark only the line-30 thread outdated after the second push')
  }
  if (!sandbox.resolved.isResolved) throw new Error('The seeded thread to resolve is not resolved')
  WT = git(['rev-parse', '--show-toplevel'], local)
  BRANCH = head
  REPO_ROOT = WT
}

/**
 * A comment this run wrote: the marker is random per run, so nothing else
 * carries it. Matched without case, so text a broken build rewrote (a mutant
 * that upper-cases what it posts) is still found and deleted.
 */
const carriesMark = (c) => String(c.body).toLowerCase().includes(MARK)

/** Deletes what --allow-writes made, and reads each back. Null when nothing was made. */
async function cleanupSandbox() {
  if (!WRITES || sandbox === null) return null
  const { repoPath } = sandbox
  const out = {
    deleted: 0,
    left: 0,
    prs: sandbox.prs.length,
    closed: 0,
    branches: sandbox.branches.length,
    branchesLeft: 0
  }
  const ours = async (n) => ({
    review: (await ghAll(`${repoPath}/pulls/${n}/comments`)).filter(carriesMark),
    issue: (await ghAll(`${repoPath}/issues/${n}/comments`)).filter(carriesMark)
  })
  for (const n of sandbox.prs) {
    const found = await ours(n)
    for (const c of found.review) {
      await gh('DELETE', `${repoPath}/pulls/comments/${c.id}`)
      out.deleted++
    }
    for (const c of found.issue) {
      await gh('DELETE', `${repoPath}/issues/comments/${c.id}`)
      out.deleted++
    }
  }
  for (const n of sandbox.prs) await gh('PATCH', `${repoPath}/pulls/${n}`, { state: 'closed' })
  for (const b of sandbox.branches) {
    try {
      await gh('DELETE', `${repoPath}/git/refs/heads/${b}`)
    } catch (err) {
      if (err.status !== 404 && err.status !== 422) throw err
    }
  }
  // Read back: nothing of this run's marker anywhere in the fork since it started.
  for (const n of sandbox.prs) {
    const left = await ours(n)
    out.left += left.review.length + left.issue.length
    if ((await gh('GET', `${repoPath}/pulls/${n}`)).state === 'closed') out.closed++
  }
  for (const kind of ['pulls/comments', 'issues/comments']) {
    const recent = await ghAll(`${repoPath}/${kind}?since=${encodeURIComponent(STARTED)}`)
    out.left += recent.filter(carriesMark).length
  }
  const refs = await gh('GET', `${repoPath}/git/matching-refs/heads/smoke/f5-`)
  out.branchesLeft = refs.filter((r) =>
    sandbox.branches.includes(r.ref.replace('refs/heads/', ''))
  ).length
  return out
}

/* ------------------------------------------------------------- launch -- */

const DIR = mkdtempSync(join(realpathSync.native(tmpdir()), 'playground-smoke-prgh-'))
let app = null
let logFd = null

async function portAnswers() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/version`)
    return true
  } catch {
    return false
  }
}

async function launch(name, env = process.env) {
  if (await portAnswers()) {
    throw new Error(`Port ${PORT} already answers; it is not this script's app. Set SMOKE_PORT.`)
  }
  const userData = join(DIR, `userData-${name}`)
  mkdirSync(userData, { recursive: true })
  // The app lists a workspace's repositories one level down, and each
  // repository's linked worktrees through `git worktree list`.
  const wsPath = dirname(REPO_ROOT)
  writeFileSync(
    join(userData, 'config.json'),
    J({ workspaces: [{ id: wsPath.toLowerCase(), path: wsPath, displayName: 'ws' }] }) + '\n'
  )
  logFd = openSync(join(DIR, `app-${name}.log`), 'w')
  app = spawn(
    process.execPath,
    [
      join(APP_ROOT, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'),
      'dev',
      '--',
      `--user-data-dir=${userData}`,
      `--remote-debugging-port=${PORT}`,
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-background-timer-throttling'
    ],
    { cwd: APP_ROOT, env, stdio: ['ignore', logFd, logFd], windowsHide: true }
  )
}

async function stopApp() {
  try {
    ws?.close()
  } catch {
    /* closed */
  }
  ws = null
  if (app?.pid) {
    try {
      // The dev server and every Electron process under it, and nothing else.
      execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      /* already gone */
    }
  }
  app = null
  if (logFd !== null) closeSync(logFd)
  logFd = null
  for (let i = 0; i < 20 && (await portAnswers()); i++) await sleep(500)
}

async function teardown() {
  await stopApp()
  // Chromium lets go of the profile a moment after its processes die.
  for (let i = 0; i < 30 && existsSync(DIR); i++) {
    try {
      rmSync(DIR, { recursive: true, force: true })
    } catch {
      await sleep(1000)
    }
  }
}

/* ------------------------------------------------------------ harness -- */

let ws = null
let nextId = 1
const pending = new Map()

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(J({ id, method, params }))
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`${method} timed out`))
      }
    }, 30000)
  })
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || 'evaluate threw')
  }
  return res.result.value
}

/** Polls `expression` until it is truthy, up to `ms`; returns its last value. */
async function waitFor(expression, ms = 15000, step = 200) {
  let value = null
  for (let waited = 0; waited <= ms; waited += step) {
    value = await evaluate(expression)
    if (value) return value
    await sleep(step)
  }
  return value
}

/** Polls an async reading until `ok` holds, up to `ms`; returns its last value. */
async function until(read, ok, ms = 20000, step = 1000) {
  let value = null
  for (let waited = 0; waited <= ms; waited += step) {
    value = await read()
    if (ok(value)) return value
    await sleep(step)
  }
  return value
}

async function connect() {
  let page = null
  for (let i = 0; i < 120 && !page; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools')) ?? null
    } catch {
      /* not up yet */
    }
    if (!page) await sleep(1000)
  }
  if (!page) throw new Error(`No CDP page on port ${PORT} after 120 s`)
  ws = new WebSocket(page.webSocketDebuggerUrl)
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
  })
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
  })
  await send('Runtime.enable')
  if (!(await waitFor(`document.querySelector('.topbar') !== null`, 60000, 500))) {
    throw new Error('The top bar never appeared')
  }
}

const checks = []
const skipped = []
/** A check this pull request cannot drive: printed, never counted as a pass. */
function skip(label, reason) {
  skipped.push(label)
  console.log(`--. SKIP  ${label} — ${reason}`)
}
function check(label, ok, detail = '') {
  checks.push({ label, ok })
  console.log(
    `${String(checks.length).padStart(2)}. ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`
  )
}

async function mouse(type, x, y, extra = {}) {
  await send('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra })
}

async function click(point) {
  await mouse('mouseMoved', point.x, point.y)
  await mouse('mousePressed', point.x, point.y, { button: 'left', buttons: 1, clickCount: 1 })
  await mouse('mouseReleased', point.x, point.y, { button: 'left', buttons: 0, clickCount: 1 })
}

/** Types through the keyboard, one key at a time, into whatever holds the focus. */
async function type(chars) {
  for (const ch of chars) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
  }
}

async function ctrlEnter() {
  const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 }
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
}

/** The centre of the first element `selector` matches, or null. */
const centre = (selector) =>
  evaluate(`(() => {
    const el = document.querySelector(${J(selector)})
    if (!el) return null
    // Inside the editor Monaco owns the scrolling; scrollIntoView would shift
    // its clipped layers out from under its own coordinates.
    if (!el.closest('.monaco-editor')) el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)

const clickByText = (selector, label) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll(${J(selector)})]
      .find((e) => (e.textContent || '').trim() === ${J(label)})
    if (!el) return false
    el.click()
    return true
  })()`)

/* ------------------------------------------------------ page readings -- */

/** The chip as drawn: its state, its words, and the colours it reads in. */
const chipReading = () =>
  evaluate(`(() => {
    const chip = document.querySelector('.topbar-gh')
    if (!chip) return null
    const dot = chip.querySelector('.topbar-gh-dot')
    return {
      theme: document.documentElement.dataset.theme ?? null,
      status: chip.getAttribute('data-gh-status'),
      classes: [...chip.classList],
      text: [...chip.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(),
      afterAz: chip.previousElementSibling?.classList.contains('topbar-sync') === true,
      hint: chip.querySelector('.topbar-gh-hint')?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
      link: chip.querySelector('.topbar-gh-link')?.textContent.trim() ?? null,
      linkTitle: chip.querySelector('.topbar-gh-link')?.getAttribute('title') ?? null,
      dot: dot ? getComputedStyle(dot).backgroundColor : null,
      color: getComputedStyle(chip).color
    }
  })()`)

/** The chip in the theme on screen, then in the other one, then the theme put back. */
async function chipInBothThemes() {
  const readings = {}
  for (let i = 0; i < 2; i++) {
    const r = await chipReading()
    if (r?.theme) readings[r.theme] = r
    const before = await evaluate(`document.documentElement.dataset.theme ?? ''`)
    await evaluate(`document.querySelector('.topbar-icon-btn[title^="Switch to"]')?.click()`)
    await waitFor(`(document.documentElement.dataset.theme ?? '') !== ${J(before)}`, 5000)
    await sleep(300)
  }
  return readings
}

/** The pull request as the app's own main process reads it (window.api, no network of ours). */
async function appDetail(wantId) {
  return evaluate(`(async () => {
    const search = await window.api.invoke('github-pr:find', { worktreePath: ${J(WT)} })
    if (search.kind !== 'found') return { search: search.kind, prs: [] }
    const want = ${J(wantId ?? null)}
    const prs = search.prs.map((p) => ({ id: p.id, provider: p.target.provider }))
    const pr = want === null ? search.prs[0] : search.prs.find((p) => p.id === want)
    if (!pr) return { search: 'found', prs, get: 'not listed' }
    const got = await window.api.invoke('github-pr:get', {
      worktreePath: ${J(WT)},
      pr: { target: pr.target, id: pr.id }
    })
    return { search: 'found', prs, get: got.kind, detail: got.kind === 'ok' ? got.detail : null }
  })()`)
}

/** What the Overview shows: header, reviewers, the timeline, and each thread by id with where it sits. */
const overview = () =>
  evaluate(`(() => {
    const root = document.querySelector('.pr-overview')
    if (!root) return null
    const sections = [...root.querySelectorAll('.pr-overview-section')].map((s) => ({
      label: s.querySelector('.section-label')?.textContent.trim() ?? '',
      threads: [...s.querySelectorAll('.pr-thread')].map((t) => ({
        id: t.getAttribute('data-thread-id'),
        expanded: t.querySelector('.pr-thread-toggle')?.getAttribute('aria-expanded') === 'true',
        link: t.querySelector('.pr-thread-location.link') !== null,
        location: t.querySelector('.pr-thread-location')?.textContent.trim() ?? null,
        action: t.querySelector('.pr-thread-resolve')?.getAttribute('data-action') ?? null,
        comments: t.querySelectorAll('.pr-thread-comment').length
      }))
    }))
    return {
      title: root.querySelector('.pr-overview-title')?.textContent.trim() ?? '',
      id: root.querySelector('.pr-overview-id')?.textContent.trim() ?? '',
      draft: root.querySelector('.pr-overview-badge')?.textContent.trim() ?? '',
      meta: [...root.querySelectorAll('.pr-overview-meta > span')].map((s) => s.textContent.trim().length > 0),
      reviewers: [...root.querySelectorAll('.pr-overview-reviewer')].map((li) => ({
        name: li.querySelector('.pr-overview-reviewer-name')?.firstChild?.textContent.trim() ?? '',
        classes: [...li.classList].filter((c) => c !== 'pr-overview-reviewer'),
        vote: li.querySelector('.pr-overview-vote')?.textContent.trim() ?? ''
      })),
      noReviewers: [...root.querySelectorAll('.pr-overview-empty')].some((e) => e.textContent.includes('No reviewers')),
      description: root.querySelector('.pr-overview-description') !== null,
      noDescription: [...root.querySelectorAll('.pr-overview-empty')].some((e) => e.textContent.includes('No description')),
      timeline: [...root.querySelectorAll('ul.pr-overview-timeline > li.pr-overview-timeline-entry')].map((li) => ({
        author: li.querySelector('.pr-overview-timeline-author')?.textContent.trim() ?? '',
        state: li.getAttribute('data-review-state'),
        stateClasses: [...(li.querySelector('.pr-overview-timeline-state')?.classList ?? [])],
        date: li.querySelector('.pr-overview-timeline-date')?.textContent.trim() ?? '',
        body: li.querySelector('.markdown-body')?.textContent ?? null
      })),
      timelineButtons: root.querySelectorAll('ul.pr-overview-timeline button').length,
      sections
    }
  })()`)

const sectionOf = (view, id) =>
  view?.sections.find((s) => s.threads.some((t) => t.id === id))?.label.replace(/ \(\d+\)$/, '') ??
  null

const threadIn = (view, id) =>
  view?.sections.flatMap((s) => s.threads).find((t) => t.id === id) ?? null

const activeTabLabel = `document.querySelector('.file-tab.active .file-tab-label')?.textContent.trim() ?? ''`

async function showOverview() {
  await evaluate(`document.querySelector('.file-tab.fixed .file-tab-label')?.click()`)
  return waitFor(`document.querySelector('.pr-overview-title') !== null`, 20000)
}

/**
 * Lines of one side of the open PR diff that Monaco has rendered: number,
 * gutter box, and the text line's box, for aiming the mouse.
 */
const sideLines = (side) =>
  evaluate(`(() => {
    const ed = document.querySelector('.pr-diff-tab .editor.${side}')
    if (!ed) return null
    const box = ed.getBoundingClientRect()
    const views = [...ed.querySelectorAll('.view-lines .view-line')]
    return [...ed.querySelectorAll('.margin-view-overlays .line-numbers')]
      .map((n) => {
        const r = n.getBoundingClientRect()
        const line = views.find((v) => Math.abs(v.getBoundingClientRect().top - r.top) < 2)
        return {
          n: Number(n.textContent.trim()),
          top: r.top,
          bottom: r.bottom,
          active: n.classList.contains('active-line-number'),
          text: line ? line.textContent.replace(/\\u00a0/g, ' ') : null,
          inView: r.top >= box.top && r.bottom <= box.bottom
        }
      })
      .filter((l) => Number.isInteger(l.n) && l.n > 0)
      .sort((a, b) => a.n - b.n)
  })()`)

/** Where character `k` of rendered line `n` sits on screen, for a click that lands on column k + 1. */
const charPoint = (side, n, k) =>
  evaluate(`(() => {
    const ed = document.querySelector('.pr-diff-tab .editor.${side}')
    const num = [...ed.querySelectorAll('.margin-view-overlays .line-numbers')]
      .find((e) => e.textContent.trim() === ${J(String(n))})
    if (!num) return null
    const top = num.getBoundingClientRect().top
    const view = [...ed.querySelectorAll('.view-lines .view-line')]
      .find((v) => Math.abs(v.getBoundingClientRect().top - top) < 2)
    if (!view) return null
    const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT)
    let left = ${k}
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (left < node.length) {
        const range = document.createRange()
        range.setStart(node, left)
        range.setEnd(node, left + 1)
        const r = range.getBoundingClientRect()
        return { x: r.left + 1, y: r.top + r.height / 2 }
      }
      left -= node.length
    }
    const r = view.getBoundingClientRect()
    return { x: r.left + 2, y: r.top + r.height / 2 }
  })()`)

/** Scrolls one side of the PR diff with the mouse wheel, over its gutter, until line `n` is in view. */
async function bringIntoView(side, n) {
  for (let i = 0; i < 40; i++) {
    const lines = (await sideLines(side)) ?? []
    const hit = lines.find((l) => l.n === n)
    if (hit?.inView && hit.text !== null) return true
    const shown = lines.filter((l) => l.inView)
    const down = shown.length === 0 || shown[shown.length - 1].n < n
    const at = await evaluate(`(() => {
      const r = document.querySelector('.pr-diff-tab .editor.${side}')?.getBoundingClientRect()
      return r ? { x: r.left + 12, y: r.top + r.height / 2 } : null
    })()`)
    if (!at) return false
    await send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: at.x,
      y: at.y,
      deltaX: 0,
      deltaY: down ? 120 : -120
    })
    await sleep(250)
  }
  return false
}

/** Each thread zone of the open PR diff: its side, its box and the thread in it. */
const zones = () =>
  evaluate(`[...document.querySelectorAll('.pr-diff-tab .diff-viewer-zone')].map((z) => {
    const r = z.getBoundingClientRect()
    const t = z.querySelector('.pr-thread')
    return {
      side: z.closest('.editor.modified') ? 'modified' : z.closest('.editor.original') ? 'original' : '?',
      top: r.top,
      height: r.height,
      threadId: t ? t.getAttribute('data-thread-id') : null,
      expanded: t?.querySelector('.pr-thread-toggle')?.getAttribute('aria-expanded') === 'true',
      action: t?.querySelector('.pr-thread-resolve')?.getAttribute('data-action') ?? null,
      actionText: t?.querySelector('.pr-thread-resolve')?.textContent.trim() ?? null,
      actionEnabled: t ? t.querySelector('.pr-thread-resolve')?.disabled === false : false,
      composer: z.querySelector('.comment-composer') !== null,
      text: z.textContent
    }
  })`)

/** The line a zone sits under: the rendered line whose gutter box ends where the zone begins. */
function lineAbove(zone, lines) {
  const hit = lines.find((l) => Math.abs(l.bottom - zone.top) < 1.5)
  return hit ? hit.n : null
}

/**
 * The modified-side selection the PR diff holds, read from React's state for
 * the PrDiffTab: exactly what Monaco reported. The component's first hook is
 * that state. The walk starts from the root's committed tree: a DOM node's
 * own fiber pointer can be the stale alternate.
 */
const heldSelection = () =>
  evaluate(`(() => {
    const host = [...document.querySelectorAll('body > *')]
      .find((e) => Object.keys(e).some((k) => k.startsWith('__reactContainer$')))
    if (!host) return null
    const key = Object.keys(host).find((k) => k.startsWith('__reactContainer$'))
    const stack = [host[key].stateNode.current]
    while (stack.length) {
      const fiber = stack.pop()
      if (fiber.type && fiber.type.name === 'PrDiffTab') {
        const state = fiber.memoizedState?.memoizedState
        return state && typeof state.startLine === 'number' ? state : null
      }
      if (fiber.sibling) stack.push(fiber.sibling)
      if (fiber.child) stack.push(fiber.child)
    }
    return null
  })()`)

/**
 * Selects from character `ka` of line `a` to character `kb` of line `b` the
 * way a reader extends a selection: a click, then a Shift+click, each line
 * scrolled into view first. Each point is read just before it is used.
 */
async function selectRange(side, a, ka, b, kb) {
  await bringIntoView(side, a)
  const from = await charPoint(side, a, ka)
  if (!from) return
  await click(from)
  await sleep(400)
  await bringIntoView(side, b)
  const to = await charPoint(side, b, kb)
  if (!to) return
  await mouse('mouseMoved', to.x, to.y, { modifiers: 8 })
  await mouse('mousePressed', to.x, to.y, {
    button: 'left',
    buttons: 1,
    clickCount: 1,
    modifiers: 8
  })
  await mouse('mouseReleased', to.x, to.y, {
    button: 'left',
    buttons: 0,
    clickCount: 1,
    modifiers: 8
  })
  await sleep(400)
}

/* ------------------------------------------------------------- setup -- */

let fx = null // what the app read, and what GitHub says, for the checks

async function enterPullRequestMode(ready) {
  await clickByText('.topbar-segment', 'Tree')
  const picked = await waitFor(
    `(() => {
      const el = [...document.querySelectorAll('.sidebar-worktree-branch')]
        .find((e) => (e.textContent || '').trim() === ${J(BRANCH)})
      if (!el) return false
      el.closest('.sidebar-worktree').click()
      return true
    })()`,
    60000,
    500
  )
  if (!picked) throw new Error('The worktree under test never appeared in the sidebar')
  await sleep(800)
  await clickByText('.topbar-segment', 'Files')
  await waitFor(`document.querySelectorAll('.file-tree-mode').length > 0`, 20000)
  await clickByText('.file-tree-mode', 'Pull request')
  return waitFor(ready, 60000, 300)
}

const titleShown = `document.querySelector('.pr-overview-title') !== null`
const pickerShown = `document.querySelector('.pr-picker-select') !== null`

/** The picker's options, as a reader sees them. */
const pickerOptions = () =>
  evaluate(`[...document.querySelectorAll('.pr-picker-select option[data-provider]')].map((o) => ({
    provider: o.getAttribute('data-provider'),
    text: o.textContent.trim(),
    value: o.value
  }))`)

/** Picks pull request `id` in the picker, the way a pick does. */
async function choosePr(id) {
  const options = await pickerOptions()
  const option = options.find((o) => o.text.includes(`#${id} `))
  if (!option) return false
  await evaluate(`(() => {
    const select = document.querySelector('.pr-picker-select')
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    setter.call(select, ${J(option.value)})
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  return waitFor(titleShown, 60000, 300)
}

/** The remotes of the worktree under test, as owner/repo, and the one its branch tracks. */
function localRemotes() {
  const names = git(['remote'], WT).split(/\s+/).filter(Boolean)
  const all = names.map((name) => ({
    name,
    repo: githubRepoOf(git(['remote', 'get-url', name], WT))
  }))
  let tracked = null
  try {
    tracked = git(['config', `branch.${BRANCH}.remote`], WT)
  } catch {
    /* tracks nothing */
  }
  return { all, tracked: all.find((r) => r.name === tracked)?.repo ?? null }
}

async function readFixture() {
  const read = await appDetail(WRITES ? sandbox.pr : null)
  const detail = read.detail ?? null
  fx = { read, detail, picker: fx?.picker ?? null }
  if (!detail) return
  const owner = detail.target.owner
  const name = detail.target.repo
  const repoPath = `/repos/${owner}/${name}`
  // GitHub's own account of the pull request, read by the script, not the app.
  const [threads, files, comments, reviews, gqlPr] = await Promise.all([
    threadsOf(owner, name, detail.id),
    ghAll(`${repoPath}/pulls/${detail.id}/files`),
    ghAll(`${repoPath}/issues/${detail.id}/comments`),
    ghAll(`${repoPath}/pulls/${detail.id}/reviews`),
    gql(
      `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          latestReviews(first: 100) { nodes { author { login } state } }
          reviewRequests(first: 100) { nodes { requestedReviewer { __typename
            ... on User { login } ... on Bot { login } ... on Mannequin { login } ... on Team { name } } } } } } }`,
      { owner, name, number: detail.id }
    )
  ])
  fx.github = {
    repoPath,
    threads,
    files,
    comments,
    reviews,
    latest: gqlPr.repository.pullRequest.latestReviews.nodes.filter((r) => r.state !== 'PENDING'),
    requests: gqlPr.repository.pullRequest.reviewRequests.nodes
  }
}

/** Opens one thread's diff from its Overview location, as a reader does. */
async function openThreadDiff(threadId) {
  await showOverview()
  const opened = await evaluate(`(() => {
    const link = [...document.querySelectorAll('.pr-overview .pr-thread')]
      .find((t) => t.getAttribute('data-thread-id') === ${J(threadId)})
      ?.querySelector('.pr-thread-location.link')
    if (!link) return false
    link.click()
    return true
  })()`)
  if (!opened) return false
  await waitFor(
    `document.querySelector('.pr-diff-tab .editor.modified .view-line') !== null`,
    30000,
    300
  )
  await sleep(1500)
  return true
}

/** Opens one file's PR diff from the tree, as a reader does. */
async function openFileDiff(path) {
  const opened = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.file-tree-row')]
      .find((r) => r.getAttribute('title') === ${J(path)} && !r.querySelector('.file-tree-chevron'))
    if (!row) return false
    row.querySelector('.file-tree-open').click()
    return true
  })()`)
  if (!opened) return false
  await waitFor(
    `[...document.querySelectorAll('.pr-diff-tab')].some((t) => t.getAttribute('data-pr-diff') === ${J(path)} && t.querySelector('.editor.original .view-line') && t.querySelector('.editor.modified .view-line'))`,
    30000,
    300
  )
  await sleep(1500)
  return true
}

/* --------------------------------------------------------------- chip -- */

const chipReadings = {}

async function chipSignedIn() {
  await waitFor(`document.querySelector('.topbar-gh') !== null`, 30000, 300)
  const chip = await chipReading()
  check(
    'The gh chip reads signed in, beside the az chip (FPRG-02)',
    chip !== null &&
      chip.status === 'ok' &&
      chip.classes.includes('ok') &&
      chip.text === 'gh · signed in' &&
      chip.afterAz &&
      chip.hint === null &&
      chip.link === null,
    chip ? `"${chip.text}", ${chip.afterAz ? 'right after az' : 'not after az'}` : 'no chip'
  )
  if (!WRITES && runs('chip')) chipReadings.ok = await chipInBothThemes()
}

/**
 * The environment with `gh` signed out: no token variables, an empty config
 * folder, and a default host it holds no token for. An empty config folder
 * alone is not enough: `gh auth token` still answers from the system keyring.
 * Under this one it fails as a signed-out `gh` does, "no oauth token found".
 */
function envSignedOut() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (
      /^(GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|GH_HOST)$/i.test(key)
    ) {
      delete env[key]
    }
  }
  env.GH_HOST = 'signed-out.invalid'
  env.GH_CONFIG_DIR = join(DIR, 'gh-signed-out')
  mkdirSync(env.GH_CONFIG_DIR, { recursive: true })
  return env
}

/** The environment with no `gh` on the PATH. */
function envWithoutGh() {
  const env = { ...process.env }
  const key = Object.keys(env).find((k) => k.toLowerCase() === 'path')
  env[key] = env[key]
    .split(delimiter)
    .filter((d) => d && !existsSync(join(d, 'gh.exe')) && !existsSync(join(d, 'gh')))
    .join(delimiter)
  return env
}

/** How `gh auth token` ends under an environment: 'ok', 'failed' or 'missing'. */
function ghUnder(env) {
  const r = spawnSync('gh', ['auth', 'token'], { env, windowsHide: true, encoding: 'utf8' })
  if (r.error?.code === 'ENOENT') return 'missing'
  return r.status === 0 && r.stdout.trim() !== '' ? 'ok' : 'failed'
}

async function chipVariants() {
  // Signed out: the chip and the mode's line both say so (FPRG-04).
  const signedOut = envSignedOut()
  const outState = ghUnder(signedOut)
  await launch('signed-out', signedOut)
  await connect()
  await waitFor(`document.querySelector('.topbar-gh') !== null`, 30000, 300)
  const out = await chipReading()

  // FPRG-05: a focus asks gh again, and another within 5 s does not. The
  // config folder is this script's, so gh's answer can change under the app:
  // a hosts file with a placeholder token for the fictitious host makes
  // `gh auth token` answer, and removing it makes it fail again. The
  // placeholder goes nowhere: the chip only asks gh whether it has a token.
  const hosts = join(signedOut.GH_CONFIG_DIR, 'hosts.yml')
  const focus = () => evaluate(`window.dispatchEvent(new Event('focus'))`)
  const chipIs = (status) =>
    waitFor(
      `document.querySelector('.topbar-gh')?.getAttribute('data-gh-status') === ${J(status)}`,
      10000,
      200
    )
  await sleep(5500) // out of the mount's own ask
  writeFileSync(hosts, 'signed-out.invalid:\n    oauth_token: smoke-placeholder\n    user: smoke\n')
  const askedAt = Date.now()
  await focus()
  const flipped = await chipIs('ok')
  rmSync(hosts)
  await sleep(1000)
  await focus()
  await sleep(2000)
  const held = (await chipReading())?.status ?? null
  await sleep(Math.max(0, askedAt + 5500 - Date.now()))
  await focus()
  const back = await chipIs('not-signed-in')
  check(
    'A window focus asks gh again; another within 5 s does not; one after 5 s does (FPRG-05)',
    out?.status === 'not-signed-in' && flipped === true && held === 'ok' && back === true,
    `before ${out?.status}; a focus: ${flipped ? 'signed in' : 'unchanged'}; another 1 s later: ${held === 'ok' ? 'not asked' : 'asked'}; one after 5 s: ${back ? 'not signed in again' : 'unchanged'}`
  )

  await enterPullRequestMode(`document.querySelector('.pr-overview-auth') !== null`)
  const line = await evaluate(`(() => {
    const auth = document.querySelector('.pr-overview-auth')
    return auth ? {
      title: auth.querySelector('.pr-overview-auth-title')?.textContent.trim() ?? '',
      command: auth.querySelector('code')?.textContent.trim() ?? ''
    } : null
  })()`)
  check(
    'With gh signed out the chip reads not signed in, says run gh auth login, and the mode asks for gh auth login (FPRG-04)',
    outState === 'failed' &&
      out?.status === 'not-signed-in' &&
      out.text === 'gh · not signed in' &&
      out.hint === 'run gh auth login' &&
      out.link === null &&
      line?.title === 'GitHub sign-in needed' &&
      line.command === 'gh auth login',
    `gh ${outState}; chip "${out?.text}"; mode ${line ? `"${line.title}" / ${line.command}` : 'no sign-in line'}`
  )
  chipReadings['not-signed-in'] = await chipInBothThemes()
  await stopApp()

  // Not installed: the chip says so and offers the install page (FPRG-03).
  const noGh = envWithoutGh()
  const noGhState = ghUnder(noGh)
  await launch('not-installed', noGh)
  await connect()
  await waitFor(`document.querySelector('.topbar-gh') !== null`, 30000, 300)
  const missing = await chipReading()
  check(
    'With no gh on the PATH the chip reads not installed and offers Install for the CLI page (FPRG-03)',
    noGhState === 'missing' &&
      missing?.status === 'not-installed' &&
      missing.text === 'gh · not installed' &&
      missing.link === 'Install' &&
      missing.linkTitle === 'Open https://cli.github.com in the browser' &&
      missing.hint === null,
    `gh ${noGhState}; chip "${missing?.text}"`
  )
  chipReadings['not-installed'] = await chipInBothThemes()
  await stopApp()

  // T19: the three states read differently in both themes.
  const states = ['ok', 'not-signed-in', 'not-installed']
  const themes = ['dark', 'light']
  const per = themes.map((theme) => {
    const r = states.map((s) => chipReadings[s]?.[theme] ?? null)
    const dots = r.map((x) => x?.dot ?? null)
    const colours = r.map((x) => x?.color ?? null)
    return {
      theme,
      complete: r.every((x, i) => x !== null && x.status === states[i]),
      dotsDistinct: new Set(dots).size === 3 && dots.every((d) => d && d !== 'rgba(0, 0, 0, 0)'),
      words: new Set(r.map((x) => x?.text)).size === 3,
      colours: new Set(colours).size
    }
  })
  check(
    'The three chip states read differently in both themes: own words, own dot colour (T19)',
    per.every((p) => p.complete && p.dotsDistinct && p.words),
    per
      .map(
        (p) =>
          `${p.theme}: ${p.complete ? 'all 3 read' : 'missing'}, dots ${p.dotsDistinct ? 'distinct' : 'shared'}, ${p.colours} text colours`
      )
      .join('; ')
  )
}

/* ----------------------------------------------------------- overview -- */

const REVIEWER_LABELS = {
  approved: 'Approved',
  'approved-with-suggestions': 'Approved with suggestions',
  'no-vote': 'No vote',
  'waiting-for-author': 'Waiting for author',
  rejected: 'Rejected',
  'changes-requested': 'Changes requested',
  commented: 'Commented',
  dismissed: 'Dismissed'
}

async function overviewSection() {
  const detail = fx.detail
  const view = await overview()
  const fixed = await evaluate(
    `[...document.querySelectorAll('.file-tab.fixed .file-tab-label')].map((e) => e.textContent.trim())`
  )

  // The picker, read before the pick: every PR marked with its provider (FPRG-07).
  if (fx.picker === null) {
    skip(
      'The picker marks each pull request with its provider (FPRG-07)',
      `${fx.read.prs.length} pull request found; the picker shows only with several`
    )
  } else {
    const want = new Set(fx.read.prs.map((p) => String(p.id)))
    const opts = fx.picker
    check(
      'The picker lists every pull request found, each marked GitHub, with its number (FPRG-07)',
      opts.length === fx.read.prs.length &&
        opts.length >= 2 &&
        opts.every((o) => o.provider === 'github' && /^GitHub · #\d+ /.test(o.text)) &&
        opts.every((o) => want.has(o.text.match(/#(\d+) /)?.[1])),
      `${opts.length} options for ${fx.read.prs.length} found; ${opts.filter((o) => o.provider === 'github' && o.text.startsWith('GitHub · #')).length} marked GitHub`
    )
  }

  // FPRG-06/09: found with no configuration, shown as #n on the fixed Overview.
  let where = ''
  let placed = false
  if (WRITES) {
    placed =
      detail?.id === sandbox.pr &&
      `${detail.target.owner}/${detail.target.repo}`.toLowerCase() === FORK.toLowerCase() &&
      view?.draft === 'Draft'
    where = `the fork's draft ${placed ? 'as expected' : 'NOT the one opened'}`
  } else if (detail) {
    const remotes = localRemotes()
    const target = `${detail.target.owner}/${detail.target.repo}`.toLowerCase()
    const head = detail.github?.headRepo
      ? `${detail.github.headRepo.owner}/${detail.github.headRepo.repo}`.toLowerCase()
      : null
    placed =
      remotes.tracked !== null &&
      head === remotes.tracked &&
      target !== head &&
      remotes.all.some((r) => r.repo === target && r.repo !== remotes.tracked)
    where = `fork → upstream ${placed ? 'yes' : 'no'}`
  }
  check(
    'The branch pull request is found with no configuration and shown as #n on the fixed Overview (FPRG-06/09)',
    fx.read.search === 'found' &&
      detail !== null &&
      view !== null &&
      view.id === `#${detail.id}` &&
      fixed.length === 1 &&
      fixed[0] === 'Overview' &&
      (await evaluate(activeTabLabel)) === 'Overview' &&
      placed,
    `search ${fx.read.search}, label ${view?.id === `#${detail?.id}` ? '#n' : view?.id ? 'other' : 'none'}, ${where}`
  )

  // FPRG-09: header and description.
  const descriptionOk = detail.description.trim() === '' ? view.noDescription : view.description
  check(
    'The Overview shows the header — author, state, branches, date — and the description (FPRG-09)',
    view.title.length > view.id.length &&
      view.meta.length === 4 &&
      view.meta.every(Boolean) &&
      descriptionOk,
    `meta ${view.meta.filter(Boolean).length}/4, description ${descriptionOk ? 'ok' : 'wrong'}`
  )

  // FPRG-09: each reviewer's state, as GitHub reports latest reviews and requests.
  const g = fx.github
  const expectedReviewers = new Set([
    ...g.latest.map((r) => r.author?.login ?? 'ghost'),
    ...g.requests.map((r) => r.requestedReviewer?.login ?? r.requestedReviewer?.name)
  ])
  if (expectedReviewers.size === 0) {
    skip('Each reviewer is listed with their state (FPRG-09)', 'the pull request has no reviewers')
  } else {
    const rows = view.reviewers
    const states = rows.map((r) => r.classes[0])
    const latestState = (name) => {
      const r = g.latest.find((x) => (x.author?.login ?? 'ghost') === name)
      if (!r) return 'no-vote'
      return {
        APPROVED: 'approved',
        CHANGES_REQUESTED: 'changes-requested',
        COMMENTED: 'commented',
        DISMISSED: 'dismissed'
      }[r.state]
    }
    check(
      'Each reviewer is listed with their state, and requested reviewers without a review as No vote (FPRG-09)',
      rows.length === expectedReviewers.size &&
        rows.every(
          (r) =>
            expectedReviewers.has(r.name) &&
            r.classes.length === 1 &&
            r.classes[0] === latestState(r.name) &&
            r.vote === REVIEWER_LABELS[r.classes[0]]
        ),
      `${rows.length} rows for ${expectedReviewers.size} on GitHub; states ${[...new Set(states)].join(', ')}`
    )
  }

  // FPRG-10, D4: review bodies and PR comments in General, no buttons; a
  // review with no text adds no entry (edge case; S2).
  const bodied = g.reviews.filter(
    (r) => r.state !== 'PENDING' && String(r.body ?? '').trim() !== ''
  )
  const empty = g.reviews.filter((r) => r.state !== 'PENDING' && String(r.body ?? '').trim() === '')
  const want = bodied.length + g.comments.length
  if (want === 0) {
    skip(
      'The timeline lists review bodies and PR comments in General, without buttons (FPRG-10)',
      `the pull request has no review body or PR comment (${empty.length} empty reviews)`
    )
  } else {
    const entries = view.timeline
    check(
      'The timeline lists review bodies and PR comments in General, each with author and date, no buttons, no empty entry (FPRG-10)',
      entries.length === want &&
        entries.every(
          (e) => e.author !== '' && e.date !== '' && e.body !== null && e.body.trim() !== ''
        ) &&
        entries.every((e) =>
          e.state ? e.stateClasses.includes(e.state) : e.stateClasses.length === 0
        ) &&
        view.timelineButtons === 0 &&
        (!WRITES ||
          (empty.length > 0 &&
            entries.some((e) => e.body.includes(`${MARK} seeded general comment`)))),
      `${entries.length} entries for ${want} on GitHub, ${empty.length} empty reviews not shown, ${view.timelineButtons} buttons`
    )
  }

  // FPRA-11 / FPRG-13/14: threads by where they sit, counted.
  const count = (pred) => g.threads.filter(pred).length
  const line = (t) => t.subjectType !== 'FILE'
  const expected = [
    ['Active', count((t) => line(t) && !t.isOutdated && t.line !== null && !t.isResolved)],
    ['Resolved', count((t) => line(t) && !t.isOutdated && t.line !== null && t.isResolved)],
    ['Outdated', count((t) => line(t) && (t.isOutdated || t.line === null))],
    ['General', want + count((t) => !line(t))]
  ]
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${label} (${n})`)
  const got = view.sections
    .map((s) => s.label)
    .filter((l) => /^(Active|Resolved|Outdated|General) \(\d+\)$/.test(l))
  if (g.threads.length === 0) {
    skip(
      'Threads are listed in Active / Resolved / Outdated / General, counted (FPRG-13/14)',
      'the pull request has no review thread'
    )
  } else {
    check(
      'Threads are listed in Active / Resolved / Outdated / General, counted as GitHub reports them (FPRG-13/14)',
      got.join('|') === expected.join('|'),
      `${got.join('|') === expected.join('|') ? 'as on GitHub' : `${got.join('|')} vs ${expected.join('|')}`}`
    )
  }

  if (WRITES) {
    // FPRG-14: the outdated thread is listed as outdated, on its old line, opening nothing.
    const o = threadIn(view, sandbox.outdated.id)
    check(
      'The outdated thread is listed under Outdated, on its original line, with no link (FPRG-14)',
      sectionOf(view, sandbox.outdated.id) === 'Outdated' &&
        o?.location === `${FILE}:30` &&
        o.link === false,
      `section ${sectionOf(view, sandbox.outdated.id)}, ${o?.location === `${FILE}:30` ? 'original line' : 'other line'}, link ${o?.link}`
    )

    // FPRG-13/17: the resolved thread is collapsed and offers Reopen.
    const r = threadIn(view, sandbox.resolved.id)
    const a = threadIn(view, sandbox.active.id)
    check(
      'The resolved thread is listed under Resolved, collapsed, offering Reopen; the active one Resolve (FPRG-13/17)',
      sectionOf(view, sandbox.resolved.id) === 'Resolved' &&
        r?.expanded === false &&
        r.action === 'reopen' &&
        sectionOf(view, sandbox.active.id) === 'Active' &&
        a?.expanded === true &&
        a.action === 'resolve',
      `resolved: ${sectionOf(view, sandbox.resolved.id)}, expanded ${r?.expanded}, ${r?.action}; active: ${a?.action}`
    )

    // FPRG-15: GitHub markdown renders inert.
    const links = await evaluate(`(() => {
      const t = [...document.querySelectorAll('.pr-overview .pr-thread')]
        .find((e) => e.getAttribute('data-thread-id') === ${J(sandbox.active.id)})
      const body = t?.querySelector('.pr-thread-comment .markdown-body')
      if (!body) return null
      const anchors = [...body.querySelectorAll('a')]
      const attrs = [...body.querySelectorAll('*')].flatMap((e) => [...e.attributes].map((a) => a.value))
      return {
        text: body.textContent,
        hrefs: document.querySelectorAll('.pr-overview a[href]').length,
        jsInAttr: attrs.some((v) => /javascript/i.test(v)),
        jsAnchorsWithTarget: anchors.filter((a) => a.textContent === 'js' && a.hasAttribute('data-href')).length,
        web: anchors.filter((a) => a.textContent === 'web').map((a) => a.getAttribute('data-href'))
      }
    })()`)
    check(
      'A GitHub comment with a javascript: link renders inert: no href, nothing to open; https keeps a data-href (FPRG-15)',
      links !== null &&
        links.text.includes(MARK) &&
        links.hrefs === 0 &&
        links.jsInAttr === false &&
        links.jsAnchorsWithTarget === 0 &&
        links.web.length === 1 &&
        links.web[0] === 'https://example.com/acme',
      links
        ? `${links.hrefs} hrefs, javascript ${links.jsInAttr || links.jsAnchorsWithTarget ? 'LIVE' : 'inert'}, https ${links.web[0] ? 'kept' : 'lost'}`
        : 'comment not found'
    )
  }

  // FPRG-11, edge case: every file listed, and no "List incomplete" on a normal PR.
  const tree = await evaluate(`({
    files: [...document.querySelectorAll('.file-tree-row')].filter((r) => !r.querySelector('.file-tree-chevron')).length,
    incomplete: document.querySelector('.pr-files-incomplete') !== null
  })`)
  check(
    'The tree lists every changed file GitHub reports, and says nothing of an incomplete list (FPRG-11)',
    g.files.length > 0 &&
      detail.files.length === g.files.length &&
      tree.files === g.files.length &&
      tree.incomplete === false,
    `${tree.files} rows for ${g.files.length} files on GitHub; incomplete note ${tree.incomplete ? 'SHOWN' : 'absent'}`
  )
}

/* --------------------------------------------------------------- diff -- */

/** Rendered lines of one side that differ from the expected text; null when too few to judge. */
async function sideMismatches(side, expected) {
  const lines = ((await sideLines(side)) ?? []).filter((l) => l.text !== null)
  if (lines.length < 5) return { seen: lines.length, wrong: null }
  const wrong = lines.filter(
    (l) => l.text.replace(/\s+$/, '') !== (expected[l.n - 1] ?? '\u0000').replace(/\s+$/, '')
  ).length
  return { seen: lines.length, wrong }
}

async function diffSection() {
  const detail = fx.detail
  const g = fx.github

  if (!WRITES) {
    // FPRG-12: both sides of a modified file, as git holds them at the merge
    // base and at the head commit — the head read from the fork.
    const compare = await gh(
      'GET',
      `${g.repoPath}/compare/${detail.github.baseSha}...${detail.github.headSha}`
    )
    const mergeBase = compare.merge_base_commit.sha
    const show = (rev, path) => {
      try {
        return execFileSync('git', ['show', `${rev}:${path}`], {
          cwd: WT,
          encoding: 'utf8',
          windowsHide: true,
          env: { ...process.env, MSYS_NO_PATHCONV: '1' },
          maxBuffer: 1 << 24
        })
      } catch {
        return null
      }
    }
    let pick = null
    for (const f of detail.files.filter((file) => file.status === 'modified')) {
      const after = show(detail.github.headSha, f.path)
      const before = show(mergeBase, f.path)
      if (after === null || before === null || after === before) continue
      if (after.length < 200 || after.length > 20000 || /[\t\r]/.test(after + before)) continue
      pick = { path: f.path, after: after.split('\n'), before: before.split('\n') }
      break
    }
    if (!pick) {
      check(
        'A PR diff shows both sides as git holds them (FPRG-12)',
        false,
        'no plain modified file to compare'
      )
      return
    }
    const opened = await openFileDiff(pick.path)
    const left = await sideMismatches('original', pick.before)
    const right = await sideMismatches('modified', pick.after)
    check(
      'A PR diff shows the merge-base side and the head side exactly as git holds them (FPRG-12)',
      opened && left.wrong === 0 && right.wrong === 0,
      `opened ${opened}; original ${left.seen} lines, ${left.wrong ?? '?'} differ; modified ${right.seen} lines, ${right.wrong ?? '?'} differ`
    )
    return
  }

  // FPRA-12: the active thread's location opens its file's PR diff on its line.
  const opened = await openThreadDiff(sandbox.active.id)
  const lines = (await sideLines('modified')) ?? []
  const landed = lines.find((l) => l.n === 5)
  check(
    'A GitHub thread location opens its file PR diff, on the thread line (FPRA-12)',
    opened && landed !== undefined && landed.inView && landed.active,
    `opened ${opened}, line ${landed ? (landed.inView ? 'in view' : 'off screen') : 'not rendered'}, cursor ${landed?.active ? 'on it' : 'elsewhere'}`
  )

  // FPRG-12: both sides as the sandbox commits hold them.
  const left = await sideMismatches('original', BASE_LINES)
  const right = await sideMismatches('modified', HEAD2_LINES)
  check(
    'The PR diff shows the base side and the latest head side exactly as pushed (FPRG-12)',
    left.wrong === 0 && right.wrong === 0,
    `original ${left.seen} lines, ${left.wrong ?? '?'} differ; modified ${right.seen} lines, ${right.wrong ?? '?'} differ`
  )

  // FPRG-13/14: threads drawn under their lines, the resolved one collapsed,
  // the outdated one not at all.
  const z = await zones()
  const ids = z.map((zone) => zone.threadId)
  const a = z.find((zone) => zone.threadId === sandbox.active.id)
  const r = z.find((zone) => zone.threadId === sandbox.resolved.id)
  const f = z.find((zone) => zone.threadId === sandbox.aboveFold.id)
  check(
    'Each current thread is drawn once under its line — above a folded region too — the resolved one collapsed; the outdated one not at all (FPRG-13/14)',
    ids.length === 3 &&
      a?.side === 'modified' &&
      lineAbove(a, lines) === 5 &&
      a.expanded === true &&
      r?.side === 'modified' &&
      lineAbove(r, lines) === 8 &&
      r.expanded === false &&
      f?.side === 'modified' &&
      lineAbove(f, lines) === 33 &&
      f.expanded === true &&
      !ids.includes(sandbox.outdated.id),
    `${ids.length} zones; active under ${a ? lineAbove(a, lines) : '-'}, resolved under ${r ? lineAbove(r, lines) : '-'} ${r?.expanded ? 'expanded' : 'collapsed'}, last before the fold under ${f ? lineAbove(f, lines) : '-'}; outdated ${ids.includes(sandbox.outdated.id) ? 'DRAWN' : 'not drawn'}`
  )

  // FPRG-17: GitHub threads carry Resolve / Reopen, not Azure DevOps' selector.
  const selects = await evaluate(
    `document.querySelectorAll('.pr-diff-tab .pr-thread-status').length`
  )
  check(
    'A GitHub thread offers Resolve when active and Reopen when resolved, in place of a status selector (FPRG-17)',
    a?.action === 'resolve' &&
      a.actionText === 'Resolve' &&
      a.actionEnabled &&
      r?.action === 'reopen' &&
      r.actionText === 'Reopen' &&
      r.actionEnabled &&
      selects === 0,
    `active ${a?.actionText}, resolved ${r?.actionText}, ${selects} status selectors`
  )
}

/* ------------------------------------------------------------- writes -- */

const reviewComments = () => ghAll(`${sandbox.repoPath}/pulls/${sandbox.pr}/comments`)
const issueComments = () => ghAll(`${sandbox.repoPath}/issues/${sandbox.pr}/comments`)
const isResolved = async (id) =>
  (
    await gql(
      'query($id: ID!) { node(id: $id) { ... on PullRequestReviewThread { isResolved } } }',
      { id }
    )
  ).node.isResolved

/** The thread zone carrying `needle`, once the reload gave it GitHub's own id. */
const postedThread = (needle) =>
  waitFor(
    `[...document.querySelectorAll('.pr-diff-tab .diff-viewer-zone .pr-thread')].find((t) => Number.isNaN(Number(t.getAttribute('data-thread-id'))) && t.textContent.includes(${J(needle)}))?.getAttribute('data-thread-id') ?? null`,
    30000,
    300
  )

/** Comment on the held selection: Comment, then the composer in its zone. */
async function openComposer() {
  await evaluate(`document.querySelector('.pr-diff-comment')?.click()`)
  await sleep(600)
  return (await zones()).find((z) => z.composer && z.threadId === null) ?? null
}

/** Scrolls the diff with the wheel until the new comment's composer is inside the editor's box. */
async function composerIntoView() {
  for (let i = 0; i < 30; i++) {
    const where = await evaluate(`(() => {
      const input = [...document.querySelectorAll('.pr-diff-tab .diff-viewer-zone')]
        .find((z) => !z.querySelector('.pr-thread'))?.querySelector('.comment-composer-input')
      const ed = document.querySelector('.pr-diff-tab .editor.modified')
      if (!input || !ed) return null
      const r = input.getBoundingClientRect()
      const box = ed.getBoundingClientRect()
      return { above: r.top < box.top, below: r.bottom > box.bottom, x: box.left + 12, y: box.top + box.height / 2 }
    })()`)
    if (!where) return false
    if (!where.above && !where.below) return true
    await send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: where.x,
      y: where.y,
      deltaX: 0,
      deltaY: where.below ? 120 : -120
    })
    await sleep(250)
  }
  return false
}

/** The new comment's composer error, if the provider refused it. */
const composerError = () =>
  evaluate(
    `[...document.querySelectorAll('.pr-diff-tab .diff-viewer-zone')].find((z) => !z.querySelector('.pr-thread'))?.querySelector('.comment-composer-error')?.textContent.trim() ?? null`
  )

async function writeIntoComposer(content) {
  await composerIntoView()
  const box = await centre(
    '.pr-diff-tab .diff-viewer-zone:not(:has(.pr-thread)) .comment-composer-input'
  )
  if (box) await click(box)
  await type(content)
  return evaluate(
    `document.querySelector('.pr-diff-tab .diff-viewer-zone:not(:has(.pr-thread)) .comment-composer-input')?.value ?? null`
  )
}

async function writesSection() {
  if (!(await openThreadDiff(sandbox.active.id))) {
    check('The write checks need the active thread diff open', false, 'not opened')
    return
  }
  const scopeOf = (id) => `.pr-diff-tab .diff-viewer-zone .pr-thread[data-thread-id="${id}"]`
  const scope = scopeOf(sandbox.active.id)

  // FPRG-16: Reply posts at once, under the thread's root comment, never pending.
  await evaluate(`document.querySelector(${J(scope + ' .pr-thread-reply')})?.click()`)
  await sleep(600)
  const replyBox = await centre(`${scope} .comment-composer-input`)
  if (replyBox) await click(replyBox)
  const replyText = `${MARK} reply`
  await type(replyText)
  await evaluate(`document.querySelector(${J(scope + ' .comment-composer-post')})?.click()`)
  const replied = await waitFor(
    `(() => {
      const bodies = [...document.querySelectorAll(${J(scope + ' .pr-thread-comment')})]
      const last = bodies[bodies.length - 1]
      return bodies.length === 2 && Number(last?.getAttribute('data-comment-id')) > 0 && last.textContent.includes(${J(replyText)})
    })()`,
    30000,
    300
  )
  const reply = (await reviewComments()).find((c) => c.body === replyText) ?? null
  const reviews = await ghAll(`${sandbox.repoPath}/pulls/${sandbox.pr}/reviews`)
  check(
    'Reply posts at once under the thread root on GitHub, with no pending review (FPRG-16)',
    replied === true &&
      reply !== null &&
      reply.in_reply_to_id === sandbox.active.root &&
      reviews.every((rv) => rv.state !== 'PENDING') &&
      reviews.some((rv) => rv.id === reply.pull_request_review_id && rv.state === 'COMMENTED'),
    `shown ${replied === true}, on GitHub ${reply ? (reply.in_reply_to_id === sandbox.active.root ? 'under the root' : 'elsewhere') : 'missing'}, ${reviews.filter((rv) => rv.state === 'PENDING').length} pending reviews`
  )

  // FPRG-17: Resolve, then Reopen, with a real click on the toggle in the diff.
  const toggle = async () => {
    const at = await centre(`${scope} .pr-thread-resolve`)
    if (at) await click(at)
    return at !== null
  }
  const clickedResolve = await toggle()
  const shownResolved = await waitFor(
    `(() => {
      const t = document.querySelector(${J(scope)})
      return t?.querySelector('.pr-thread-resolve')?.getAttribute('data-action') === 'reopen' &&
        t.querySelector('.pr-thread-toggle')?.getAttribute('aria-expanded') === 'false'
    })()`,
    20000
  )
  const resolvedOnGitHub = await until(
    () => isResolved(sandbox.active.id),
    (v) => v === true,
    15000
  )
  check(
    'Resolve resolves the thread on GitHub and collapses it, now offering Reopen (FPRG-17)',
    clickedResolve && shownResolved === true && resolvedOnGitHub === true,
    `clicked ${clickedResolve}, shown ${shownResolved === true ? 'collapsed, Reopen' : 'unchanged'}, GitHub isResolved ${resolvedOnGitHub}`
  )
  await sleep(2500) // the reload after the write
  // Reopen proves something only on a thread that is resolved right now.
  const wasResolved =
    (await evaluate(
      `document.querySelector(${J(scope)})?.querySelector('.pr-thread-resolve')?.getAttribute('data-action') ?? null`
    )) === 'reopen' && (await isResolved(sandbox.active.id)) === true
  const clickedReopen = await toggle()
  const shownOpen = await waitFor(
    `(() => {
      const t = document.querySelector(${J(scope)})
      return t?.querySelector('.pr-thread-resolve')?.getAttribute('data-action') === 'resolve' &&
        t.querySelector('.pr-thread-toggle')?.getAttribute('aria-expanded') === 'true'
    })()`,
    20000
  )
  const reopenedOnGitHub = await until(
    () => isResolved(sandbox.active.id),
    (v) => v === false,
    15000
  )
  check(
    'Reopen unresolves the thread on GitHub and expands it, offering Resolve again (FPRG-17)',
    wasResolved && clickedReopen && shownOpen === true && reopenedOnGitHub === false,
    `resolved before ${wasResolved}, clicked ${clickedReopen}, shown ${shownOpen === true ? 'expanded, Resolve' : 'unchanged'}, GitHub isResolved ${reopenedOnGitHub}`
  )
  await sleep(2500)

  // FPRG-19: a selection inside one hunk posts a thread anchored to its lines.
  await selectRange('modified', 6, 2, 7, 3)
  const held = await heldSelection()
  const draft = await openComposer()
  const anchoredBanner = await evaluate(
    `document.querySelector('.pr-diff-tab .diff-viewer-zone .comment-composer.general, .pr-diff-tab .diff-viewer-zone .comment-composer-banner') !== null`
  )
  const inHunk = `${MARK} anchored inside a hunk`
  const typedIn = await writeIntoComposer(inHunk)
  await ctrlEnter()
  const inHunkId = await postedThread(inHunk)
  const inHunkComment = await until(
    async () => (await reviewComments()).find((c) => c.body === inHunk) ?? null,
    (c) => c !== null,
    15000
  )
  const linesNow = (await sideLines('modified')) ?? []
  const inHunkZone = (await zones()).find((zone) => zone.threadId === inHunkId)
  check(
    'A selection inside a hunk posts a thread anchored to its lines on GitHub, drawn under its last line (FPRG-19)',
    held?.startLine === 6 &&
      held?.endLine === 7 &&
      draft !== null &&
      anchoredBanner === false &&
      typedIn === inHunk &&
      inHunkId !== null &&
      inHunkComment?.start_line === 6 &&
      inHunkComment.line === 7 &&
      inHunkComment.side === 'RIGHT' &&
      inHunkComment.path === FILE &&
      inHunkZone !== undefined &&
      lineAbove(inHunkZone, linesNow) === 7,
    `selected ${held?.startLine}-${held?.endLine}, banner ${anchoredBanner ? 'SHOWN' : 'none'}, GitHub ${inHunkComment ? `${inHunkComment.start_line}-${inHunkComment.line} ${inHunkComment.side}` : 'missing'}, drawn under ${inHunkZone ? lineAbove(inHunkZone, linesNow) : '-'}`
  )

  // FPRG-19, S1: a selection from one hunk to the other is anchored too.
  await selectRange('modified', 5, 2, 30, 3)
  const across = await heldSelection()
  const acrossDraft = await openComposer()
  const acrossBanner = await evaluate(
    `document.querySelector('.pr-diff-tab .diff-viewer-zone .comment-composer-banner') !== null`
  )
  const acrossText = `${MARK} anchored across two hunks`
  const typedAcross = await writeIntoComposer(acrossText)
  await ctrlEnter()
  const acrossId = await postedThread(acrossText)
  const acrossError = acrossId === null ? await composerError() : null
  const acrossComment = await until(
    async () => (await reviewComments()).find((c) => c.body === acrossText) ?? null,
    (c) => c !== null,
    15000
  )
  check(
    'A selection from one hunk to another posts a thread anchored to both ends on GitHub (FPRG-19, S1)',
    across?.startLine === 5 &&
      across?.endLine === 30 &&
      acrossDraft !== null &&
      acrossBanner === false &&
      typedAcross === acrossText &&
      acrossId !== null &&
      acrossComment?.start_line === 5 &&
      acrossComment.line === 30 &&
      acrossComment.side === 'RIGHT',
    `selected ${across?.startLine}-${across?.endLine}, banner ${acrossBanner ? 'SHOWN' : 'none'}, typed ${typedAcross === acrossText ? 'intact' : 'lost'}, GitHub ${acrossComment ? `${acrossComment.start_line}-${acrossComment.line}` : 'missing'}${acrossError ? `, composer says: ${acrossError}` : ''}`
  )

  // FPRG-20/21: a selection in an expanded unchanged region: the composer says,
  // before the first keystroke, that the comment will be general, and why.
  await clickByText('.file-tabs-toggle', 'Show unchanged')
  await sleep(1200)
  await selectRange('modified', 17, 2, 18, 3)
  const outside = await heldSelection()
  const outsideDraft = await openComposer()
  const before = await evaluate(`(() => {
    const c = document.querySelector('.pr-diff-tab .diff-viewer-zone:not(:has(.pr-thread)) .comment-composer')
    if (!c) return null
    return {
      general: c.classList.contains('general'),
      banner: c.querySelector('.comment-composer-banner[role="note"]')?.textContent.trim() ?? null,
      input: c.querySelector('.comment-composer-input')?.value ?? null
    }
  })()`)
  const banner = `GitHub only anchors comments to diff lines. This one will be posted as a general comment citing ${FILE}:L17–L18.`
  check(
    'A selection in an expanded unchanged region opens the composer with the general-comment banner before any keystroke (FPRG-20)',
    outside?.startLine === 17 &&
      outside?.endLine === 18 &&
      outsideDraft !== null &&
      before?.general === true &&
      before.banner === banner &&
      before.input === '',
    `selected ${outside?.startLine}-${outside?.endLine}, banner ${before?.banner === banner ? 'exact' : before?.banner ? 'other words' : 'absent'}, input ${before?.input === '' ? 'empty' : 'typed'}`
  )

  // FPRG-20: Preview renders the citation and the text as one comment.
  const selected = outside
    ? `${HEAD2_LINES[16].slice(outside.startColumn - 1)}\n${HEAD2_LINES[17].slice(0, outside.endColumn - 1)}`
    : ''
  const citation = `\`${FILE}:L17–L18\`\n\n\`\`\`\n${selected}\n\`\`\``
  const generalText = `${MARK} general from a selection`
  await writeIntoComposer(generalText)
  await evaluate(
    `[...document.querySelectorAll('.pr-diff-tab .diff-viewer-zone:not(:has(.pr-thread)) .comment-composer-tab')].find((t) => t.textContent.trim() === 'Preview')?.click()`
  )
  await sleep(400)
  const preview = await evaluate(`(() => {
    const c = document.querySelector('.pr-diff-tab .diff-viewer-zone:not(:has(.pr-thread)) .comment-composer')
    const bodies = c ? [...c.querySelectorAll('.comment-composer-preview')] : []
    const body = bodies[0]
    return body ? {
      count: bodies.length,
      cite: body.querySelector(':scope > p > code')?.textContent ?? null,
      quoted: body.querySelector('pre code')?.textContent ?? null,
      text: body.textContent
    } : null
  })()`)
  await evaluate(
    `[...document.querySelectorAll('.pr-diff-tab .diff-viewer-zone:not(:has(.pr-thread)) .comment-composer-tab')].find((t) => t.textContent.trim() === 'Write')?.click()`
  )
  await sleep(300)
  check(
    'Preview renders the citation, the quoted lines and the text as one comment (FPRG-20)',
    preview !== null &&
      preview.count === 1 &&
      preview.cite === `${FILE}:L17–L18` &&
      lf(preview.quoted).replace(/\n$/, '') === selected &&
      preview.text.includes(generalText),
    preview
      ? `${preview.count} rendered, citation ${preview.cite === `${FILE}:L17–L18` ? 'exact' : 'other'}, quote ${lf(preview.quoted).replace(/\n$/, '') === selected ? 'exact' : 'other'}, text ${preview.text.includes(generalText) ? 'there' : 'missing'}`
      : 'no preview'
  )

  // FPRG-21: posted as a general PR comment with the citation, never anchored.
  await evaluate(
    `document.querySelector('.pr-diff-tab .diff-viewer-zone:not(:has(.pr-thread)) .comment-composer-post:not([disabled])')?.click()`
  )
  const closed = await waitFor(
    `![...document.querySelectorAll('.pr-diff-tab .diff-viewer-zone')].some((z) => z.querySelector('.comment-composer') && !z.querySelector('.pr-thread'))`,
    20000,
    300
  )
  const posted = await until(
    async () => (await issueComments()).find((c) => lf(c.body).includes(generalText)) ?? null,
    (c) => c !== null,
    15000
  )
  const anchoredToo = (await reviewComments()).some((c) => String(c.body).includes(generalText))
  check(
    'It posts as a general PR comment: citation, quoted lines, then the text — and no anchored thread (FPRG-21)',
    closed === true &&
      posted !== null &&
      lf(posted.body) === `${citation}\n\n${generalText}` &&
      !anchoredToo,
    `composer ${closed === true ? 'closed' : 'still open'}, GitHub ${posted ? (lf(posted.body) === `${citation}\n\n${generalText}` ? 'exact body' : 'other body') : 'missing'}, anchored ${anchoredToo}`
  )

  // FPRG-23: the Overview's general comment posts at once, and lists in General.
  await showOverview()
  const overviewText = `${MARK} general from the overview`
  const input = await centre('.pr-overview > .pr-overview-section .comment-composer-input')
  if (input) await click(input)
  await send('Input.insertText', { text: overviewText })
  await evaluate(
    `document.querySelector('.pr-overview .comment-composer-post:not([disabled])')?.click()`
  )
  const listed = await waitFor(
    `[...document.querySelectorAll('.pr-overview ul.pr-overview-timeline > li')].some((li) => li.querySelector('.pr-overview-timeline-author')?.textContent.trim() !== 'You' && li.textContent.includes(${J(overviewText)}))`,
    30000,
    300
  )
  const onGitHub = await until(
    async () => (await issueComments()).find((c) => c.body === overviewText) ?? null,
    (c) => c !== null,
    15000
  )
  const emptied = await evaluate(
    `[...document.querySelectorAll('.pr-overview .comment-composer-input')].every((e) => e.value === '')`
  )
  check(
    'The Overview general comment posts at once as a PR comment and lists in General under its author (FPRG-23)',
    listed === true && onGitHub !== null && emptied,
    `listed ${listed === true}, GitHub ${onGitHub ? 'has it' : 'missing'}, composer empty ${emptied}`
  )

  // FPRG-25: a GitHub PR reloads under F4's rules — a focus reloads it,
  // another within 5 s does not, one after 5 s does.
  await waitFor(idle, 30000, 200)
  await sleep(5500) // out of any earlier focus's debounce window
  const focus = `window.dispatchEvent(new Event('focus'))`
  await armLoadingWatch()
  await evaluate(focus)
  await waitFor(`${idle} && (window.__smokeLoads ?? 0) > 0`, 30000, 100)
  const first = await loadsSeen()
  await evaluate(focus)
  await sleep(1500)
  const second = (await loadsSeen()) - first
  await sleep(4200)
  await evaluate(focus)
  await waitFor(`${idle} && (window.__smokeLoads ?? 0) > ${first}`, 30000, 100)
  const third = (await loadsSeen()) - first - second
  check(
    'A window focus reloads the GitHub pull request; another within 5 s does not; one after 5 s does (FPRG-25)',
    first === 1 && second === 0 && third === 1,
    `reloads ${first} / ${second} / ${third}`
  )

  // FPRG-25: a commit pushed elsewhere raises F4's banner on the next reload,
  // and Reload diffs reads the open diff at the new head.
  await waitFor(idle, 30000, 200)
  const quietBefore = await evaluate(
    `document.querySelector('.pr-overview-banner') === null && document.querySelector('.pr-diff-banner') === null`
  )
  writeFileSync(join(sandbox.local, FILE), text(HEAD3_LINES))
  git(['commit', '-q', '-a', '-m', 'Smoke head a third time'], sandbox.local)
  const head3 = git(['rev-parse', 'HEAD'], sandbox.local)
  sandbox.push('origin', sandbox.head)
  const moved = await until(
    async () => (await gh('GET', `${sandbox.repoPath}/pulls/${sandbox.pr}`)).head.sha,
    (sha) => sha === head3,
    30000
  )
  await evaluate(`document.querySelector('.pr-overview-toolbar .pr-overview-button')?.click()`)
  const raised = await waitFor(
    `document.querySelector('.pr-overview-banner')?.textContent.includes('New changes were pushed to this pull request.') === true`,
    30000,
    300
  )
  await clickByText('.pr-overview-banner .pr-overview-button', 'Reload diffs')
  await evaluate(
    `[...document.querySelectorAll('.file-tab .file-tab-label')].find((e) => e.getAttribute('title') === ${J(FILE)} && e.querySelector('.file-tab-glyph'))?.click()`
  )
  await waitFor(
    `document.querySelector('.pr-diff-tab .editor.modified .view-line') !== null`,
    30000,
    300
  )
  // The tab reads its sides again and mounts a new editor; wait for it.
  const line35 = await until(
    async () => {
      await bringIntoView('modified', 35)
      return ((await sideLines('modified')) ?? []).find((l) => l.n === 35)?.text ?? null
    },
    (t) => t === HEAD3_LINES[34],
    30000
  )
  const reread = await sideMismatches('modified', HEAD3_LINES)
  const cleared = await evaluate(
    `document.querySelector('.pr-diff-banner') === null && document.querySelector('.pr-overview-banner') === null`
  )
  check(
    'A commit pushed elsewhere raises the new-changes banner; Reload diffs shows the new head (FPRG-25)',
    quietBefore === true &&
      moved === head3 &&
      raised === true &&
      reread.wrong === 0 &&
      line35 === HEAD3_LINES[34] &&
      cleared === true,
    `banner before ${quietBefore ? 'none' : 'SHOWN'}, after the push ${raised === true ? 'raised' : 'absent'}; reloaded diff ${reread.wrong === 0 && line35 === HEAD3_LINES[34] ? 'at the new head' : `stale (${reread.wrong ?? '?'} lines differ, line 35 "${line35}")`}, banner ${cleared ? 'cleared' : 'still shown'}`
  )
}

/** Watches the Overview's refresh button for "Refreshing…" from now on (as F4's smoke). */
const armLoadingWatch = () =>
  evaluate(`(() => {
    window.__smokeLoads = 0
    let was = false
    const look = () => {
      const now = (document.querySelector('.pr-overview-toolbar .pr-overview-button')?.textContent ?? '').includes('Refreshing')
      if (now && !was) window.__smokeLoads++
      was = now
    }
    window.__smokeObserver?.disconnect()
    window.__smokeObserver = new MutationObserver(look)
    window.__smokeObserver.observe(document.body, { subtree: true, childList: true, characterData: true })
    return true
  })()`)

const loadsSeen = () => evaluate(`window.__smokeLoads ?? 0`)
const idle = `!(document.querySelector('.pr-overview-toolbar .pr-overview-button')?.textContent ?? '').includes('Refreshing')`

/* --------------------------------------------------------------- main -- */

/** T27: the refusal, against fixtures with fictitious names, every run. */
function guardSelfTest() {
  const fork = { fork: true, full_name: 'acme/widget', parent: { full_name: 'contoso/widget' } }
  const pr = (base, draft) => ({
    draft,
    base: { repo: { full_name: base } },
    head: { repo: { full_name: 'acme/widget' } }
  })
  const cases = [
    [
      'a repository that is not a fork',
      writeRefusal('contoso/widget', { fork: false, full_name: 'contoso/widget' }, null) !== null
    ],
    [
      'a pull request based on the upstream',
      writeRefusal('acme/widget', fork, pr('contoso/widget', true)) !== null
    ],
    [
      'a pull request that is not a draft',
      writeRefusal('acme/widget', fork, pr('acme/widget', false)) !== null
    ],
    [
      'a draft inside the fork is allowed',
      writeRefusal('acme/widget', fork, pr('acme/widget', true)) === null
    ]
  ]
  const wrong = cases.filter(([, ok]) => !ok).map(([label]) => label)
  check(
    '--allow-writes refuses a repository that is not a fork, a PR based on the upstream, and a PR that is not a draft (T27)',
    wrong.length === 0,
    wrong.length === 0 ? 'all four as expected' : `wrong for ${wrong.join(', ')}`
  )
}

let failed = 1
let cleaned = null
try {
  guardSelfTest()
  if (WRITES) await buildSandbox()
  await launch('main')
  await connect()
  if (runs('chip')) await chipSignedIn()
  if (runs('overview') || runs('diff') || runs('writes')) {
    const ready = WRITES && sandbox.alt !== null ? pickerShown : titleShown
    if (!(await enterPullRequestMode(ready)))
      throw new Error('The Overview never showed a pull request')
    fx = { picker: (await evaluate(pickerShown)) ? await pickerOptions() : null }
    if (
      fx.picker !== null &&
      !(await choosePr(WRITES ? sandbox.pr : fx.picker[0].text.match(/#(\d+) /)[1]))
    ) {
      throw new Error('Picking the pull request showed nothing')
    }
    await readFixture()
    if (fx.detail === null) throw new Error('The app found no pull request for the branch')
    if (runs('overview')) await overviewSection()
    if (runs('diff')) await diffSection()
    if (WRITES && runs('writes')) await writesSection()
  }
  const keep = process.env.SMOKE_KEEP === '1'
  if (!keep) await stopApp()
  if (!WRITES && runs('chip') && !keep) await chipVariants()
  failed = checks.filter((c) => !c.ok).length
  console.log(
    `\n${checks.length - failed}/${checks.length} checks passed${WRITES ? ' (with writes)' : ' (read-only)'}${skipped.length ? `, ${skipped.length} skipped` : ''}`
  )
} catch (err) {
  console.error(`Aborted: ${err instanceof Error ? err.message : String(err)}`)
} finally {
  try {
    cleaned = await cleanupSandbox()
  } catch (err) {
    console.error(`CLEANUP FAILED: ${err instanceof Error ? err.message : String(err)}`)
    failed = failed || 1
  }
  if (cleaned) {
    const ok = cleaned.left === 0 && cleaned.closed === cleaned.prs && cleaned.branchesLeft === 0
    console.log(
      `Cleanup: ${cleaned.deleted} smoke comments deleted, ${cleaned.left} left; ${cleaned.closed}/${cleaned.prs} pull requests closed; ${cleaned.branches - cleaned.branchesLeft}/${cleaned.branches} branches deleted`
    )
    if (!ok) failed = failed || 1
  }
  if (process.env.SMOKE_KEEP === '1' && app !== null) {
    // For iterating on a check: the app stays up until this script is killed.
    console.log(`SMOKE_KEEP: app left running on port ${PORT}; stop this script to end it`)
    await new Promise(() => setInterval(() => {}, 60000))
  }
  await teardown()
  console.log(`App stopped; ${existsSync(DIR) ? 'temp folder LEFT' : 'temp folder removed'}.`)
}
process.exit(failed ? 1 : 0)
