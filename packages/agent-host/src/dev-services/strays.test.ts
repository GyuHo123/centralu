import { describe, expect, it } from 'vitest'
import { insideAny, noTty, parseLsofCwd, parsePsRows, pickStrays } from './strays.js'

/**
 * 남은 프로세스 고르기 (사용자 요청 2026-09-07).
 *
 * 실측이 규칙을 정했다: 에이전트가 띄운 데브 서버는 ppid=1에 제어 터미널이 없고(`??`),
 * 사람이 자기 터미널에서 띄운 것은 tty를 갖는다(`ttys005`). 그 선이 "치워도 되는 것"과
 * "남의 일"을 가른다. 여기서는 그 판단만 본다 — ps·lsof를 실제로 부르는 일은 아니다.
 */
describe('pickStrays', () => {
  const rows = parsePsRows(
    [
      '  100     1 ??       node /srv/dev-server.js', // 에이전트가 남긴 것
      '  101     1 ttys005  node /srv/dev-server.js', // 사람이 터미널에서 띄운 것
      '  200   100 ??       node child-of-stray.js',
      '  900     1 ??       node host.mjs', // 우리(host)
      '  901   900 ??       claude', // 우리 자손
      '  300     1 ??       node /elsewhere/other.js', // 남의 폴더
    ].join('\n'),
  )
  const cwds = new Map([
    [100, '/work/proj'],
    [101, '/work/proj'],
    [200, '/work/proj/sub'],
    [900, '/work/proj'],
    [901, '/work/proj'],
    [300, '/elsewhere'],
  ])
  const roots = ['/work/proj']

  it('우리 폴더에서 터미널 없이 도는 남의 프로세스만 고른다', () => {
    const picked = pickStrays(rows, cwds, roots, 900).map((s) => s.pid)
    expect(picked).toEqual([100, 200])
  })

  it('사람이 터미널에서 띄운 것은 건드리지 않는다 — tty가 그 선이다', () => {
    expect(pickStrays(rows, cwds, roots, 900).some((s) => s.pid === 101)).toBe(false)
  })

  it('host의 자손은 목록에 없다 — 종료 절차가 이미 트리째 정리한다', () => {
    expect(pickStrays(rows, cwds, roots, 900).some((s) => s.pid === 901)).toBe(false)
  })

  it('우리 폴더 밖은 남의 일이다', () => {
    expect(pickStrays(rows, cwds, roots, 900).some((s) => s.pid === 300)).toBe(false)
  })

  it('cwd를 못 읽은 프로세스는 지어내지 않는다', () => {
    expect(pickStrays(rows, new Map(), roots, 900)).toEqual([])
  })
})

describe('insideAny', () => {
  it('조각 경계로 잰다 — /a/proj-old는 /a/proj의 안이 아니다', () => {
    expect(insideAny('/a/proj-old/x', ['/a/proj'])).toBeNull()
    expect(insideAny('/a/proj/x', ['/a/proj'])).toBe('/a/proj')
    expect(insideAny('/a/proj', ['/a/proj'])).toBe('/a/proj')
  })

  it('뿌리가 없으면 아무것도 안 맞는다', () => {
    expect(insideAny('/a/proj/x', [])).toBeNull()
  })
})

describe('출력 읽기', () => {
  it('ps 줄에서 pid·ppid·tty·명령을 뗀다 (명령에 공백이 있어도)', () => {
    expect(parsePsRows('  42     1 ??       node -e setInterval(...)')).toEqual([
      { pid: 42, ppid: 1, tty: '??', command: 'node -e setInterval(...)' },
    ])
  })

  it('lsof -Fpn에서 pid별 cwd를 뗀다', () => {
    expect(parseLsofCwd('p10\nfcwd\nn/work/a\np11\nfcwd\nn/work/b\n')).toEqual(
      new Map([
        [10, '/work/a'],
        [11, '/work/b'],
      ]),
    )
  })

  it('제어 터미널 없음은 macOS(??)와 Linux(?) 표기를 모두 안다', () => {
    expect(noTty('??')).toBe(true)
    expect(noTty('?')).toBe(true)
    expect(noTty('ttys005')).toBe(false)
  })
})
