import { describe, expect, it } from 'vitest'
import { rowsFromMetrics } from './caret.js'

/**
 * 잰 값 → "첫 줄인가 / 마지막 줄인가". 거울을 그리는 쪽은 브라우저에서만 시험할 수 있어
 * (jsdom에는 레이아웃이 없다) 여기서는 판단만 본다. 실제 화살표 동작은 e2e에 있다.
 */
describe('rowsFromMetrics', () => {
  const LH = 20

  it('한 줄짜리는 첫 줄이자 마지막 줄이다 — 위아래로 계속 넘길 수 있어야 한다', () => {
    expect(rowsFromMetrics(0, 20, LH)).toEqual({ first: true, last: true })
  })

  it('세 줄로 접힌 글의 가운데 줄은 첫 줄도 마지막 줄도 아니다', () => {
    expect(rowsFromMetrics(20, 60, LH)).toEqual({ first: false, last: false })
  })

  it('마지막 줄은 마지막 줄이다', () => {
    expect(rowsFromMetrics(40, 60, LH)).toEqual({ first: false, last: true })
  })

  it('소수점 높이(16.5px 같은)가 줄 수를 어긋나게 만들지 않는다', () => {
    // 두 줄, 줄 높이 16.5 → 커서는 둘째 줄 시작(16.5), 전체 33
    expect(rowsFromMetrics(16.5, 33, 16.5)).toEqual({ first: false, last: true })
    expect(rowsFromMetrics(0, 33, 16.5)).toEqual({ first: true, last: false })
  })

  it('잴 수 없으면 null — 부르는 쪽이 예전 판단(개행 세기)으로 내려앉는다', () => {
    expect(rowsFromMetrics(0, 0, 0)).toBeNull()
    expect(rowsFromMetrics(0, 20, Number.NaN)).toBeNull()
  })
})
