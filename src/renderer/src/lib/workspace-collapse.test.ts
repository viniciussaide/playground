import { describe, expect, it } from 'vitest'
import { dropCollapsedId, isCollapsed, toggleCollapsedId } from './workspace-collapse'

describe('isCollapsed', () => {
  it('returns true when the id is in the list (WSCL-06)', () => {
    expect(isCollapsed(['c:\\repo-a', 'c:\\repo-b'], 'c:\\repo-a')).toBe(true)
  })

  it('returns false when the id is absent (WSCL-06)', () => {
    expect(isCollapsed(['c:\\repo-a'], 'c:\\repo-b')).toBe(false)
  })

  it('returns false when the list is empty (WSCL-06)', () => {
    expect(isCollapsed([], 'c:\\repo-a')).toBe(false)
  })

  it('ignores ids that match no registered workspace (WSCL-10)', () => {
    expect(isCollapsed(['c:\\removed'], 'c:\\live')).toBe(false)
  })
})

describe('toggleCollapsedId', () => {
  it('appends an absent id (WSCL-01)', () => {
    expect(toggleCollapsedId(['c:\\repo-a'], 'c:\\repo-b')).toEqual(['c:\\repo-a', 'c:\\repo-b'])
  })

  it('removes a present id and preserves the remaining ids (WSCL-01)', () => {
    expect(toggleCollapsedId(['c:\\repo-a', 'c:\\repo-b', 'c:\\repo-c'], 'c:\\repo-b')).toEqual([
      'c:\\repo-a',
      'c:\\repo-c'
    ])
  })

  it('preserves the order of the other ids when appending (WSCL-01)', () => {
    expect(toggleCollapsedId(['c:\\repo-a', 'c:\\repo-b'], 'c:\\repo-c')).toEqual([
      'c:\\repo-a',
      'c:\\repo-b',
      'c:\\repo-c'
    ])
  })

  it('returns a new array and never mutates the input (WSCL-01)', () => {
    const ids = ['c:\\repo-a']
    const result = toggleCollapsedId(ids, 'c:\\repo-b')
    expect(result).not.toBe(ids)
    expect(ids).toEqual(['c:\\repo-a'])
  })
})

describe('dropCollapsedId', () => {
  it('removes a present id (WSCL-09)', () => {
    expect(dropCollapsedId(['c:\\repo-a', 'c:\\repo-b'], 'c:\\repo-a')).toEqual(['c:\\repo-b'])
  })

  it('leaves the list unchanged when the id is absent (WSCL-09)', () => {
    expect(dropCollapsedId(['c:\\repo-a'], 'c:\\repo-x')).toEqual(['c:\\repo-a'])
  })

  it('never mutates the input (WSCL-09)', () => {
    const ids = ['c:\\repo-a', 'c:\\repo-b']
    dropCollapsedId(ids, 'c:\\repo-a')
    expect(ids).toEqual(['c:\\repo-a', 'c:\\repo-b'])
  })
})
