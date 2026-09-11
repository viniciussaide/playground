/**
 * session-resume-on-respawn spike — RECORD the interactive exit output of a
 * coding agent so the resume-hint pattern can be derived from real output and
 * shipped as a test fixture (RSMR-10, the project's recorded-fixture rule).
 *
 * Throwaway, owner-run: `node scripts/session-resume-spike/record.mjs <agent>`
 * where <agent> is `claude` or `opencode`. Spawns the agent in a PTY (node-pty,
 * the same library the app uses), sends `/exit`, and dumps the captured output
 * to `.specs/features/session-resume-on-respawn/fixtures/<agent>-exit.raw.txt`
 * (raw) and `-stripped.txt` (ANSI removed) plus a `-tail.txt` (last 60 lines,
 * the realistic scan window).
 *
 * No testable logic lives here — it is the external-CLI boundary (repo
 * convention for spike harnesses, AD-004 / WF1).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pty from 'node-pty'

const AGENT_EXE = {
  claude: 'node_modules/@anthropic-ai/claude-code/bin/claude.exe',
  opencode: 'node_modules/opencode-ai/bin/opencode.exe'
}

const STARTUP_MS = 10000
const EXIT_GRACE_MS = 6000
const ENTER_GRACE_MS = 4000
const CTRL_C_GRACE_MS = 2000

const agent = process.argv[2]
if (!agent || !(agent in AGENT_EXE)) {
  console.error('usage: node scripts/session-resume-spike/record.mjs <claude|opencode>')
  process.exit(1)
}

const exe = join(process.env.APPDATA ?? '', 'npm', AGENT_EXE[agent])
const scratch = join(tmpdir(), 'playground-resume-spike', agent)
mkdirSync(scratch, { recursive: true })

const outDir = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(
  outDir,
  '..',
  '..',
  '.specs',
  'features',
  'session-resume-on-respawn',
  'fixtures'
)
mkdirSync(fixtureDir, { recursive: true })

const proc = pty.spawn(exe, [], {
  name: 'xterm-256color',
  cols: 120,
  rows: 40,
  cwd: scratch,
  env: { ...process.env }
})

let raw = ''
proc.onData((data) => {
  process.stdout.write(data)
  raw += data
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const stripAnsi = (s) =>
  s.replace(
    // eslint-disable-next-line no-control-regex
    new RegExp('\\u001b\\[[0-9;?]*[ -/]*[@-~]', 'g'),
    ''
  )

async function main() {
  console.log(`\n[spike] spawned ${agent} in ${scratch}; waiting ${STARTUP_MS}ms for the TUI…`)
  await sleep(STARTUP_MS)
  console.log(`[spike] sending /exit`)
  proc.write('/exit\r')
  await sleep(EXIT_GRACE_MS)
  if (!proc.exitCode && !proc.exitSignal) {
    console.log('[spike] still alive; sending Enter once more')
    proc.write('\r')
    await sleep(ENTER_GRACE_MS)
  }
  if (!proc.exitCode && !proc.exitSignal) {
    console.log('[spike] still alive; sending bare exit')
    proc.write('exit\r')
    await sleep(ENTER_GRACE_MS)
  }
  if (!proc.exitCode && !proc.exitSignal) {
    console.log('[spike] still alive; sending Ctrl+C')
    proc.write('\x03')
    await sleep(CTRL_C_GRACE_MS)
  }
  if (!proc.exitCode && !proc.exitSignal) {
    console.log('[spike] still alive; killing')
    proc.kill()
  }

  const stripped = stripAnsi(raw)
  const lines = stripped.split('\n').filter((l) => l.trim() !== '')
  const tail = lines.slice(-60).join('\n')

  writeFileSync(join(fixtureDir, `${agent}-exit.raw.txt`), raw)
  writeFileSync(join(fixtureDir, `${agent}-exit.stripped.txt`), stripped)
  writeFileSync(join(fixtureDir, `${agent}-exit.tail.txt`), tail)

  console.log(`\n[spike] wrote ${fixtureDir}/${agent}-exit.{raw,stripped,tail}.txt`)
  console.log(`[spike] raw bytes: ${raw.length}; stripped lines: ${lines.length}`)
}

main().catch((err) => {
  console.error('[spike] failed', err)
  process.exitCode = 1
})
