import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * 화면이 터졌을 때 **빈 페이지 대신 문장을 남긴다** (도그푸딩 2026-09-07: "오류 생겼다고
 * 하고 빈 화면이 되었어").
 *
 * React는 렌더 중에 던져진 예외를 잡아 줄 곳이 없으면 트리를 통째로 unmount한다 —
 * 화면이 하얗게 빈다. 그 상태에서 사람이 알 수 있는 건 아무것도 없다: 무엇이 터졌는지도,
 * 다시 뜰 방법이 있는지도. 우리 앱은 하루 종일 떠 있는 창이라 그 빈 화면이 곧 "앱이
 * 죽었다"로 읽힌다.
 *
 * 그래서 여기서 잡고 **세 가지만** 말한다: 무엇이 터졌나(메시지), 어디서(스택 첫 줄들),
 * 그리고 나가는 문(다시 불러오기). 자동으로 되살리지는 않는다 — 같은 렌더가 다시
 * 터지면 깜빡임만 남고, 무엇이 잘못됐는지는 영영 안 보인다.
 *
 * 클래스 컴포넌트인 이유는 하나다: 훅에는 이 자리(componentDidCatch)가 없다.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 콘솔에도 남긴다 — 개발 중에는 이쪽이 먼저 눈에 들어온다
    console.error('[centralu] render crashed', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const detail = [error.message, error.stack?.split('\n').slice(1, 4).join('\n')].filter(Boolean).join('\n')
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-void p-8 text-chalk">
        <p className="text-[14px]" data-testid="app-crashed">
          Something in this screen crashed.
        </p>
        <p className="max-w-lg text-center text-[12px] leading-relaxed text-ash">
          Your sessions are not affected — they run in the agent host, not in this window. Reloading
          rebuilds the screen from the host.
        </p>
        <pre className="readout max-h-40 max-w-lg overflow-auto rounded border border-edge bg-panel p-3 text-[10px] leading-relaxed text-slate">
          {detail}
        </pre>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="app-crashed-reload"
            onClick={() => location.reload()}
            className="rounded border border-edge px-3 py-1.5 text-[12px] text-chalk transition-colors hover:border-graphite hover:bg-graphite/25"
          >
            Reload
          </button>
          <button
            type="button"
            data-testid="app-crashed-copy"
            onClick={() => void navigator.clipboard?.writeText(`${error.message}\n${error.stack ?? ''}`)}
            className="rounded border border-edge px-3 py-1.5 text-[12px] text-ash transition-colors hover:border-graphite hover:text-chalk"
          >
            Copy details
          </button>
        </div>
      </div>
    )
  }
}
