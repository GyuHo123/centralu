import { describe, expect, it } from 'vitest'
import { logReplay, UNREAD_LOG_LINE } from './logReplay.js'

function view() {
  const written: string[] = []
  return { written, log: logReplay((d) => written.push(d)) }
}

describe('a command log view joining the stored log and live output', () => {
  it('draws the stored log first, then what arrived while it was being read, then live output', () => {
    const { written, log } = view()
    log.chunk('b')
    log.replay('a')
    log.chunk('c')
    expect(written).toEqual(['a', 'b', 'c'])
  })

  it('stops holding output when the stored log cannot be read, and says the earlier output is missing', () => {
    const { written, log } = view()
    log.chunk('early')
    log.fail()
    log.chunk('later')
    expect(written).toEqual([UNREAD_LOG_LINE, 'early', 'later'])
    expect(UNREAD_LOG_LINE).toContain('earlier output could not be read')
  })

  it('stops holding output when the log belongs to another run, and draws none of it', () => {
    const { written, log } = view()
    log.chunk('stale')
    log.drop()
    log.replay('ignored')
    expect(written).toEqual([])
    log.chunk('live')
    expect(written).toEqual(['live'])
  })
})
