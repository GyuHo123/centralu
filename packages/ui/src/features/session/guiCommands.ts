import { useStore } from '../../store/store.js'

/**
 * GUI 슬래시 커맨드 (사용자 요청 2026-09-07).
 *
 * `/usage`는 CLI에선 클라이언트 내장 명령이라 SDK 프로토콜에 응답이 없다 — 세션에
 * 보내도 에이전트가 할 수 있는 일이 없다. 그래서 여기 있는 이름들은 입력창에서
 * 엔터를 치면 **메시지가 나가는 대신 앱 화면이 열린다.** 자동완성에는 세션
 * 커맨드와 나란히 서되, 힌트가 출처를 말한다 (opens in app).
 *
 * **정확히 이름만 쳤을 때만 가로챈다.** `/usage 어쩌고`처럼 뒤에 무언가 있으면
 * 세션에게 말하고 싶다는 뜻일 수 있으므로 보통 메시지로 나간다 — 가로채기가
 * 넓어질수록 "보냈는데 안 갔다"는 놀람의 표면적도 넓어진다.
 */
export type GuiCommand = { name: string; description: string; run: () => void }

export const GUI_COMMANDS: GuiCommand[] = [
  {
    name: 'usage',
    description: 'Plan limits & rate windows',
    run: () => useStore.getState().toggleUsage(true),
  },
  {
    name: 'settings',
    description: 'App settings',
    run: () => useStore.getState().toggleSettings(true),
  },
]

/** 보내려는 글이 GUI 커맨드 그 자체인가 — `/usage`(양끝 공백 허용)만 참 */
export function guiCommandFor(text: string): GuiCommand | null {
  const m = /^\/([a-z][a-z-]*)$/.exec(text.trim())
  return m ? (GUI_COMMANDS.find((c) => c.name === m[1]) ?? null) : null
}
