import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/store.js'
import { useInbox } from '../../store/selectors.js'
import { letterOf } from '../../app/keys.js'
import { Kbd, StateDot, formatWaiting, waitingTone } from '../../components/primitives.jsx'

/**
 * 인박스 (FR-15) — 자리로 돌아왔을 때의 진입점.
 * 프로젝트 구조를 무시하고 "지금 내 개입을 기다리는 것"만 긴급도 순으로 보여준다.
 *
 * **상단 바 숫자 아래로 내려오는 드롭다운이다** (사용자 요청 2026-09-09). 화면 가운데
 * 모달이던 동안에는 누른 자리와 열린 자리가 멀어서, 숫자를 확인하고 목록을 여는 한
 * 동작이 눈을 두 번 움직이게 했다. 자리는 옮겼지만 **키보드 소유권은 그대로다** —
 * ↑↓·↵·esc로 목록을 비우는 것이 이 화면의 본체고, 그건 자리와 무관하다.
 */
export function Inbox() {
  const open = useStore((s) => s.inboxOpen)
  const toggle = useStore((s) => s.toggleInbox)
  const focusSession = useStore((s) => s.focusSession)
  const projects = useStore((s) => s.projects)
  const [now, setNow] = useState(() => Date.now())
  const items = useInbox(now)
  const [cursor, setCursor] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  // 경과 시간 갱신 (1초 폴링은 표시 전용 — 상태는 이벤트 구동)
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    // 인박스는 모달이다 — 키보드 소유권을 가져온다.
    // 메시지를 보낸 직후엔 입력창에 포커스가 남아 있어, 그대로 두면 d·j·k가 본문에 타이핑된다.
    ;(document.activeElement as HTMLElement | null)?.blur()
    panelRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      // 글자는 뜻으로 읽는다 — 한글 자판에서 j·k·d는 ㅓ·ㅏ·ㅇ으로 도착한다 (app/keys.ts)
      const letter = letterOf(e)
      if (e.key === 'ArrowDown' || letter === 'j') setCursor((c) => Math.min(c + 1, items.length - 1))
      else if (e.key === 'ArrowUp' || letter === 'k') setCursor((c) => Math.max(c - 1, 0))
      else if (e.key === 'Enter') {
        const item = items[cursor]
        if (item) {
          focusSession(item.id, { preferGrid: true })
          toggle(false)
        }
      } else if (e.key === 'Escape') toggle(false)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, items, cursor, focusSession, toggle])

  if (!open) return null

  return (
    <>
      {/* 바깥을 누르면 닫힌다. 화면을 덮되 어둡히지 않는다 — 드롭다운은 화면을 뺏지 않는다 */}
      <div className="fixed inset-0 z-30" onClick={() => toggle(false)} data-testid="inbox-backdrop" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label="Waiting"
        className="cc-drop absolute left-0 top-full z-40 mt-1 w-[560px] max-w-[calc(92vw/var(--text-zoom))] overflow-hidden rounded-lg border border-edge bg-pit shadow-[0_24px_60px_-12px_rgb(0_0_0/0.9)] focus:outline-none"
        data-testid="inbox"
      >
        <header className="flex items-baseline gap-2 border-b border-edge px-4 py-2.5">
          <h2 className="text-[12px] font-medium text-chalk">Waiting</h2>
          <span className="readout text-[11px] text-slate">{items.length}</span>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-slate">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> Move
            <Kbd>↵</Kbd> Open
            <Kbd>esc</Kbd> Close
          </span>
        </header>

        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-ash" data-testid="inbox-empty">
            Nothing waiting
            <span className="mt-1 block text-[11px] text-slate">Finished agents collect here</span>
          </p>
        ) : (
          <ul className="max-h-[calc(56vh/var(--text-zoom))] overflow-y-auto">
            {items.map((it, i) => (
              <li key={it.id}>
                <button
                  className={`flex w-full items-center gap-2.5 border-l-2 py-2 pl-3 pr-4 text-left transition-colors ${
                    i === cursor ? 'border-l-ash bg-graphite/40' : 'border-l-transparent hover:bg-graphite/20'
                  }`}
                  onClick={() => {
                    focusSession(it.id, { preferGrid: true })
                    toggle(false)
                  }}
                  data-testid={`inbox-item-${it.id}`}
                >
                  <StateDot state={it.state} />
                  <span className={`truncate text-[13px] ${it.unread ? 'text-chalk' : 'text-ash'}`}>
                    {it.name}
                  </span>
                  <span className="truncate text-[11px] text-slate">
                    {(it.projectId ? projects[it.projectId]?.name : 'Orchestrator') ?? ''}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2.5">
                    <span className="text-[11px] text-slate">
                      {it.state === 'waiting_approval'
                        ? 'Needs approval'
                        : it.state === 'error'
                          ? 'Error'
                          : 'Waiting for input'}
                    </span>
                    {/* 오래 기다릴수록 밝아진다 — 새 도형 없이 시간 압력만 말한다 */}
                    <span className={`readout w-16 text-right text-[11px] ${waitingTone(it.waitingMs)}`}>
                      {formatWaiting(it.waitingMs)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
