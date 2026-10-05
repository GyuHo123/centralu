/**
 * The end of the host's shutdown (#396): the store and the keeper's child connection close however the stopping
 * before them went, and however each other's close goes.
 */
import { describe, expect, it } from 'vitest'
import { stopThenClose } from './shutdown.js'

function closes() {
  const closed: string[] = []
  const logged: string[] = []
  return {
    closed,
    logged,
    log: (line: string) => void logged.push(line),
    store: (fail?: string) => () => {
      closed.push('store')
      if (fail) throw new Error(fail)
    },
    children: () => () => void closed.push('children'),
  }
}

describe('the closes at the end of a shutdown (#396)', () => {
  it('run after the steps that stop the services', async () => {
    const c = closes()
    await stopThenClose(async () => void c.closed.push('stopped'), [c.store(), c.children()], c.log)
    expect(c.closed).toEqual(['stopped', 'store', 'children'])
  })

  it("run when a step threw, and the step's error is the one that comes out", async () => {
    const c = closes()
    const run = stopThenClose(() => Promise.reject(new Error('a view would not close')), [c.store(), c.children()], c.log)
    await expect(run).rejects.toThrow('a view would not close')
    expect(c.closed).toEqual(['store', 'children'])
  })

  it('a close that throws does not skip the next one', async () => {
    const c = closes()
    const run = stopThenClose(async () => {}, [c.store('disk I/O error'), c.children()], c.log)
    await expect(run).rejects.toThrow('disk I/O error')
    expect(c.closed).toEqual(['store', 'children'])
  })

  it("a close that throws after a step threw does not hide the step's error, and is logged", async () => {
    const c = closes()
    const run = stopThenClose(
      () => Promise.reject(new Error('a view would not close')),
      [c.store('disk I/O error'), c.children()],
      c.log,
    )
    await expect(run).rejects.toThrow('a view would not close')
    expect(c.closed).toEqual(['store', 'children'])
    expect(c.logged.join('\n')).toContain('disk I/O error')
  })
})
