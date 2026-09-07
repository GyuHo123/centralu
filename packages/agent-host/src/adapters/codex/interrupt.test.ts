import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * 스톱이 안 먹던 버그 (도그푸딩 2026-09-07: "툴 호출만 멈추고 몇 초 뒤 다시 시작돼").
 *
 * 실측한 원인은 한 줄이었다 — `turn/interrupt`에 threadId만 실어 보냈고, 서버는
 * `Invalid request: missing field \`turnId\`` (-32600)로 **거절**했다. 거절은 에러
 * 이벤트로만 흘렀고 턴은 끝까지 돌았다. 그래서 여기서 보는 것은 하나다:
 * **멈추라는 말이 어느 턴을 가리키는가.**
 */
const state = vi.hoisted(() => ({
  requests: [] as { method: string; params: Record<string, unknown> | undefined }[],
  handlers: null as null | { onNotification: (n: { method: string; params?: unknown }) => void },
  /** turn/start 응답에 실어 줄 턴 (알림이 먼저인지 응답이 먼저인지를 시험이 정한다) */
  startTurnId: null as string | null,
}))

vi.mock('./client.js', () => ({
  CodexClient: class {
    constructor(handlers: { onNotification: (n: { method: string; params?: unknown }) => void }) {
      state.handlers = handlers
    }
    request(method: string, params?: Record<string, unknown>): Promise<unknown> {
      state.requests.push({ method, params })
      if (method === 'thread/start') return Promise.resolve({ thread: { id: 't1' } })
      if (method === 'turn/start' && state.startTurnId) return Promise.resolve({ turn: { id: state.startTurnId } })
      return Promise.resolve({})
    }
    notify(): void {}
    respond(): void {}
    async dispose(): Promise<void> {}
  },
}))

const { CodexAdapter } = await import('./index.js')

const tick = () => new Promise((r) => setTimeout(r, 0))
const interrupts = () => state.requests.filter((r) => r.method === 'turn/interrupt')

beforeEach(() => {
  state.requests.length = 0
  state.startTurnId = null
})

async function session() {
  const adapter = new CodexAdapter()
  return adapter.createSession({ sessionId: 's1', cwd: '/tmp', permissionPreset: 'normal' }, () => {})
}

describe('codex 스톱 — 도는 턴을 가리켜야 멈춘다', () => {
  it('turn/started가 알려준 턴을 과녁으로 삼는다', async () => {
    const h = await session()
    h.send('오래 걸리는 일')
    await tick()
    state.handlers!.onNotification({ method: 'turn/started', params: { threadId: 't1', turn: { id: 'turn-7' } } })

    h.interrupt()
    expect(interrupts()[0]?.params).toEqual({ threadId: 't1', turnId: 'turn-7' })
  })

  it('알림보다 응답이 먼저 와도 멈춘다 — 아주 빨리 누르는 경우', async () => {
    state.startTurnId = 'turn-9'
    const h = await session()
    h.send('오래 걸리는 일')
    await tick()
    await tick()

    h.interrupt()
    expect(interrupts()[0]?.params).toEqual({ threadId: 't1', turnId: 'turn-9' })
  })

  it('턴이 끝난 뒤의 스톱은 아무 데도 안 보낸다 — 끝난 턴을 멈추라면 거절이 돌아온다', async () => {
    const h = await session()
    h.send('짧은 일')
    await tick()
    state.handlers!.onNotification({ method: 'turn/started', params: { threadId: 't1', turn: { id: 'turn-7' } } })
    state.handlers!.onNotification({ method: 'turn/completed', params: { threadId: 't1', turn: { id: 'turn-7' } } })

    h.interrupt()
    expect(interrupts()).toHaveLength(0)
  })

  it('한 번도 안 보낸 세션에서 눌러도 조용하다', async () => {
    const h = await session()
    h.interrupt()
    expect(interrupts()).toHaveLength(0)
  })
})
