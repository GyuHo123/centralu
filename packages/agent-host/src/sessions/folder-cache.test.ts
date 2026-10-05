import { describe, expect, it } from 'vitest'
import { remember } from './manager.js'

describe('the per-folder caches keep the most recently used folders only (#392)', () => {
  it('lets the least recently used key go past the cap', () => {
    const m = new Map<string, number>()
    for (let i = 0; i < 100; i++) remember(m, `claude:/wt/${i}`, i, 32)
    expect(m.size).toBe(32)
    expect(m.has('claude:/wt/99')).toBe(true)
    expect(m.has('claude:/wt/0')).toBe(false)
  })

  it('a key used again is kept over older ones', () => {
    const m = new Map<string, number>()
    remember(m, 'a', 1, 2)
    remember(m, 'b', 2, 2)
    remember(m, 'a', 3, 2)
    remember(m, 'c', 4, 2)
    expect([...m.keys()]).toEqual(['a', 'c'])
  })
})
