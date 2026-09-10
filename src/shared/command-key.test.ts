import { describe, expect, it } from 'vitest'
import { commandKey } from './command-key'

describe('commandKey', () => {
  it('maps an absolute path and a bare name to the same agent', () => {
    const path =
      'C:\\Users\\x\\AppData\\Roaming\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe'
    expect(commandKey(path)).toBe('opencode')
    expect(commandKey('opencode')).toBe('opencode')
  })

  it('lowercases, so a case-variant registry entry still resolves', () => {
    expect(commandKey('CLAUDE')).toBe('claude')
    expect(commandKey('OpenCode')).toBe('opencode')
  })

  it('strips .cmd and .bat suffixes, not just .exe', () => {
    expect(commandKey('setup.cmd')).toBe('setup')
    expect(commandKey('run.bat')).toBe('run')
  })

  it('keeps a bare path segment intact', () => {
    expect(commandKey('my-tool')).toBe('my-tool')
  })
})