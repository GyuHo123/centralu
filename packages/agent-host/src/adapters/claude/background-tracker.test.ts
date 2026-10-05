import { describe, expect, it } from 'vitest'
import { ClaudeBackgroundTracker } from './normalize.js'

/** What the tracker holds per task — reached past its interface on purpose: a leak is invisible through it */
const held = (t: ClaudeBackgroundTracker) => (t as unknown as { info: Map<string, unknown> }).info.size

describe('the Claude background tracker forgets tasks that ended (#392)', () => {
  it('a foreground task is forgotten when it ends', () => {
    const t = new ClaudeBackgroundTracker('s1')
    for (let i = 0; i < 100; i++) {
      t.push({ type: 'system', subtype: 'task_started', task_id: `fg${i}`, task_type: 'local_agent', description: 'x' })
      t.push({ type: 'system', subtype: 'task_notification', task_id: `fg${i}`, status: 'completed' })
    }
    expect(held(t)).toBe(0)
  })

  it('releasing a process with no live background work still forgets what it knew', () => {
    const t = new ClaudeBackgroundTracker('s1')
    t.push({ type: 'system', subtype: 'task_started', task_id: 'fg', task_type: 'local_agent', description: 'x' })
    expect(t.release('gone')).toEqual([])
    expect(held(t)).toBe(0)
  })
})
