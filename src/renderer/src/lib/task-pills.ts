/** Handoff §Semantic color usage — type pills. ADO palette per TYPE-01
 * (Bug #CC293D, Task #F2CB1D, User Story #009F5B, Feature #0078D7,
 * Epic #773B93, Issue/Impediment #FF9D00, PBI #009CCC, Fault #B4009E);
 * unmapped types fall back to neutral `muted` (TYPE-02). */
export function typeClass(type: string): string {
  switch (type.trim().toLowerCase()) {
    case 'bug':
      return 'tp-bug'
    case 'task':
      return 'tp-task'
    case 'user story':
      return 'tp-user-story'
    case 'feature':
      return 'tp-feature'
    case 'epic':
      return 'tp-epic'
    case 'issue':
    case 'impediment':
      return 'tp-issue'
    case 'product backlog item':
      return 'tp-pbi'
    case 'fault':
      return 'tp-fault'
    default:
      return 'muted'
  }
}

/** Handoff §Semantic color usage — state pills/dots. */
export function stateClass(state: string): string {
  switch (state.toLowerCase()) {
    case 'active':
      return 'green'
    case 'new':
      return 'blue'
    case 'in progress':
      return 'amber'
    case 'resolved':
      return 'accent'
    case 'closed':
      return 'faint'
    default:
      return 'muted'
  }
}
