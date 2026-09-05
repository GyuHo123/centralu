import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal as Xterm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TerminalInfo } from '@cc/protocol'
import { usePlatform } from '../../app/PlatformProvider.jsx'
import { CloseIcon, PlusIcon } from '../../components/icons.jsx'
import { IconButton } from '../../components/IconButton.jsx'
import { useStore } from '../../store/store.js'

/**
 * 프로젝트 터미널 (여러 개).
 *
 * **터미널은 프로젝트(정확히는 디렉토리)의 것이다.** 세션의 것이 아니다.
 * 그래서 같은 프로젝트에서 세션을 바꿔도 같은 셸들이 그대로 이어진다 —
 * 돌려놓은 dev 서버나 tail이 세션을 옮길 때마다 죽으면 쓸 수가 없다.
 * (깃 워크트리 세션은 디렉토리가 다르므로 자기 터미널을 자동으로 갖는다)
 *
 * 패널이 길쭉하므로 세로로 쌓는다. 하나를 크게 보고 싶으면 패널 폭이 아니라
 * 개수를 줄이는 쪽이 맞다 — 그래서 닫기를 각 터미널에 둔다.
 */
export function TerminalPane({ projectId }: { projectId: string }) {
  const platform = usePlatform()
  const [terminals, setTerminals] = useState<TerminalInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  /*
   * 요청 세대 번호. 목록을 기다리는 사이 프로젝트를 바꾸면 늦은 응답이
   * **다른 프로젝트의 터미널**을 그리고, 빈 목록이었다면 옛 프로젝트에
   * 터미널을 하나 만들어 버린다 — 마지막 요청만 화면을 쓸 수 있게 한다.
   */
  const loadGen = useRef(0)
  const load = useCallback(async () => {
    const gen = ++loadGen.current
    try {
      const list = await platform.terminal.list(projectId)
      if (gen !== loadGen.current) return
      // 처음 열면 하나는 있어야 한다 — 빈 화면에 버튼만 있으면 한 단계가 더 든다
      if (list.length === 0) {
        const t = await platform.terminal.create(projectId, 80, 24)
        if (gen !== loadGen.current) return
        setTerminals([t])
        return
      }
      setTerminals(list)
    } catch (e) {
      if (gen === loadGen.current) setError((e as Error).message)
    }
  }, [platform, projectId])

  useEffect(() => {
    // 프로젝트가 바뀌었다 — 옛 프로젝트의 셸을 그대로 보여주면 안 된다
    setTerminals(null)
    setError(null)
    void load()
  }, [load])

  const add = async () => {
    try {
      const t = await platform.terminal.create(projectId, 80, 24)
      setTerminals((prev) => [...(prev ?? []), t])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const close = async (terminalId: string) => {
    await platform.terminal.close(terminalId).catch(() => {})
    // 닫으면 번호가 다시 매겨지므로 목록을 통째로 다시 읽는다
    await load()
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" data-testid="evidence-terminal">
      <div className="flex items-center gap-1.5 border-b border-edge px-3 py-1">
        <span className="text-[11px] uppercase tracking-[0.12em] text-slate">Terminal</span>
        {/* 글자를 빼고 기호만 남긴다 — 옆의 '터미널'이 이미 무엇에 대한 +인지 말해준다 */}
        <span className="ml-auto">
          <IconButton label="New terminal" onClick={() => void add()} testId="terminal-add" align="right">
            <PlusIcon size={16} />
          </IconButton>
        </span>
      </div>

      {error && (
        <p className="px-3 py-2 text-[11px] leading-relaxed text-ash" data-testid="terminal-error">
          Could not open terminal — {error}
        </p>
      )}

      <CommandsSection projectId={projectId} />

      <div className="flex min-h-0 flex-1 flex-col" data-testid="terminal-stack">
        {/*
          닫을 id는 TerminalView가 넘겨준다 — 재시작하면 host가 **새 id**를 발급하는데,
          목록의 t.terminalId로 닫으면 죽은 옛 id를 닫아서 닫기가 영영 안 먹었다.
        */}
        {(terminals ?? []).map((t) => (
          <TerminalView key={t.terminalId} info={t} onClose={(id) => void close(id)} />
        ))}
      </div>
    </section>
  )
}

const NO_COMMANDS: string[] = []

/**
 * 자주 쓰는 명령어 (#44 → #60에서 창 → 터미널 패널의 붙박이로).
 *
 * 창(CommandRunnerOverlay)이던 시절의 문제는 창이라는 것 자체였다: 데브 서버를
 * 돌려놓고 창을 닫으면 — 특히 그리드에서 칸을 내리면 — 돌고 있다는 사실이 화면
 * 어디에도 없었다. 실행 메커니즘은 그대로다: host의 **명령 전용 PTY**(셸에 타이핑이
 * 아니다 — 그래서 죽는 순간이 exit 이벤트로 온다), 명령별 마지막 실행 로그 하나가
 * host 버퍼에(재실행 전까지). 여기는 그 장부(store.commandRuns)의 투영일 뿐이라
 * 접었다 펴도 지울 것도 저장할 것도 없다.
 *
 * 접힘 규칙: 기본은 **도는 동안 펴짐** — 끝나면(정상이든 크래시든) 한 줄로 접히고
 * 종료 코드가 그 줄에 남는다. 크래시 로그는 줄을 누르면 다시 펴 볼 수 있다.
 * 사람이 손댄 접힘/펴짐은 그 명령의 다음 실행까지 기본을 이긴다.
 */
function CommandsSection({ projectId }: { projectId: string }) {
  const commands = useStore((s) => s.projects[projectId]?.commands ?? NO_COMMANDS)
  const runs = useStore((s) => s.commandRuns[projectId])
  const save = useStore((s) => s.setProjectCommands)
  const runCommand = useStore((s) => s.runCommand)
  const stopCommand = useStore((s) => s.stopCommand)
  const loadCommandRuns = useStore((s) => s.loadCommandRuns)
  const [draft, setDraft] = useState('')
  /** 사람이 정한 접힘/펴짐 — 없으면 "도는 동안 펴짐"이 기본이다 */
  const [expand, setExpand] = useState<Record<string, boolean>>({})

  // UI가 리로드돼도 host의 실행은 계속이다 — 열릴 때 장부를 다시 읽어야 뱃지가 참이다
  useEffect(() => {
    void loadCommandRuns(projectId)
  }, [loadCommandRuns, projectId])

  const add = () => {
    const next = draft.trim()
    if (!next) return
    setDraft('')
    void save(projectId, [...commands, next])
  }

  const run = (c: string) => {
    // 실행은 사람의 접힘 결정을 지운다 — 새 실행은 기본(도는 동안 펴짐)으로 돌아간다
    setExpand(({ [c]: _drop, ...rest }) => rest)
    void runCommand(projectId, c)
  }

  return (
    <section className="flex max-h-[50%] shrink-0 flex-col border-b border-edge" data-testid="commands-section">
      <div className="px-3 pt-1">
        <span className="text-[10px] uppercase tracking-[0.12em] text-slate">Commands</span>
      </div>
      <div className="min-h-0 overflow-y-auto">
        {commands.map((c, i) => {
          const r = runs?.[c]
          const open = expand[c] ?? !!r?.running
          return (
            <div key={`${i}-${c}`} data-testid={`cmd-row-${i}`}>
              <div className="group/cmd flex items-center gap-1.5 px-2 py-1">
                {/* 이름 줄이 곧 접힘/펴짐 과녁 — 로그는 host에 있으니 펴는 건 공짜다 */}
                <button
                  type="button"
                  data-testid={`cmd-toggle-${i}`}
                  onClick={() => setExpand((prev) => ({ ...prev, [c]: !open }))}
                  className="readout min-w-0 flex-1 truncate text-left text-[11px] text-ash transition-colors hover:text-chalk"
                  title={open ? `${c} — collapse log` : `${c} — expand log`}
                >
                  {c}
                </button>
                {r?.running && (
                  <span
                    className="size-1.5 shrink-0 animate-pulse rounded-full bg-chalk"
                    data-testid={`cmd-running-${i}`}
                    aria-label="running"
                  />
                )}
                {r && !r.running && (
                  <span className="readout shrink-0 text-[10px] text-slate" data-testid={`cmd-exit-${i}`}>
                    exit {r.exitCode ?? '?'}
                  </span>
                )}
                <button
                  type="button"
                  data-testid={`cmd-run-${i}`}
                  onClick={() => run(c)}
                  className="shrink-0 rounded border border-edge px-1.5 py-0.5 text-[10px] text-chalk transition-colors hover:border-graphite"
                >
                  {r?.running ? 'Restart' : 'Run'}
                </button>
                {r?.running && (
                  <button
                    type="button"
                    data-testid={`cmd-stop-${i}`}
                    onClick={() => void stopCommand(projectId, c)}
                    className="shrink-0 rounded border border-edge px-1.5 py-0.5 text-[10px] text-ash transition-colors hover:border-graphite hover:text-chalk"
                  >
                    Stop
                  </button>
                )}
                {/* 지우기는 실행과 다른 과녁 — 잘못 눌러 되돌릴 수 없는 쪽은 hover에만 보인다 */}
                <button
                  type="button"
                  data-testid={`cmd-delete-${i}`}
                  aria-label={`Remove ${c}`}
                  onClick={() => void save(projectId, commands.filter((_, j) => j !== i))}
                  className="shrink-0 rounded px-0.5 text-slate opacity-0 transition-opacity hover:text-chalk focus:opacity-100 group-hover/cmd:opacity-100"
                >
                  <CloseIcon size={10} />
                </button>
              </div>
              {open && r && (
                <div className="h-40 shrink-0 border-t border-edge/60" data-testid={`cmd-log-${i}`}>
                  {/* runId가 정체성 — 재실행이면 새 스트림을 처음부터 다시 그린다 */}
                  <CommandLog key={r.runId} projectId={projectId} command={c} runId={r.runId} />
                </div>
              )}
            </div>
          )
        })}
        {/* 등록 — 마지막 줄은 언제나 하나 더 추가하는 줄 (쓰고 싶은 순간이 곧 등록하는 순간) */}
        <div className="flex items-center gap-1.5 px-2 py-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
            }}
            placeholder="Add a command (runs in the project directory)"
            data-testid="cmd-add-input"
            className="readout min-w-0 flex-1 rounded border border-edge bg-void px-1.5 py-0.5 text-[11px] text-chalk placeholder:text-slate focus:border-graphite focus:outline-none"
          />
          <button
            type="button"
            data-testid="cmd-add"
            onClick={add}
            className="shrink-0 rounded border border-edge px-1.5 py-0.5 text-[10px] text-ash transition-colors hover:border-graphite hover:text-chalk"
          >
            Add
          </button>
        </div>
      </div>
    </section>
  )
}

/**
 * 명령 로그 하나 (읽기 전용 xterm — 색을 살리는 가장 싼 길이 터미널 에뮬레이터다).
 * 화면 복원은 host의 로그 버퍼가 한다: 붙는 순간 지금까지의 출력을 통째로 받고,
 * 그 뒤는 터미널과 같은 스트림(runId가 terminalId 자리)을 듣는다.
 */
function CommandLog({ projectId, command, runId }: { projectId: string; command: string; runId: string }) {
  const platform = usePlatform()
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return

    const term = new Xterm({
      fontSize: 11,
      fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
      theme: { background: '#121212', foreground: '#e9e9e9', cursor: '#121212', selectionBackground: '#2a2a2a' },
      disableStdin: true,
      scrollback: 5000,
      allowProposedApi: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)

    const lastDims = { cols: 0, rows: 0 }
    const syncSize = () => {
      try {
        fit.fit()
      } catch {
        // 아직 레이아웃이 없을 때가 있다 — 다음 기회에 맞춘다
      }
      const { cols, rows } = term
      if (cols < 2 || rows < 2) return
      if (cols === lastDims.cols && rows === lastDims.rows) return
      lastDims.cols = cols
      lastDims.rows = rows
      void platform.commands.resize(projectId, command, cols, rows).catch(() => {})
    }
    syncSize()

    // 지금까지의 로그를 통째로 — 그 뒤의 조각과 순서가 어긋나지 않게 스트림 구독을 먼저 건다
    const pendingChunks: string[] = []
    let replayed = false
    const offOutput = platform.terminal.onOutput((e) => {
      if (e.terminalId !== runId) return
      if (replayed) term.write(e.data)
      else pendingChunks.push(e.data)
    })
    const offExit = platform.terminal.onExit((e) => {
      if (e.terminalId !== runId) return
      term.write(`\r\n\x1b[2m— exited${e.exitCode !== null ? ` (${e.exitCode})` : ''} —\x1b[0m\r\n`)
    })
    void platform.commands
      .log(projectId, command)
      .then((run) => {
        // 재실행으로 다른 runId가 됐다면 이 뷰는 곧 교체된다 — 옛 로그를 그리지 않는다
        if (!run || run.runId !== runId) return
        term.write(run.history)
        for (const chunk of pendingChunks.splice(0)) term.write(chunk)
        replayed = true
        if (!run.running && run.exitCode !== null) {
          term.write(`\r\n\x1b[2m— exited (${run.exitCode}) —\x1b[0m\r\n`)
        }
      })
      .catch(() => {})

    let pending = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(pending)
      pending = requestAnimationFrame(syncSize)
    })
    ro.observe(el)

    return () => {
      cancelAnimationFrame(pending)
      ro.disconnect()
      offOutput()
      offExit()
      term.dispose()
    }
  }, [platform, projectId, command, runId])

  return <div ref={hostRef} className="h-full px-1 py-1" data-testid={`cmd-log-surface-${runId}`} />
}

/**
 * 터미널 하나.
 *
 * 화면 복원은 host의 스크롤백이 한다. 탭을 옮겼다 와도, 창을 껐다 켜도
 * 붙는 순간 지금까지의 출력을 받아 다시 그린다.
 * 컴포넌트가 사라져도 **셸은 죽이지 않는다** — 탭을 옮긴 것뿐이다.
 */
function TerminalView({ info, onClose }: { info: TerminalInfo; onClose: (terminalId: string) => void }) {
  const platform = usePlatform()
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Xterm | null>(null)
  const idRef = useRef(info.terminalId)
  /**
   * 마지막으로 셸에 알려준 크기.
   *
   * **같은 크기를 다시 보내면 안 된다.** pty resize는 SIGWINCH를 일으키고 셸은
   * 프롬프트를 다시 그린다. 그런데 fit()은 요소 레이아웃을 건드려 ResizeObserver를
   * 다시 깨우므로, 크기가 그대로여도 계속 도는 되먹임이 생긴다 —
   * 화면에는 프롬프트 줄만 끝없이 늘어나는 것으로 보인다 (도그푸딩에서 지적됨).
   */
  const lastDims = useRef({ cols: 0, rows: 0 })
  /**
   * 처음 붙을 때 한 번만 쓰는 지난 출력.
   *
   * props로 직접 읽으면 안 된다: 터미널을 하나 닫으면 목록을 다시 읽는데,
   * 그때 **살아남은 터미널들의 history도 새 스냅샷으로 바뀐다.** 그걸 의존성에 두면
   * effect가 다시 돌아 xterm이 통째로 재생성되고, 새로 만든 터미널은 기본 크기(80×24)로
   * 시작했다가 곧바로 실제 크기로 맞춰지면서 셸이 프롬프트를 다시 그린다 —
   * 닫을 때마다 줄이 늘어나는 것으로 보인다 (도그푸딩에서 두 번 지적됨).
   */
  const historyRef = useRef(info.history)
  historyRef.current = info.history
  const [dead, setDead] = useState(!info.alive)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return

    const term = new Xterm({
      fontSize: 11,
      fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
      // 완전 무채색 규칙은 우리 화면의 것이고, 셸 출력의 색까지 뺏지는 않는다.
      // 다만 바탕과 커서는 앱에 맞춘다.
      theme: { background: '#0c0c0c', foreground: '#e9e9e9', cursor: '#e9e9e9', selectionBackground: '#2a2a2a' },
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    termRef.current = term

    const safeFit = () => {
      try {
        fit.fit()
      } catch {
        // 아직 레이아웃이 없을 때가 있다 — 다음 기회에 맞춘다
      }
    }
    /** 크기가 **실제로 달라졌을 때만** 셸에 알린다 */
    const syncSize = () => {
      safeFit()
      const { cols, rows } = term
      if (cols < 2 || rows < 2) return
      if (cols === lastDims.current.cols && rows === lastDims.current.rows) return
      lastDims.current = { cols, rows }
      void platform.terminal.resize(idRef.current, cols, rows).catch(() => {})
    }

    safeFit()
    if (historyRef.current) term.write(historyRef.current)
    // 새 xterm은 기본 크기로 시작한다 — 이전 값과 비교하지 말고 반드시 한 번 알린다
    lastDims.current = { cols: 0, rows: 0 }
    syncSize()

    const offOutput = platform.terminal.onOutput((e) => {
      if (e.terminalId === idRef.current) term.write(e.data)
    })
    const offExit = platform.terminal.onExit((e) => {
      if (e.terminalId !== idRef.current) return
      setDead(true)
      term.write(`\r\n\x1b[2m— shell exited${e.exitCode !== null ? ` (${e.exitCode})` : ''} —\x1b[0m\r\n`)
    })
    const onData = term.onData((data) => {
      void platform.terminal.input(idRef.current, data).catch(() => {})
    })

    // 패널 폭·창 크기가 바뀌면 셸에도 알려야 줄바꿈이 깨지지 않는다.
    // 관찰 콜백은 한 프레임 뒤로 미뤄 연속 변경을 한 번으로 합친다.
    let pending = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(pending)
      pending = requestAnimationFrame(syncSize)
    })
    ro.observe(el)

    return () => {
      cancelAnimationFrame(pending)
      ro.disconnect()
      onData.dispose()
      offOutput()
      offExit()
      term.dispose()
      termRef.current = null
    }
    // **정체성은 terminalId뿐이다.** history·title이 바뀌었다고 다시 붙지 않는다
  }, [platform, info.terminalId])

  return (
    <div
      className="flex min-h-0 flex-1 flex-col border-b border-edge last:border-b-0"
      data-testid={`terminal-${info.terminalId}`}
    >
      <div className="flex items-center gap-1.5 px-2 py-0.5">
        <span className="readout truncate text-[10px] text-slate">{info.title}</span>
        {dead && (
          <button
            className="rounded px-1 text-[10px] text-ash transition-colors hover:text-chalk"
            data-testid={`terminal-restart-${info.terminalId}`}
            onClick={async () => {
              const term = termRef.current
              if (!term) return
              const next = await platform.terminal.restart(idRef.current, term.cols, term.rows)
              idRef.current = next.terminalId
              setDead(!next.alive)
              term.reset()
              if (next.history) term.write(next.history)
            }}
          >
            Restart
          </button>
        )}
        <span className="ml-auto">
          <IconButton
            label="Close terminal (the shell exits)"
            // props의 id가 아니라 **지금의** id — 재시작을 거쳤으면 둘이 다르다
            onClick={() => onClose(idRef.current)}
            testId={`terminal-close-${info.terminalId}`}
            align="right"
          >
            <CloseIcon size={11} />
          </IconButton>
        </span>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 px-1 pb-1" data-testid={`terminal-surface-${info.terminalId}`} />
    </div>
  )
}
