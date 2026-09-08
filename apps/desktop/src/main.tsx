import { useCallback, useEffect, useState, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@cc/ui'
import { createTauriPlatform, focusWindow } from '@cc/platform/tauri'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import '../../../packages/ui/src/styles/index.css'

/**
 * 데스크톱 진입점 — 구현체를 아는 두 곳 중 하나 (docs/platform-abstraction.md §4).
 * apps/web과 다른 것은 createTauriPlatform 한 줄뿐이다.
 */
const root = createRoot(document.getElementById('root')!)

// **먼저 무언가를 그린다.** host를 기다리는 동안 아무것도 렌더하지 않으면
// 빈 검은 창이 뜨고, 그건 고장으로 보인다 (도그푸딩에서 지적됨).
root.render(<Starting />)

createTauriPlatform()
  .then(async (platform) => {
    root.render(<DesktopRoot platform={platform} />)
    await registerGlobalShortcut()
  })
  .catch((err: Error) => root.render(<StartupFailure message={err.message} />))

/**
 * ⌘Q·⌘W 즉시 종료 방지 (도그푸딩 2026-09-04) — 데스크톱만의 관심사라 여기 산다.
 *
 * Rust가 종료로 가는 길(메뉴의 Quit·⌘Q·창 닫기)을 붙잡고 `quit-requested`를 쏘면,
 * 이 모달이 묻는다. "Quit"만이 quit_app을 불러 관문을 연다 — 오타 한 번이
 * 도는 세션 전부를 내리는 앱에서 종료는 두 동작이어야 한다.
 * 웹 빌드(apps/web)에는 이 길 자체가 없다: 브라우저 탭 닫기는 브라우저의 일이다.
 */
function DesktopRoot({ platform }: { platform: ComponentProps<typeof App>['platform'] }) {
  const [askQuit, setAskQuit] = useState(false)
  /**
   * 우리 폴더에서 아직 도는 남은 프로세스 (사용자 요청 2026-09-07).
   *
   * 에이전트가 bash로 띄운 데브 서버는 종료 절차가 못 잡는다 — 실측하면 그 프로세스는
   * ppid=1에 자기 프로세스 그룹이라 부모 사슬도 그룹도 우리와 끊겨 있다. 그래서 죽이는
   * 대신 **여기서 보여준다.** 종료 모달은 이미 "정말 끌 거냐"를 읽는 자리라, 남는 것이
   * 있다는 사실이 놓일 자리로 이만한 곳이 없다.
   *
   * **기본은 끈 채다.** 같은 폴더에서 사람이 직접 띄운 것도 이 목록에 들 수 있고, 앱이
   * 말없이 죽이면 고아를 없애려다 남의 일을 끊는다. 목록이 눈앞에 있으니 한 번 누르면
   * 함께 정리된다 — 고르는 쪽이 사람이다.
   */
  const [strays, setStrays] = useState<{ pid: number; command: string; cwd: string }[]>([])
  const [alsoStop, setAlsoStop] = useState(false)
  const quit = useCallback(async () => {
    if (alsoStop && strays.length > 0) {
      // 실패해도 종료를 막지 않는다 — 사람이 누른 것은 '끄기'였다
      await platform.processes.stop(strays.map((s) => s.pid)).catch(() => {})
    }
    await invoke('quit_app')
  }, [alsoStop, strays, platform])

  useEffect(() => {
    const un = listen('quit-requested', () => {
      setAskQuit(true)
      setAlsoStop(false)
      void platform.processes
        .strays()
        .then(setStrays)
        .catch(() => setStrays([]))
      // 최소화된 채 ⌘Q면 모달이 안 보여 "종료가 안 되는 앱"이 된다 — 물을 때는 얼굴을 보인다
      void focusWindow()
    })
    return () => void un.then((f) => f())
  }, [platform.processes])
  useEffect(() => {
    if (!askQuit) return
    const onKey = (e: KeyboardEvent) => {
      // Enter = 종료, Esc = 계속 — 모달이 떠 있는 동안 앱의 다른 단축키를 먹지 않게 캡처 단계에서 끊는다
      if (e.key === 'Escape') {
        e.stopPropagation()
        setAskQuit(false)
      } else if (e.key === 'Enter') {
        e.stopPropagation()
        void quit()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [askQuit, quit])
  return (
    <>
      <App platform={platform} />
      {askQuit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          data-testid="confirm-quit"
          onClick={() => setAskQuit(false)}
        >
          <div
            className="w-[360px] rounded-lg border border-edge bg-pit p-4 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.9)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[13px] text-chalk">Quit Centralu?</p>
            <p className="mt-2 text-[11px] leading-relaxed text-ash">
              Running agent processes stop with the app. Conversations are saved and resume when
              you come back.
            </p>
            {strays.length > 0 && (
              <div className="mt-3 rounded border border-edge bg-void p-2" data-testid="quit-strays">
                <p className="text-[11px] text-ash">
                  {strays.length} process{strays.length > 1 ? 'es' : ''} started in your project
                  folders will keep running:
                </p>
                <ul className="mt-1 max-h-24 overflow-y-auto">
                  {strays.slice(0, 6).map((s) => (
                    <li key={s.pid} className="readout truncate text-[10px] text-slate" title={s.cwd}>
                      {s.pid} · {s.command}
                    </li>
                  ))}
                  {strays.length > 6 && (
                    <li className="text-[10px] text-slate">…and {strays.length - 6} more</li>
                  )}
                </ul>
                <label className="mt-2 flex items-center gap-1.5 text-[11px] text-ash">
                  <input
                    type="checkbox"
                    className="accent-graphite"
                    checked={alsoStop}
                    onChange={(e) => setAlsoStop(e.target.checked)}
                    data-testid="quit-stop-strays"
                  />
                  Stop them too
                </label>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded px-2 py-1 text-[12px] text-slate hover:text-chalk"
                onClick={() => setAskQuit(false)}
                data-testid="confirm-quit-no"
              >
                Cancel <span className="text-[10px] text-slate">esc</span>
              </button>
              <button
                className="rounded border border-del/40 bg-del-bg px-3 py-1 text-[12px] text-del hover:border-del/70"
                onClick={() => void quit()}
                data-testid="confirm-quit-yes"
              >
                Quit <span className="text-[10px]">⏎</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Starting() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-2 bg-void" data-testid="starting">
      <p className="text-[13px] text-ash">Starting the agent host…</p>
      {/* Not "macOS may ask": it is the OS that asks, and on Linux nothing asks at all.
          Naming one OS in a message every platform sees makes it read as a bug elsewhere. */}
      <p className="text-[11px] text-slate">On first run, your system may ask for folder access.</p>
    </div>
  )
}

/** host가 뜨지 않으면 앱이 빈 화면으로 남지 않게, 무엇이 잘못됐는지 보여준다 */
function StartupFailure({ message }: { message: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-void px-8 text-center">
      <p className="text-[13px] text-chalk">Could not start the agent host</p>
      {/* 사이드카가 준 문장은 여러 줄이다 (무엇이 없는지, 어디를 찾아봤는지) — 줄을 살려서 보여준다 */}
      <p className="max-w-md whitespace-pre-line font-mono text-[11px] leading-relaxed text-ash">{message}</p>
      <p className="max-w-md text-[11px] leading-relaxed text-slate">
        If restarting hits the same problem, check <span className="font-mono">~/.centralu/host.log</span>.
      </p>
      <button
        className="mt-1 rounded border border-edge bg-panel px-3 py-1 text-[12px] text-chalk hover:border-graphite"
        onClick={() => location.reload()}
      >
        Retry
      </button>
    </div>
  )
}

/**
 * 앱이 백그라운드일 때도 대기 세션을 부를 수 있어야 한다 (FR-17, B-4).
 * 창을 앞으로 가져온 뒤 UI의 "다음 대기로 이동"을 그대로 실행한다.
 */
async function registerGlobalShortcut() {
  try {
    const { register, isRegistered } = await import('@tauri-apps/plugin-global-shortcut')
    const accelerator = 'CommandOrControl+Shift+A'
    if (await isRegistered(accelerator)) return
    await register(accelerator, async (event) => {
      if (event.state !== 'Pressed') return
      await focusWindow()
      window.dispatchEvent(new CustomEvent('cc:next-waiting'))
    })
  } catch (e) {
    // 단축키가 이미 다른 앱에 잡혀 있어도 앱은 정상 동작해야 한다
    console.warn('Could not register the global shortcut', e)
  }
}
