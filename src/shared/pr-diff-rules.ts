import type { Hunk } from './files'

/**
 * The rules that decide whether GitHub will anchor a comment to a selection
 * (design D2, D3). Pure and shared: main's client and the renderer's
 * `commentPlan` apply the same rule, so the composer's warning and what is
 * posted can never disagree.
 */

/** A unified-diff hunk header: `@@ -a[,b] +c[,d] @@`. */
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

/**
 * The new-side line range of every hunk in a GitHub `patch`, in order
 * (FPRG-19, 22). A header `+c,d` covers `c … c+d−1`; an omitted `d` means one
 * line; `d = 0` covers none, so its `newEnd` falls below its `newStart`.
 */
export function parsePatchHunks(patch: string): Hunk[] {
  const hunks: Hunk[] = []
  for (const line of patch.split('\n')) {
    const header = HUNK_HEADER.exec(line)
    if (!header) continue
    const newStart = Number(header[1])
    const count = header[2] === undefined ? 1 : Number(header[2])
    hunks.push({ newStart, newEnd: newStart + count - 1 })
  }
  return hunks
}

/**
 * Whether GitHub anchors a comment on these modified-side lines (D2, as T1
 * measured it, S1): the first and the last line each lie in some hunk — the
 * same one or two different ones. A file without a patch has no known hunk,
 * so nothing in it is in the diff (FPRG-22).
 */
export function endsInDiff(startLine: number, endLine: number, hunks: Hunk[] | null): boolean {
  if (hunks === null) return false
  const inHunk = (line: number): boolean =>
    hunks.some((hunk) => line >= hunk.newStart && line <= hunk.newEnd)
  return inHunk(startLine) && inHunk(endLine)
}
