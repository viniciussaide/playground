import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { PersistedSession, SessionView } from '../shared/config'
import type { IpcEvent, IpcEvents } from '../shared/ipc-contract'
import type { ConfigStore } from './config-store'
import type { PtyHandle, PtyPort } from './pty-port'
import {
  extractResumeId,
  resolveMechanism,
  resolveResumeArgs,
  type ResumeMechanism
} from './resume-mechanism'
import { SessionRingBuffer } from './session-ring-buffer'
import { buildRawSpawnPlan, buildSpawnPlan, type AgentDef } from './spawn-plan'

/** Typed main→renderer push, bound to the live window's webContents by index.ts. */
export type EmitFn = <E extends IpcEvent>(channel: E, payload: IpcEvents[E]) => void

export interface SessionManagerDeps {
  port: PtyPort
  config: ConfigStore
  emit: EmitFn
  /** Injectable for reconcile tests (fs.existsSync in production). */
  fsExists: (path: string) => boolean
}

/** Stored on ad-hoc sessions in place of a registry agent name. */
const ADHOC_AGENT = 'Ad-hoc'

/**
 * How long `stop` waits for the PTY's *real* exit before giving up and letting
 * the caller proceed (WRFT-05 AC 1/2). A wedged child must not block a worktree
 * removal forever — the deleter's own retry loop and leftover report cover the
 * residue.
 */
export const SESSION_EXIT_WAIT_MS = 3000

/** Bound on the ANSI-stripped capture window re-scanned for a resume id. */
const CAPTURE_TAIL_MAX = 4096

/** Minimal CSI/OSC escape stripper for the capture window — raw PTY bytes carry
 * colour codes, and a resume hint can be painted inside an escape sequence.
 * Built from a string so no raw control characters live in the source (same
 * shape as the renderer's `ansi.ts`). */
const ANSI_STRIP = new RegExp(
  '\\u001b\\[[0-9;?]*[ -/]*[@-~]|\\u001b\\][^\\u0007\\u001b]*(?:\\u0007|\\u001b\\\\)', // eslint-disable-line no-control-regex
  'g'
)

/** A session with a live PTY. Stopped/restored sessions live only in config. */
interface RunningSession {
  meta: PersistedSession
  handle: PtyHandle
  buffer: SessionRingBuffer
  /** Resolves when the PTY's own onExit fires — what `stop` actually waits on. */
  exited: Promise<void>
  /** Resume mechanism resolved at spawn; null for ad-hoc and unknown agents. */
  mechanism: ResumeMechanism | null
  /** ANSI-stripped rolling tail of the stream, re-scanned for a resume id. */
  captureTail: string
  /** Latest resume id seen in the stream; persisted at finalize (RSMR-02/03). */
  retainedId: string | null
}

/**
 * Owns every agent session's lifecycle, persistence, and stream routing — the
 * single caller of `PtyPort`/`buildSpawnPlan`/`ConfigStore` for sessions
 * (PRD §Modules). DI'd like `TaskBoard` so the orchestration logic — the risky
 * part — is unit-tested without Electron or a real PTY.
 *
 * Config (`AppConfig.sessions`) is the source of truth for *which* sessions
 * exist; the `running` Map is the subset with a live PTY. Status is derived
 * from Map membership so it can never drift. Only the **attached** session
 * streams `session:data`; the rest keep buffering in main (AD-004).
 */
export class SessionManager {
  readonly #running = new Map<string, RunningSession>()
  /** A stopped session's last scrollback, kept so its card can show a 2-line
   * preview. Cleared on respawn/remove; absent for sessions restored from disk
   * (the PTY — and its buffer — never survive a restart). */
  readonly #retained = new Map<string, SessionRingBuffer>()
  #activeId: string | null = null

  constructor(private readonly deps: SessionManagerDeps) {
    // PTYs never survive a restart (no daemon — PRD Out of Scope); normalize any
    // session persisted as running back to stopped so cards reappear respawnable.
    const sessions = deps.config.get().sessions
    if (sessions.some((s) => s.status !== 'stopped')) {
      deps.config.patch({ sessions: sessions.map((s) => ({ ...s, status: 'stopped' as const })) })
    }
  }

  /** Persisted ∪ running, reconciled: status from Map membership, pathMissing from fs. */
  list(): SessionView[] {
    return this.deps.config.get().sessions.map((s) => this.#toView(s))
  }

  spawn(agentName: string, cwd: string, adhocCommand?: string): SessionView {
    const leaf = basename(cwd) || cwd
    const meta: PersistedSession = adhocCommand
      ? {
          id: randomUUID(),
          agent: ADHOC_AGENT,
          cwd,
          title: `${ADHOC_AGENT} · ${leaf}`,
          status: 'running',
          command: adhocCommand
        }
      : {
          id: randomUUID(),
          agent: this.#resolve(agentName).name,
          cwd,
          title: `${this.#resolve(agentName).name} · ${leaf}`,
          status: 'running'
        }
    // A brand-new spawn in a cwd reuses the last captured conversation of the
    // same agent there (RSMR-09/10); ad-hoc commands never resume (RSMR-17).
    const resumeArgs = adhocCommand
      ? []
      : resolveResumeArgs(
          this.deps.config.get().sessions,
          this.deps.config.get().agents,
          cwd,
          this.#resolve(agentName).command
        )
    this.#start(meta, resumeArgs) // throws on a bad cwd/shell/agent before anything is persisted
    this.#persistUpsert(meta)
    return this.#toView(meta)
  }

  /** Rename a session's title; trimmed empty input keeps the prior title. */
  rename(id: string, title: string): SessionView {
    const meta = this.deps.config.get().sessions.find((s) => s.id === id)
    if (!meta) throw new Error(`Unknown session: ${id}`)
    const trimmed = title.trim()
    if (trimmed === '' || trimmed === meta.title) return this.#toView(meta)
    const renamed: PersistedSession = { ...meta, title: trimmed }
    this.#persistUpsert(renamed)
    const live = this.#running.get(id)
    if (live) live.meta = { ...live.meta, title: trimmed }
    return this.#toView(renamed)
  }

  /** Clone a session's agent + cwd (+ ad-hoc command) into a new running one.
   * A duplicate is a second agent run: it never inherits the captured
   * conversation id, so it starts fresh (RSMR-21). */
  duplicate(id: string): SessionView {
    const src = this.deps.config.get().sessions.find((s) => s.id === id)
    if (!src) throw new Error(`Unknown session: ${id}`)
    const leaf = basename(src.cwd) || src.cwd
    const meta: PersistedSession = {
      id: randomUUID(),
      agent: src.agent,
      cwd: src.cwd,
      title: `${src.agent} · ${leaf}`,
      status: 'running',
      ...(src.command ? { command: src.command } : {})
    }
    this.#start(meta, [])
    this.#persistUpsert(meta)
    return this.#toView(meta)
  }

  /**
   * Kill the PTY and resolve once it has **really exited** (WRFT-05). Killing a
   * shell does not kill its children, so a caller that deletes files the moment
   * `stop` returns used to race handles that were still open — the removal then
   * failed on a lock the app itself was holding.
   *
   * The status flip stays synchronous: `#finalize` runs before the first await,
   * so every existing caller that reads `list()` right after `stop` still sees
   * `stopped`. Only the returned promise is new, and it means "really gone".
   */
  async stop(id: string): Promise<void> {
    const session = this.#running.get(id)
    if (!session) return
    // Captured before #finalize drops the Map entry.
    const exited = session.exited
    session.handle.kill()
    this.#finalize(id)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        exited,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, SESSION_EXIT_WAIT_MS)
          // Unlike lesson L-003's grace timer — whose unref let real work be
          // skipped when the process was free to exit — this timer only races a
          // promise a live caller is already awaiting, so unref cannot skip
          // anything. It just stops a PTY that never exits from pinning the
          // event loop open.
          timer.unref?.()
        })
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  respawn(id: string): SessionView {
    const meta = this.deps.config.get().sessions.find((s) => s.id === id)
    if (!meta) throw new Error(`Unknown session: ${id}`)
    if (this.#running.has(id)) return this.#toView(meta)
    this.#retained.delete(id) // fresh PTY → drop the stale preview buffer
    // Respawn resumes the conversation: the session's own captured id for
    // id-mechanism agents, the continue flag for continue agents (RSMR-05/06).
    const mechanism = meta.command ? null : resolveMechanism(this.#resolve(meta.agent).command)
    const resumeArgs = this.#resumeArgsFor(meta, mechanism)
    const live: PersistedSession = { ...meta, status: 'running' }
    this.#start(live, resumeArgs)
    this.#persistUpsert(live)
    this.deps.emit('session:status', {
      id,
      status: 'running',
      pathMissing: !this.deps.fsExists(live.cwd)
    })
    return this.#toView(live)
  }

  remove(id: string): void {
    if (this.#running.has(id)) throw new Error(`Cannot remove a running session: ${id}`)
    this.#retained.delete(id)
    const sessions = this.deps.config.get().sessions.filter((s) => s.id !== id)
    this.deps.config.patch({ sessions })
  }

  attach(id: string): void {
    this.#activeId = id
    const session = this.#running.get(id)
    // Replay rides the same ordered data channel as live deltas → no seam race.
    if (session) this.deps.emit('session:data', { id, data: session.buffer.snapshot() })
  }

  detach(id: string): void {
    if (this.#activeId === id) this.#activeId = null
  }

  input(id: string, data: string): void {
    this.#running.get(id)?.handle.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    // node-pty throws on zero/negative dims (a fit() before layout).
    if (cols > 0 && rows > 0) this.#running.get(id)?.handle.resize(cols, rows)
  }

  /** window-all-closed: leave no orphaned shell/agent process. */
  killAll(): void {
    // stop() each session (not Map.clear()) so every status is finalized,
    // persisted, and emitted — otherwise config stays stale until the next
    // restart, observable on macOS where closing the last window doesn't quit.
    //
    // Deliberately fire-and-forget: stop() now waits up to SESSION_EXIT_WAIT_MS
    // for a real exit, and quit must not stall 3 s per session. Nothing is lost
    // by not awaiting — the kill is issued and #finalize has already persisted
    // every status synchronously before stop() suspends. Only the *removal*
    // path needs the exit guarantee; quit does not.
    for (const id of [...this.#running.keys()]) void this.stop(id)
    this.#activeId = null
  }

  #resolve(agentName: string): AgentDef {
    const agent = this.deps.config.get().agents.find((a) => a.name === agentName)
    if (!agent) throw new Error(`Unknown agent: ${agentName}`)
    return agent
  }

  /** The resume args for a respawn: the session's captured id, the continue
   * flag, or nothing when the agent has no mechanism (RSMR-05/06/07). */
  #resumeArgsFor(meta: PersistedSession, mechanism: ResumeMechanism | null): string[] {
    if (!mechanism) return []
    if (mechanism.kind === 'continue') return mechanism.args
    return meta.agentSessionId ? mechanism.args(meta.agentSessionId) : []
  }

  /** Spawn the PTY for a meta and wire its streams; registers the Map entry. */
  #start(meta: PersistedSession, resumeArgs: string[] = []): void {
    const shell = this.deps.config.get().ui.defaultShell
    const mechanism = meta.command ? null : resolveMechanism(this.#resolve(meta.agent).command)
    const plan = meta.command
      ? buildRawSpawnPlan(meta.command, meta.cwd, shell)
      : buildSpawnPlan(this.#resolve(meta.agent), meta.cwd, shell, resumeArgs)
    const handle = this.deps.port.spawn(plan)
    const buffer = new SessionRingBuffer()
    let markExited = (): void => {}
    const exited = new Promise<void>((resolve) => {
      markExited = resolve
    })
    const session: RunningSession = {
      meta: { ...meta, status: 'running' },
      handle,
      buffer,
      exited,
      mechanism,
      captureTail: '',
      retainedId: null
    }
    handle.onData((data) => {
      buffer.append(data)
      // Continuous resume-id capture (RSMR-01/02): id-mechanism agents get their
      // conversation id retained the moment it appears — including a hint split
      // across chunks or painted inside ANSI escapes (RSMR-18) — so app close
      // can persist it before the PTY is killed (RSMR-04).
      if (session.mechanism?.kind === 'id') {
        session.captureTail = (session.captureTail + data.replace(ANSI_STRIP, '')).slice(
          -CAPTURE_TAIL_MAX
        )
        const id = extractResumeId(session.captureTail, session.mechanism)
        if (id !== null) session.retainedId = id
      }
      if (this.#activeId === meta.id) this.deps.emit('session:data', { id: meta.id, data })
    })
    handle.onExit(({ exitCode }) => {
      markExited()
      this.#finalize(meta.id, exitCode)
    })
    this.#running.set(meta.id, session)
  }

  /** Idempotent transition to stopped: drop the Map entry, persist, push status. */
  #finalize(id: string, exitCode?: number): void {
    // wasRunning is false when an explicit stop() already dropped the entry. We
    // still emit session:exit on the real onExit so listeners (TerminalPane's
    // "[shell exited with code …]") fire even after a stop() — only the
    // redundant persist/status push is skipped.
    const session = this.#running.get(id)
    if (session) this.#retained.set(id, session.buffer) // keep scrollback for the preview
    const wasRunning = this.#running.delete(id)
    if (wasRunning && session) {
      // One patch carries both the status flip and any freshly captured resume
      // id (RSMR-03/04/08). Runs synchronously inside stop(), so killAll's
      // fire-and-forget quit lands the id in config before the PTY dies.
      const stopped: PersistedSession = {
        ...session.meta,
        status: 'stopped',
        ...(session.retainedId ? { agentSessionId: session.retainedId } : {})
      }
      this.#persistUpsert(stopped)
      this.deps.emit('session:status', {
        id,
        status: 'stopped',
        pathMissing: !this.deps.fsExists(stopped.cwd)
      })
    }
    if (exitCode !== undefined) this.deps.emit('session:exit', { id, exitCode })
  }

  #persistUpsert(meta: PersistedSession): void {
    const sessions = this.deps.config.get().sessions
    const exists = sessions.some((s) => s.id === meta.id)
    const next = exists ? sessions.map((s) => (s.id === meta.id ? meta : s)) : [...sessions, meta]
    this.deps.config.patch({ sessions: next })
  }

  #toView(meta: PersistedSession): SessionView {
    const preview = this.#retained.get(meta.id)?.tail(2)
    return {
      ...meta,
      status: this.#running.has(meta.id) ? 'running' : 'stopped',
      pathMissing: !this.deps.fsExists(meta.cwd),
      ...(preview ? { lastOutput: preview } : {})
    }
  }
}
