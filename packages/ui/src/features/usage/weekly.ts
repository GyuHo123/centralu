import type { UsageWindow } from '@cc/protocol'

/**
 * 상단 바 도넛이 그릴 **주간 창** 하나 고르기 (사용자 요청 2026-09-09).
 *
 * 도구마다 창의 이름이 다르다 (실측):
 *   claude — `session`(5 hours) · `weekly_all`(Weekly) · `weekly_scoped`(Weekly per model)
 *   codex  — `primary` · `secondary`, 이름은 창 길이에서 만들어진다 (`5h` · `1w`)
 *
 * 그래서 id와 이름 **양쪽**으로 찾는다. 못 찾으면 **null이다** — 아무 창이나 골라
 * 그리면 도넛이 사실이 아닌 것을 말한다. 그 경우 도넛은 "모른다"로 서고, 창 목록은
 * 눌러서 여는 상세가 전부 보여준다.
 *
 */
export function weeklyWindow(windows: readonly UsageWindow[]): UsageWindow | null {
  const weekly = windows.filter(isWeekly)
  if (weekly.length === 0) return null
  /*
   * 여럿이면 **가장 많이 찬 것**을 세운다 (사용자 지적 2026-09-09: "Weekly (per model)가
   * 빠진 것 같다").
   *
   * claude는 계정 주간(weekly_all)과 모델별 주간(weekly_scoped)을 함께 준다. 계정 쪽만
   * 그리면 모델 한도가 먼저 차 있을 때 계기판이 여유가 있다고 말한다 — 먼저 부딪히는
   * 벽이 안 보이는 것이다. 규칙은 사람마다 달라지지 않는다: **먼저 닿는 한도**를 그린다.
   * 어느 창인지는 툴팁과 상세가 이름으로 말한다.
   */
  return weekly.reduce((a, b) => (b.percent > a.percent ? b : a))
}

/** 주간이라 할 만한 창인가 — 도구마다 이름이 달라 id와 이름을 함께 본다 */
function isWeekly(w: UsageWindow): boolean {
  return w.id.startsWith('weekly') || /^\d+\s*w$/i.test(w.label.trim())
}

/** 채운 만큼을 밝기로 (색 없는 화면의 규칙). 위험할수록 밝다 */
export function usageTone(percent: number): string {
  return percent >= 90 ? 'text-beacon' : percent >= 70 ? 'text-chalk' : 'text-ash'
}
