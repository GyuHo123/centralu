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
 * 모델별 주간 창(weekly_scoped)은 고르지 않는다: 계정 전체의 주간이 있는데 그걸 두고
 * 한 모델의 창을 세우면, 같은 도넛이 사람마다 다른 것을 뜻하게 된다.
 */
export function weeklyWindow(windows: readonly UsageWindow[]): UsageWindow | null {
  return (
    windows.find((w) => w.id === 'weekly_all') ??
    windows.find((w) => /^\d+\s*w$/i.test(w.label.trim())) ??
    windows.find((w) => w.id.startsWith('weekly') && !w.scope) ??
    null
  )
}

/** 채운 만큼을 밝기로 (색 없는 화면의 규칙). 위험할수록 밝다 */
export function usageTone(percent: number): string {
  return percent >= 90 ? 'text-beacon' : percent >= 70 ? 'text-chalk' : 'text-ash'
}
