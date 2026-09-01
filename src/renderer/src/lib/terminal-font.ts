/** Terminal font selection (INPUT-12). Claude Code's boxed TUI needs the
 * corner glyphs (U+23BE/U+23BF) that JetBrains Mono lacks; on narrow panes
 * the fallback stack (Cascadia Mono, the Windows Terminal default) renders
 * correctly, while wide panes keep the JetBrains Mono look. */

export const WIDE_PANE_COLS = 100

export const FONT_STACK_DEFAULT = "'JetBrains Mono', monospace"
export const FONT_STACK_FALLBACK = "'Cascadia Mono', Consolas, 'JetBrains Mono', monospace"

export function pickTerminalFont(cols: number): string {
  return cols < WIDE_PANE_COLS ? FONT_STACK_FALLBACK : FONT_STACK_DEFAULT
}
