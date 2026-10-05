import { describe, expect, it } from 'vitest'
import { reloadBudget } from './reloadBudget.js'

describe('how often a view may reopen on its own (M4 C-4)', () => {
  it('allows the limit within the window, then refuses until the window has passed', () => {
    const budget = reloadBudget(3, 60_000)
    expect([0, 1, 2, 3].map((t) => budget.allow('v', t))).toEqual([true, true, true, false])
    expect(budget.allow('v', 59_999)).toBe(false)
    expect(budget.allow('v', 60_000)).toBe(true)
  })

  it('forgets a view that never asks again once its window has passed', () => {
    const budget = reloadBudget(3, 60_000)
    budget.allow('closed view', 0)
    budget.allow('open view', 30_000)
    expect(budget.size()).toBe(2)

    // The closed view never asks again: the next ask by any view sweeps it
    budget.allow('open view', 60_000)
    expect(budget.size()).toBe(1)
    // A view still inside its window keeps its count through the sweep
    expect(budget.allow('open view', 61_000)).toBe(true)
    expect(budget.allow('open view', 62_000)).toBe(false)
  })
})
