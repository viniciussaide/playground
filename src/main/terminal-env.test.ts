import { describe, expect, it } from 'vitest'
import { PTY_ENV_FORCED, buildPtyEnv } from './terminal-env'

describe('buildPtyEnv', () => {
  it('forces TERM, COLORTERM and TERM_PROGRAM (INPUT-01, INPUT-02)', () => {
    const env = buildPtyEnv({})
    expect(env.TERM).toBe('xterm-256color')
    expect(env.COLORTERM).toBe('truecolor')
    expect(env.TERM_PROGRAM).toBe('WezTerm')
  })

  it('preserves the rest of the parent environment', () => {
    const env = buildPtyEnv({ PATH: 'C:\\bin', HOME: 'C:\\Users\\dev' })
    expect(env.PATH).toBe('C:\\bin')
    expect(env.HOME).toBe('C:\\Users\\dev')
  })

  it('overrides the forced vars even when the parent sets them', () => {
    const env = buildPtyEnv({ TERM: 'xterm', TERM_PROGRAM: 'vscode', COLORTERM: '' })
    expect(env.TERM).toBe(PTY_ENV_FORCED.TERM)
    expect(env.TERM_PROGRAM).toBe(PTY_ENV_FORCED.TERM_PROGRAM)
    expect(env.COLORTERM).toBe(PTY_ENV_FORCED.COLORTERM)
  })
})
