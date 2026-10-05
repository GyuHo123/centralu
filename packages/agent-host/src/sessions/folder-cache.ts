/**
 * How many tool-and-folder keys the session manager's per-folder caches keep (`commandCache`, `externalIndex`).
 *
 * Both are keyed by tool and folder (Claude and Codex each take a key per folder), and a worktree session has a
 * folder of its own, so every worktree ever opened added entries (a slash-command list can run to tens of KB with
 * skill descriptions) and none was ever removed (#392). Both are memos: the commands are on disk, the index is
 * re-read after 30 s.
 */
export const FOLDER_CACHE_KEYS = 32

/** Sets a key as the most recently used and lets the least recently used go past `cap` */
export function remember<K, V>(map: Map<K, V>, key: K, value: V, cap = FOLDER_CACHE_KEYS): void {
  map.delete(key)
  map.set(key, value)
  for (const oldest of map.keys()) {
    if (map.size <= cap) break
    map.delete(oldest)
  }
}
