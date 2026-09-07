import { describe, expect, it } from 'vitest'
import { killTargets, parsePs } from './kill-tree.js'

/**
 * 트리 킬의 과녁 고르기 (실측 2026-09-07의 결론).
 *
 * 핵심은 **잡 컨트롤**이다. 대화형 셸에서 띄운 프로그램은 자기 프로세스 그룹을 갖기
 * 때문에, 셸의 그룹만 쏘면 정작 데브 서버가 안 맞는다. 여기서 시험하는 것은 그
 * 판단뿐이다 — 실제로 시그널을 보내는 일은 여기서 하지 않는다.
 */
describe('killTargets', () => {
  const rows = (s: string) => parsePs(s)

  it('비대화형 셸: 자식이 같은 그룹에 있으면 과녁은 하나다', () => {
    // zsh -lc "pnpm dev" → 셸 100, pnpm 200, node 300 전부 pgid 100
    const table = rows('  100   50  100\n  200  100  100\n  300  200  100\n  900   50  900\n')
    expect(killTargets(table, 100, 900)).toEqual([100])
  })

  it('대화형 셸: 잡이 자기 그룹을 가지면 그 그룹도 과녁이다', () => {
    // zsh -l 100(pgid 100) → 데브 서버 200이 pgid 200으로 떨어져 나간다
    const table = rows('  100   50  100\n  200  100  200\n  300  200  200\n  900   50  900\n')
    expect(killTargets(table, 100, 900).sort()).toEqual([100, 200])
  })

  it('손자까지 따라간다 — 트리지 자식 목록이 아니다', () => {
    const table = rows('  100   50  100\n  200  100  200\n  300  200  300\n  400  300  400\n')
    expect(killTargets(table, 100, 999).sort()).toEqual([100, 200, 300, 400])
  })

  it('남의 가지는 건드리지 않는다', () => {
    // 400은 50의 자식이지 100의 자손이 아니다
    const table = rows('  100   50  100\n  200  100  200\n  400   50  400\n')
    expect(killTargets(table, 100, 999).sort()).toEqual([100, 200])
  })

  it('내가 속한 그룹은 절대 쏘지 않는다 — 정리하다 자기를 죽이면 나머지가 남는다', () => {
    // 200이 어쩌다 호스트(900)와 같은 그룹에 있다
    const table = rows('  100   50  100\n  200  100  900\n  900   50  900\n')
    expect(killTargets(table, 100, 900)).toEqual([100])
  })

  it('ps는 읽혔는데 root가 없으면 아무것도 안 쏜다 — 재사용된 pid를 때릴 자리다', () => {
    // 셸이 이미 죽은 뒤의 유예 타이머. 54321은 그새 남의 프로세스일 수 있다
    const table = rows('  100   50  100\n  900   50  900\n')
    expect(killTargets(table, 54321, 900)).toEqual([])
  })

  it('ps를 못 읽으면 root의 그룹 하나 — 예전 동작으로 내려앉는다', () => {
    expect(killTargets([], 54321, 900)).toEqual([54321])
  })

  it('init(1)이나 그룹 0은 과녁이 아니다 — 시스템을 쏠 뻔한 자리다', () => {
    const table = rows('  100   50    1\n  200  100    0\n')
    expect(killTargets(table, 100, 900)).toEqual([])
  })
})

describe('parsePs', () => {
  it('숫자 세 칸인 줄만 읽는다 — 헤더나 깨진 줄은 버린다', () => {
    const out = '  PID  PPID  PGID\n  100   50  100\n쓰레기\n  200  100  200\n'
    expect(parsePs(out)).toEqual([
      { pid: 100, ppid: 50, pgid: 100 },
      { pid: 200, ppid: 100, pgid: 200 },
    ])
  })
})
