/**
 * How many times each view may reopen on its own within a window (M4 C-4, `followAppCode` in the store).
 *
 * `allow` answers for one view's key and records the reopen when it says yes. A view that was closed, or whose
 * session was deleted, never asks again, so every key whose reopens all fall outside the window is swept on each
 * ask: otherwise a key stays for the life of the window for every view that ever reopened.
 */
export type ReloadBudget = {
  allow(key: string, now?: number): boolean
  /** How many views are still counted */
  size(): number
}

export function reloadBudget(limit: number, windowMs: number): ReloadBudget {
  const reopens = new Map<string, number[]>()
  return {
    allow(key, now = Date.now()) {
      for (const [k, times] of reopens) {
        if (times.every((t) => now - t >= windowMs)) reopens.delete(k)
      }
      const recent = (reopens.get(key) ?? []).filter((t) => now - t < windowMs)
      const ok = recent.length < limit
      if (ok) recent.push(now)
      reopens.set(key, recent)
      return ok
    },
    size: () => reopens.size,
  }
}
