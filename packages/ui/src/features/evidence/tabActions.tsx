import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * 지금 탭의 제어 버튼이 사는 자리 — **탭 띠의 오른쪽 끝** (사용자 요청 2026-09-07).
 *
 * 예전에는 탭마다 자기 머리띠를 하나 더 그렸다. 그러면 세로로 좁은 패널에서 머리띠 둘
 * (탭 띠 + 탭의 머리띠)이 연달아 서고, 정작 내용은 그 아래 남은 자리에서 시작했다.
 * 게다가 머리띠의 이름표("Terminal", "Changes")는 바로 위 탭이 이미 하고 있는 말이었다.
 *
 * 그렇다고 버튼을 띠로 끌어올리려고 각 화면의 상태를 위로 들어 올리면(터미널 추가 함수,
 * 무시된 파일 보기 여부…) 띠가 모든 탭의 사정을 알아야 한다. 그래서 **포털**을 쓴다:
 * 버튼은 자기 화면 안에 그대로 선언돼 자기 상태를 그대로 쓰고, 그려지는 자리만 띠다.
 * 띠는 슬롯을 내주는 것 말고는 아무 탭도 모른다.
 *
 * 묶음(그룹)마다 슬롯이 따로다 — 화면이 위아래로 갈리면 각 몸통의 띠가 자기 탭의 버튼을 든다.
 */
const SlotCtx = createContext<HTMLElement | null>(null)

export const TabActionSlot = SlotCtx.Provider

/** 이 탭의 제어 버튼들. 띠에 슬롯이 없으면(예: 시험용 단독 렌더) 아무것도 그리지 않는다 */
export function TabActions({ children }: { children: ReactNode }) {
  const slot = useContext(SlotCtx)
  return slot ? createPortal(children, slot) : null
}
