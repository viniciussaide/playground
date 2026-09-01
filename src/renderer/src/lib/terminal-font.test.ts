import { describe, expect, it } from 'vitest'
import { FONT_STACK_DEFAULT, FONT_STACK_FALLBACK, pickTerminalFont } from './terminal-font'

describe('pickTerminalFont', () => {
  it('uses the fallback stack on narrow panes (INPUT-12)', () => {
    expect(pickTerminalFont(60)).toBe(FONT_STACK_FALLBACK)
    expect(pickTerminalFont(99)).toBe(FONT_STACK_FALLBACK)
  })

  it('keeps the default stack on wide panes (INPUT-12)', () => {
    expect(pickTerminalFont(100)).toBe(FONT_STACK_DEFAULT)
    expect(pickTerminalFont(160)).toBe(FONT_STACK_DEFAULT)
  })
})
