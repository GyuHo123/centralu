import { useCallback, useEffect, useState } from 'react'
import { TOOL_META, TOOL_NAMES, type ToolName, type UsageSnapshot } from '@cc/protocol'
import { usePlatform } from '../../app/PlatformProvider.jsx'
import { useStore, usageTools } from '../../store/store.js'
import { Tooltip } from '../../components/primitives.jsx'
import { UsagePanel } from './UsagePanel.jsx'
import { usageTone, weeklyWindow } from './weekly.js'

/**
 * 상단 바의 사용량 — **도구마다 주간 도넛 하나** (사용자 요청 2026-09-09).
 *
 * 예전에는 'Usage'라는 글자 버튼 하나였고, 누르면 화면 가운데 모달이 떴다. 두 가지가
 * 아쉬웠다: ① 계기판에 숫자가 없으니 한도는 **물어봐야만** 아는 것이었고, ② 답이
 * 열리는 자리가 누른 자리에서 멀었다.
 *
 * 이제 도넛이 계기판에 상주한다 — 채운 만큼이 밝기로 보이고, 가운데에는 **그 도구의
 * 한 글자 표식**이 앉는다 (사이드바 세션 칩과 같은 글자라, 무엇의 한도인지 범례 없이
 * 읽힌다). 상세는 그 도넛 **바로 아래로** 내려온다.
 *
 * 주간만 세우는 이유: 계기판은 한 눈에 읽는 자리고, 5시간 창은 금방 회복돼 "지금 급한가"를
 * 말하지 않는다. 나머지 창은 전부 상세에 있다.
 */
export function UsageDonuts() {
  const platform = usePlatform()
  const usageOpen = useStore((s) => s.usageOpen)
  const toggleUsage = useStore((s) => s.toggleUsage)
  const [snap, setSnap] = useState<Partial<Record<ToolName, { usage: UsageSnapshot | null; reason?: string }>>>({})
  const [open, setOpen] = useState<ToolName | null>(null)

  const load = useCallback(() => {
    for (const tool of TOOL_NAMES) {
      void platform.agents
        .usage(tool)
        .then((r) => setSnap((s) => ({ ...s, [tool]: { usage: r.usage, reason: r.supported ? undefined : r.reason } })))
        .catch((e: Error) => setSnap((s) => ({ ...s, [tool]: { usage: null, reason: e.message } })))
    }
  }, [platform])

  /*
   * 뜰 때 한 번, 그 뒤로는 5분마다. 한도는 분 단위로 움직이는 값이라 초 단위 폴링은
   * 답을 바꾸지 않으면서 도구 프로세스만 두드린다 (claude는 살아 있는 세션에 묻는다).
   */
  useEffect(() => {
    load()
    const t = setInterval(load, 5 * 60_000)
    return () => clearInterval(t)
  }, [load])

  /*
   * 팔레트·/usage로 열면 **지금 보고 있는 도구**의 상세가 열린다 (usageTools) — 화면에
   * 그 도구가 없으면 첫 도넛. 문이 둘이어도 도착하는 곳은 하나다.
   */
  useEffect(() => {
    if (usageOpen) setOpen((cur) => cur ?? usageTools(useStore.getState())[0] ?? TOOL_NAMES[0] ?? null)
    else setOpen(null)
  }, [usageOpen])

  const show = (tool: ToolName | null) => {
    setOpen(tool)
    toggleUsage(tool !== null)
    if (tool) load()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      show(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <span className="relative flex items-center gap-1.5" data-testid="usage-donuts">
      {TOOL_NAMES.map((tool) => (
        <Donut
          key={tool}
          tool={tool}
          snap={snap[tool]}
          active={open === tool}
          onClick={() => show(open === tool ? null : tool)}
        />
      ))}

      {open && (
        <>
          {/* 바깥을 누르면 닫힌다 — 화면을 덮되 어둡히지 않는다 (인박스와 같은 규칙) */}
          <div className="fixed inset-0 z-30" onClick={() => show(null)} data-testid="usage-backdrop" />
          <div
            className="cc-drop absolute right-0 top-full z-40 mt-1 w-[420px] max-w-[calc(92vw/var(--text-zoom))] overflow-hidden rounded-lg border border-edge bg-pit shadow-[0_24px_60px_-12px_rgb(0_0_0/0.9)]"
            data-testid="usage-drop"
          >
            <header className="flex items-center gap-2 border-b border-edge px-4 py-2">
              <h2 className="text-[13px] font-medium text-chalk">Usage</h2>
              <span className="readout text-[11px] text-slate">{TOOL_META[open].label}</span>
            </header>
            <div className="max-h-[calc(60vh/var(--text-zoom))] overflow-y-auto">
              <UsagePanel tool={open} />
            </div>
          </div>
        </>
      )}
    </span>
  )
}

/**
 * 도넛 하나 — 고리는 주간 사용량, 가운데는 도구의 한 글자.
 *
 * 숫자를 모를 때 **꽉 찬 회색 고리를 그리지 않는다**: 그건 "0% 썼다"로 읽힌다.
 * 점선 고리는 모른다는 뜻이고, 왜 모르는지는 눌러서 여는 상세가 답한다
 * (claude는 살아 있는 세션이 있어야 한도를 물을 수 있다 — 흔한 '모름'의 이유다).
 */
function Donut({
  tool,
  snap,
  active,
  onClick,
}: {
  tool: ToolName
  snap?: { usage: UsageSnapshot | null; reason?: string }
  active: boolean
  onClick: () => void
}) {
  const w = snap?.usage ? weeklyWindow(snap.usage.windows) : null
  const known = w !== null
  const percent = w?.percent ?? 0
  const R = 9
  const C = 2 * Math.PI * R
  const filled = (Math.max(0, Math.min(100, percent)) / 100) * C
  const tone = known ? usageTone(percent) : 'text-slate'

  return (
    <Tooltip
      testId={`usage-donut-tip-${tool}`}
      content={
        <span className="block">
          <span className="block text-chalk">{TOOL_META[tool].label}</span>
          <span className="readout mt-1 block">
            {known ? `Weekly ${percent}% used` : 'Weekly usage unknown'}
          </span>
        </span>
      }
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`${TOOL_META[tool].label} weekly usage${known ? ` ${percent}%` : ' unknown'}`}
        data-testid={`usage-donut-${tool}`}
        data-percent={known ? percent : ''}
        /*
         * 열려 있는 동안에도 **다른 도넛을 바로 누를 수 있어야 한다** — 바깥 클릭 막이
         * 도넛까지 덮으면 도구를 바꾸는 데 두 번 눌러야 한다. 그래서 막보다 위에 선다.
         */
        className={`relative z-40 flex items-center rounded p-0.5 transition-colors hover:bg-graphite/50 ${
          active ? 'bg-graphite/50' : ''
        }`}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <circle
            cx="12"
            cy="12"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-edge"
            {...(known ? {} : { strokeDasharray: '2 3' })}
          />
          {known && (
            <circle
              cx="12"
              cy="12"
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${C - filled}`}
              // 12시에서 시작해야 사람이 읽는 방향과 맞는다 (상세의 큰 도넛과 같은 규칙)
              transform="rotate(-90 12 12)"
              className={tone}
            />
          )}
          {/*
            가운데 글자 = 사이드바 세션 칩과 **같은 표식**. 도넛이 둘 서 있을 때 어느
            것이 무엇인지 범례 없이 읽히는 이유가 이 한 글자다.
          */}
          <text
            x="12"
            y="12"
            textAnchor="middle"
            dominantBaseline="central"
            className={`fill-current font-mono ${known ? 'text-chalk' : 'text-slate'}`}
            style={{ fontSize: '9px' }}
          >
            {TOOL_META[tool].mark}
          </text>
        </svg>
      </button>
    </Tooltip>
  )
}
