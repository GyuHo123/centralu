import { describe, expect, it } from 'vitest'
import type { UsageWindow } from '@cc/protocol'
import { usageTone, weeklyWindow } from './weekly.js'

const w = (over: Partial<UsageWindow>): UsageWindow => ({
  id: 'x', label: 'x', percent: 0, resetsAt: null, scope: null, ...over,
})

/**
 * 상단 바 도넛이 그릴 창 고르기. 도구마다 이름이 다르다 (실측):
 * claude는 `weekly_all`, codex는 창 길이에서 만든 이름(`1w`).
 */
describe('weeklyWindow', () => {
  it('claude: weekly_all을 고른다 (5시간 창이 앞에 있어도)', () => {
    const picked = weeklyWindow([w({ id: 'session', label: '5 hours' }), w({ id: 'weekly_all', label: 'Weekly' })])
    expect(picked?.id).toBe('weekly_all')
  })

  it('codex: 이름이 창 길이다 — 1w를 고른다', () => {
    const picked = weeklyWindow([w({ id: 'primary', label: '5h' }), w({ id: 'secondary', label: '1w' })])
    expect(picked?.id).toBe('secondary')
  })

  it('모델별 주간은 계정 주간을 밀어내지 않는다 — 같은 도넛이 사람마다 다른 뜻이 되면 안 된다', () => {
    const picked = weeklyWindow([
      w({ id: 'weekly_scoped', label: 'Weekly (per model)', scope: 'Opus' }),
      w({ id: 'weekly_all', label: 'Weekly' }),
    ])
    expect(picked?.id).toBe('weekly_all')
  })

  it('주간이라 할 만한 것이 없으면 null — 아무 창이나 그리면 도넛이 거짓말한다', () => {
    expect(weeklyWindow([w({ id: 'session', label: '5 hours' })])).toBeNull()
    expect(weeklyWindow([])).toBeNull()
  })
})

describe('usageTone', () => {
  it('찰수록 밝다 — 90%부터는 순백', () => {
    expect(usageTone(10)).toBe('text-ash')
    expect(usageTone(70)).toBe('text-chalk')
    expect(usageTone(93)).toBe('text-beacon')
  })
})
