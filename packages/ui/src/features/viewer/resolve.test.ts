import { describe, expect, it } from 'vitest'
import { suffixMatches } from './resolve.js'

/**
 * 에이전트가 적은 상대 경로 → 프로젝트 안의 진짜 파일 (사용자 지적 2026-09-07).
 * 실제로 겪은 예: `Media/ImageSearch.cs` ↔ `WzComparerR2.Cli/Media/ImageSearch.cs`.
 */
describe('suffixMatches', () => {
  const files = [
    'WzComparerR2.Cli/Media/ImageSearch.cs',
    'Tools/Media/ImageSearch.cs',
    'WzComparerR2.Common/OldMedia/ImageSearch.cs',
    'docs/README.md',
  ]

  it('앞이 잘린 경로를 꼬리로 맞춘다', () => {
    expect(suffixMatches(files, 'WzComparerR2.Cli/Media/ImageSearch.cs')).toEqual([
      'WzComparerR2.Cli/Media/ImageSearch.cs',
    ])
  })

  it('조각 경계에서만 맞춘다 — OldMedia/ImageSearch.cs는 후보가 아니다', () => {
    expect(suffixMatches(files, 'Media/ImageSearch.cs')).toEqual([
      'Tools/Media/ImageSearch.cs',
      'WzComparerR2.Cli/Media/ImageSearch.cs',
    ])
  })

  it('여럿이면 여럿 그대로 — 얕은 것부터 (고르는 건 사람 몫이다)', () => {
    const many = ['a/b/c/x.ts', 'a/x.ts', 'q/a/x.ts']
    expect(suffixMatches(many, 'x.ts')).toEqual(['a/x.ts', 'q/a/x.ts', 'a/b/c/x.ts'])
  })

  it('정확히 같은 경로가 있으면 그것이 첫 번째다', () => {
    expect(suffixMatches(['deep/nest/x.ts', 'x.ts'], 'x.ts')[0]).toBe('x.ts')
  })

  it('빈 값이나 절대 경로는 아무것도 맞추지 않는다 — 빈 꼬리는 모든 경로에 맞는다', () => {
    expect(suffixMatches(files, '')).toEqual([])
    expect(suffixMatches(files, '/etc/passwd')).toEqual([])
  })

  it('없으면 없다 — 지어내지 않는다', () => {
    expect(suffixMatches(files, 'Media/Nope.cs')).toEqual([])
  })
})
