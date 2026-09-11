/** True when `id` is folded in the sidebar tree; an id absent from the list
 *  (or an empty list) means expanded (WSCL-06). */
export function isCollapsed(ids: string[], id: string): boolean {
  return ids.includes(id)
}

/** Returns a new list with `id` appended when absent or removed when present,
 *  preserving the other ids and their order (WSCL-01). Never mutates `ids`. */
export function toggleCollapsedId(ids: string[], id: string): string[] {
  return isCollapsed(ids, id) ? ids.filter((x) => x !== id) : [...ids, id]
}

/** Returns the list without `id`; when absent the list is returned unchanged
 *  (WSCL-09). Never mutates `ids`. */
export function dropCollapsedId(ids: string[], id: string): string[] {
  return isCollapsed(ids, id) ? ids.filter((x) => x !== id) : ids
}
