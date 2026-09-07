/**
 * 에이전트가 적은 경로를 프로젝트 안의 진짜 파일로 맞춰 보기 (#39의 뒷이야기).
 *
 * 링크는 언제나 **프로젝트 루트 기준**으로 열린다. 그런데 에이전트가 적는 경로는 자기가
 * 보고 있던 자리 기준일 때가 많다 — 모노레포·솔루션에서 특히 그렇다. 실제로 겪은 예
 * (사용자 지적 2026-09-07):
 *
 *     에이전트가 쓴 것: `Media/ImageSearch.cs`
 *     진짜 있는 곳:    `WzComparerR2.Cli/Media/ImageSearch.cs`
 *
 * 루트에 그 파일이 없으니 뷰어는 "못 열었다"만 말했다. 사람 눈에는 멀쩡한 경로가 죽은
 * 링크로 보이는 자리다.
 *
 * 그래서 **꼬리 맞추기**를 한다: 프로젝트 파일 목록에서 경로가 `…/<적힌 경로>`로 끝나는
 * 것을 찾는다. 조각 경계에 맞춰서만 — `Media/ImageSearch.cs`는 `X/Media/ImageSearch.cs`에
 * 맞지만 `X/OldMedia/ImageSearch.cs`에는 안 맞는다. 앞이 잘린 경로는 뒤가 온전하다는
 * 성질을 쓰는 것이고, 이건 추측이 아니라 확인이다 — 후보는 실재하는 파일들이다.
 *
 * 하나면 연다. 여럿이면 **고르게 한다** — 어느 하나를 골라 주는 건 사실인 척하는 추측이다.
 */

import { wireSegments } from '@cc/protocol'

/** 얕은 것부터. 루트에 가까울수록 사람이 말한 것일 확률이 높다 */
function depth(path: string): number {
  return wireSegments(path).length
}

/**
 * `paths` 중 `ref`로 끝나는 것들. 정확히 같은 것은 언제나 첫 번째다.
 *
 * `ref`가 빈 문자열이거나 `/`로 시작하면 아무것도 안 맞춘다 — 절대 경로는 이미 루트
 * 기준으로 풀렸어야 하고(parseFileRef), 빈 값은 모든 경로에 맞아 버린다.
 */
export function suffixMatches(paths: readonly string[], ref: string): string[] {
  if (!ref || ref.startsWith('/')) return []
  const tail = `/${ref}`
  const hits = paths.filter((p) => p === ref || p.endsWith(tail))
  return [...new Set(hits)].sort((a, b) => (a === ref ? -1 : b === ref ? 1 : depth(a) - depth(b) || a.localeCompare(b)))
}
