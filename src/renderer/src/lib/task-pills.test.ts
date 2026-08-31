import { describe, expect, it } from 'vitest'
import { typeClass } from './task-pills'

describe('typeClass', () => {
  it('maps each ADO type to its tp-* class (TYPE-01)', () => {
    expect(typeClass('Bug')).toBe('tp-bug')
    expect(typeClass('Task')).toBe('tp-task')
    expect(typeClass('User Story')).toBe('tp-user-story')
    expect(typeClass('Feature')).toBe('tp-feature')
    expect(typeClass('Epic')).toBe('tp-epic')
    expect(typeClass('Issue')).toBe('tp-issue')
    expect(typeClass('Impediment')).toBe('tp-issue')
    expect(typeClass('Product Backlog Item')).toBe('tp-pbi')
    expect(typeClass('Fault')).toBe('tp-fault')
  })

  it('falls back to muted for unmapped custom types (TYPE-02, TYPE-06)', () => {
    expect(typeClass('Requirement')).toBe('muted')
    expect(typeClass('Test Case')).toBe('muted')
    expect(typeClass('Test Plan')).toBe('muted')
  })

  it('matches types case-insensitively and trim-safe (TYPE-03)', () => {
    expect(typeClass('user story')).toBe('tp-user-story')
    expect(typeClass('USER STORY')).toBe('tp-user-story')
    expect(typeClass('  User Story  ')).toBe('tp-user-story')
    expect(typeClass('BUG')).toBe('tp-bug')
  })

  it('renders empty and whitespace types neutral (TYPE-05)', () => {
    expect(typeClass('')).toBe('muted')
    expect(typeClass('   ')).toBe('muted')
  })
})