import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PersistedSession } from '../shared/config'
import type { AgentDef } from './spawn-plan'
import { extractResumeId, resolveMechanism, resolveResumeArgs } from './resume-mechanism'

const FIXTURES = join(
  process.cwd(),
  '.specs',
  'features',
  'session-resume-on-respawn',
  'fixtures'
)
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8')

const AGENTS: AgentDef[] = [
  { name: 'Claude', command: 'claude', args: [] },
  { name: 'opencode', command: 'opencode', args: [] },
  { name: 'Codex', command: 'codex', args: ['--full-auto'] }
]
const CWD = 'C:\\work\\repo-feature'
const ses = (
  id: string,
  agent: string,
  cwd: string,
  extra: Partial<PersistedSession> = {}
): PersistedSession => ({ id, agent, cwd, title: `${agent} · x`, status: 'stopped', ...extra })

describe('resolveMechanism (RSMR-13/16)', () => {
  it('resolves opencode to id and claude to continue', () => {
    expect(resolveMechanism('opencode')?.kind).toBe('id')
    expect(resolveMechanism('claude')?.kind).toBe('continue')
  })

  it('keys on the normalized command, not the display name or path', () => {
    expect(resolveMechanism('C:\\tools\\opencode.exe')?.kind).toBe('id')
    expect(resolveMechanism('OpenCode')?.kind).toBe('id')
  })

  it('resolves null for agents with no known mechanism', () => {
    expect(resolveMechanism('codex')).toBeNull()
    expect(resolveMechanism('pwsh')).toBeNull()
  })
})

describe('extractResumeId (RSMR-14, last match wins)', () => {
  it('pulls a real opencode session id from the recorded sample', () => {
    const mech = resolveMechanism('opencode')!
    expect(extractResumeId(fixture('opencode-session-list.json'), mech)).toBe(
      'ses_fa640905fffe5E4OeSEH33fBLM'
    )
  })

  it('returns the LAST ses_ token, so the exit hint supersedes an earlier token', () => {
    const mech = resolveMechanism('opencode')!
    expect(extractResumeId('tool ses_old one\nopencode --session ses_new', mech)).toBe('ses_new')
  })

  it('returns null when no id appears, and never for a continue mechanism', () => {
    const mech = resolveMechanism('opencode')!
    expect(extractResumeId('no session here', mech)).toBeNull()
    expect(extractResumeId('any text at all', resolveMechanism('claude')!)).toBeNull()
  })
})

describe('recorded mechanisms are proven by the CLI help (RSMR-15)', () => {
  it('opencode help documents --session', () => {
    expect(fixture('opencode-help.txt')).toContain('--session')
  })

  it('claude help documents --continue', () => {
    expect(fixture('claude-help.txt')).toContain('--continue')
  })
})

describe('resolveResumeArgs (RSMR-09..13, RSMR-23/24)', () => {
  it('id agent: injects the captured id of the matching session', () => {
    const sessions = [ses('s1', 'Claude', CWD), ses('s2', 'opencode', CWD, { agentSessionId: 'ses_aaa' })]
    expect(resolveResumeArgs(sessions, AGENTS, CWD, 'opencode')).toEqual(['--session', 'ses_aaa'])
  })

  it('id agent: several matches → the LAST in array order wins (RSMR-24)', () => {
    const sessions = [
      ses('s1', 'opencode', CWD, { agentSessionId: 'ses_aaa' }),
      ses('s2', 'opencode', CWD, { agentSessionId: 'ses_bbb' })
    ]
    expect(resolveResumeArgs(sessions, AGENTS, CWD, 'opencode')).toEqual(['--session', 'ses_bbb'])
  })

  it('id agent: a different agent id is never injected (RSMR-11)', () => {
    const sessions = [ses('s1', 'Claude', CWD, { agentSessionId: 'ses_aaa' })]
    expect(resolveResumeArgs(sessions, AGENTS, CWD, 'opencode')).toEqual([])
  })

  it('id agent: no prior session in cwd → fresh (RSMR-12)', () => {
    expect(resolveResumeArgs([], AGENTS, CWD, 'opencode')).toEqual([])
  })

  it('continue agent: any prior session in cwd → --continue (RSMR-10)', () => {
    const sessions = [ses('s1', 'Claude', CWD)]
    expect(resolveResumeArgs(sessions, AGENTS, CWD, 'claude')).toEqual(['--continue'])
  })

  it('continue agent: no prior session → fresh (RSMR-23)', () => {
    expect(resolveResumeArgs([], AGENTS, CWD, 'claude')).toEqual([])
  })

  it('no mechanism → fresh even with a matching session (RSMR-16/17)', () => {
    const sessions = [ses('s1', 'Claude', CWD, { agentSessionId: 'ses_aaa' })]
    expect(resolveResumeArgs(sessions, AGENTS, CWD, 'codex')).toEqual([])
  })

  it('an absolute-path registry command still matches the requested bare name (RSMR-13)', () => {
    const agents = [...AGENTS, { name: 'OpenCode', command: 'C:\\tools\\opencode.exe', args: [] }]
    const sessions = [ses('s1', 'OpenCode', CWD, { agentSessionId: 'ses_ccc' })]
    expect(resolveResumeArgs(sessions, agents, CWD, 'opencode')).toEqual(['--session', 'ses_ccc'])
  })

  it('ad-hoc sessions never match (no registry def)', () => {
    const sessions = [ses('s1', 'Ad-hoc', CWD, { command: 'npm run dev' })]
    expect(resolveResumeArgs(sessions, AGENTS, CWD, 'opencode')).toEqual([])
  })
})