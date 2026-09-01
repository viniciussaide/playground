/** Key-chord classification for the embedded terminal (INPUT-04..08). */

export type TerminalKeyAction = 'copy-selection' | 'shift-enter' | 'paste' | 'pass'

export interface TerminalKeyEvent {
  type: string
  ctrlKey: boolean
  shiftKey: boolean
  code: string
  key: string
}

/**
 * Decides what the terminal pane must do with a raw keydown. `hasSelection`
 * comes from `term.getSelection()` — the app knows the selection, the
 * classifier just needs it to separate copy from SIGINT (INPUT-06, INPUT-07).
 */
export function classifyTerminalKey(
  event: TerminalKeyEvent,
  hasSelection: boolean
): TerminalKeyAction {
  if (event.type !== 'keydown') return 'pass'
  const ctrl = event.ctrlKey
  const shift = event.shiftKey
  if (ctrl && event.code === 'KeyC') {
    // Ctrl+Shift+C always copies (existing behavior); Ctrl+C copies only
    // when there is a selection, otherwise it passes through as SIGINT.
    return shift || hasSelection ? 'copy-selection' : 'pass'
  }
  if (ctrl && !shift && event.code === 'KeyV') return 'paste'
  if (!ctrl && shift && event.key === 'Enter') return 'shift-enter'
  return 'pass'
}
