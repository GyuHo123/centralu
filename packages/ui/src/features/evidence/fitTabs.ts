import type { PanelTab } from '../../store/panelLayout.js'

/**
 * 좁아진 탭 띠에서 무엇을 보이고 무엇을 접을까 (사용자 요청 2026-09-07).
 *
 * 띠 하나가 두 가지를 진다: 왼쪽은 어느 탭으로 갈지, 오른쪽은 **지금 탭의 제어 버튼**이다.
 * 제어 버튼은 접지 않는다 — 보고 있는 것에 대한 행동이라 언제나 손 닿는 곳에 있어야 한다.
 * 그래서 좁아지면 양보하는 쪽은 탭이고, 밀려난 탭은 `…` 뒤로 들어간다.
 *
 * 두 가지 규칙만 지킨다:
 *   - **고른 탭은 절대 안 접힌다.** 지금 보고 있는 것의 이름이 사라지면 어디에 있는지
 *     알 방법이 화면에서 없어진다.
 *   - 순서는 유지한다. 접혔다 펴질 때 탭이 자리를 바꾸면 손이 기억한 위치가 무효가 된다.
 */
export function fitTabs(
  order: readonly PanelTab[],
  widths: (tab: PanelTab) => number,
  avail: number,
  active: PanelTab,
  opts: { gap: number; more: number },
): { shown: PanelTab[]; hidden: PanelTab[] } {
  const all = [...order]
  if (all.length === 0) return { shown: [], hidden: [] }

  const span = (tabs: readonly PanelTab[]): number =>
    tabs.reduce((n, t) => n + widths(t), 0) + Math.max(0, tabs.length - 1) * opts.gap

  // 아직 안 재봤거나(폭 0) 다 들어가면 전부 보인다 — 재기 전에 접으면 한 번 깜빡인다
  if (!(avail > 0) || span(all) <= avail) return { shown: all, hidden: [] }

  const budget = avail - opts.more - opts.gap
  const shown: PanelTab[] = []
  for (const t of all) {
    if (span([...shown, t]) > budget) break
    shown.push(t)
  }

  // 고른 탭이 밀려났으면 마지막 자리를 내준다. 자리를 뺏긴 탭은 접히고, 순서는 그대로다
  if (!shown.includes(active)) {
    shown.pop()
    shown.push(active)
    shown.sort((a, b) => all.indexOf(a) - all.indexOf(b))
  }
  // 한 칸도 못 넣을 만큼 좁아도 고른 탭 하나는 남는다 — 빈 띠는 아무 말도 못 한다
  if (shown.length === 0) shown.push(active)

  return { shown, hidden: all.filter((t) => !shown.includes(t)) }
}
