import { describe, expect, it } from 'vitest'
import type { PanelTab } from '../../store/panelLayout.js'
import { fitTabs } from './fitTabs.js'

/**
 * 좁은 띠에서 탭을 접는 규칙 (사용자 요청 2026-09-07).
 * 폭은 시험이 정한다 — 실제 측정은 브라우저 몫이고, 여기서 보는 건 판단뿐이다.
 */
describe('fitTabs', () => {
  const ORDER: PanelTab[] = ['files', 'git', 'history', 'terminal']
  const W: Record<string, number> = { files: 50, git: 40, history: 60, terminal: 70 }
  const w = (t: PanelTab) => W[t]!
  const opts = { gap: 2, more: 24 }

  it('다 들어가면 아무것도 안 접는다', () => {
    expect(fitTabs(ORDER, w, 1000, 'files', opts)).toEqual({ shown: ORDER, hidden: [] })
  })

  it('안 들어가면 뒤에서부터 접힌다 — 순서는 그대로', () => {
    // files+git+history = 150 + 간격 4 = 154, `…`와 간격까지 26 → 180이면 여기까지
    const r = fitTabs(ORDER, w, 180, 'files', opts)
    expect(r.shown).toEqual(['files', 'git', 'history'])
    expect(r.hidden).toEqual(['terminal'])
  })

  it('고른 탭은 접히지 않는다 — 밀려나면 마지막 자리를 뺏는다', () => {
    const r = fitTabs(ORDER, w, 180, 'terminal', opts)
    expect(r.shown).toEqual(['files', 'git', 'terminal'])
    expect(r.hidden).toEqual(['history'])
    // 자리를 지킨 탭들의 앞뒤 순서는 원래 그대로다
    expect(r.shown.indexOf('files')).toBeLessThan(r.shown.indexOf('git'))
  })

  it('한 칸도 못 넣을 만큼 좁아도 고른 탭 하나는 남는다', () => {
    const r = fitTabs(ORDER, w, 10, 'history', opts)
    expect(r.shown).toEqual(['history'])
    expect(r.hidden).toEqual(['files', 'git', 'terminal'])
  })

  it('아직 재기 전(폭 0)이면 접지 않는다 — 재기도 전에 접으면 화면이 깜빡인다', () => {
    expect(fitTabs(ORDER, w, 0, 'files', opts).shown).toEqual(ORDER)
  })

  it('탭이 하나뿐이면 접을 것도 없다', () => {
    expect(fitTabs(['git'], w, 5, 'git', opts)).toEqual({ shown: ['git'], hidden: [] })
  })
})
