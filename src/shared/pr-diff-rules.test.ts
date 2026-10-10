import { describe, expect, it } from 'vitest'
import { citation, endsInDiff, parsePatchHunks } from './pr-diff-rules'

/**
 * The spike's file (design S1): 40 lines, lines 5 and 30 changed, so GitHub's
 * patch has two hunks whose new sides are 2–8 and 27–33.
 */
const SPIKE_PATCH = [
  '@@ -2,7 +2,7 @@ export const header = 1',
  ' line 2',
  ' line 3',
  ' line 4',
  '-line 5',
  '+line 5, changed',
  ' line 6',
  ' line 7',
  ' line 8',
  '@@ -27,7 +27,7 @@ export const footer = 2',
  ' line 27',
  ' line 28',
  ' line 29',
  '-line 30',
  '+line 30, changed',
  ' line 31',
  ' line 32',
  ' line 33'
].join('\n')

describe('parsePatchHunks', () => {
  it('reads the new-side range of a hunk header', () => {
    expect(parsePatchHunks('@@ -10,4 +12,6 @@\n-a\n+b')).toEqual([{ newStart: 12, newEnd: 17 }])
  })

  it('reads an omitted count as one line', () => {
    expect(parsePatchHunks('@@ -1 +1 @@\n-a\n+b')).toEqual([{ newStart: 1, newEnd: 1 }])
  })

  it('reads a zero count as no new-side line at all', () => {
    const hunks = parsePatchHunks('@@ -5,3 +4,0 @@\n-a\n-b\n-c')

    expect(hunks).toEqual([{ newStart: 4, newEnd: 3 }])
    expect(endsInDiff(4, 4, hunks)).toBe(false)
  })

  it('yields every hunk of a patch, in order', () => {
    const patch = [
      '@@ -1,3 +1,4 @@',
      ' a',
      '+b',
      ' c',
      ' d',
      '@@ -20,2 +21,2 @@ function f() {',
      '-e',
      '+E',
      ' f',
      '@@ -40 +41,3 @@',
      ' g',
      '+h',
      '+i'
    ].join('\n')

    expect(parsePatchHunks(patch)).toEqual([
      { newStart: 1, newEnd: 4 },
      { newStart: 21, newEnd: 22 },
      { newStart: 41, newEnd: 43 }
    ])
  })
})

// D2 as T1 measured it (S1): GitHub anchors a range when both of its ends lie
// on a hunk's new-side lines, in one hunk or in two; it checks nothing else.
describe('endsInDiff', () => {
  const hunks = parsePatchHunks(SPIKE_PATCH)

  it('accepts a range whose ends both lie in one hunk', () => {
    expect(hunks).toEqual([
      { newStart: 2, newEnd: 8 },
      { newStart: 27, newEnd: 33 }
    ])
    expect(endsInDiff(5, 5, hunks)).toBe(true)
    expect(endsInDiff(3, 7, hunks)).toBe(true)
    expect(endsInDiff(8, 8, hunks)).toBe(true)
  })

  it('accepts a range from one hunk to another', () => {
    expect(endsInDiff(5, 30, hunks)).toBe(true)
  })

  it('refuses a range with either end, or both, outside every hunk', () => {
    expect(endsInDiff(9, 9, hunks)).toBe(false)
    expect(endsInDiff(18, 18, hunks)).toBe(false)
    expect(endsInDiff(5, 18, hunks)).toBe(false)
    expect(endsInDiff(18, 30, hunks)).toBe(false)
    expect(endsInDiff(1, 4, hunks)).toBe(false)
    expect(endsInDiff(12, 20, hunks)).toBe(false)
  })

  // FPRG-22: without a patch no anchor can be known to be valid.
  it('refuses every range of a file with no patch', () => {
    expect(endsInDiff(5, 5, null)).toBe(false)
    expect(endsInDiff(1, 1, null)).toBe(false)
  })
})

// FPRG-20, 21: a selection outside the diff posts as a general comment that
// names its lines and quotes them in a fence nothing inside can close.
describe('citation', () => {
  it('names the path and the lines, then fences the selected text', () => {
    const text = ['const a = 1', 'const b = 2', 'const c = 3'].join('\n')

    expect(citation('src/a.ts', 10, 12, text)).toBe(
      ['`src/a.ts:L10–L12`', '', '```', 'const a = 1', 'const b = 2', 'const c = 3', '```'].join(
        '\n'
      )
    )
  })

  it('fences with more backticks than any run in the text', () => {
    const three = citation('src/a.ts', 10, 12, ['before', '```', 'after'].join('\n'))
    const four = citation('src/a.ts', 10, 12, ['before', '````js', 'after'].join('\n'))

    expect(three).toBe(
      ['`src/a.ts:L10–L12`', '', '````', 'before', '```', 'after', '````'].join('\n')
    )
    expect(four).toBe(
      ['`src/a.ts:L10–L12`', '', '`````', 'before', '````js', 'after', '`````'].join('\n')
    )
  })

  it('names a single line once', () => {
    expect(citation('src/a.ts', 10, 10, 'const a = 1')).toBe(
      ['`src/a.ts:L10`', '', '```', 'const a = 1', '```'].join('\n')
    )
  })
})
