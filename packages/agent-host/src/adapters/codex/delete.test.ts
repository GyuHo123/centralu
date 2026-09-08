import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * 대화 원본 삭제 (도그푸딩 2026-09-07: "워크트리 세션을 잘못 만들었는데 안 지워져").
 *
 * 실측한 사정: codex는 thread/start에서 id만 발급하고 rollout 파일은 **첫 턴에** 쓴다.
 * 한 번도 말을 안 건 세션은 지울 파일이 없어 thread/delete가 -32600으로 거절하고,
 * 그 거절이 매니저에서 던져지면 세션 행도 워크트리도 남는다.
 *
 * 계약: **없는 것을 지우라는 요청은 성공**, 그 밖의 실패는 그대로 던진다.
 */
const state = vi.hoisted(() => ({
  requests: [] as string[],
  fail: null as string | null,
  disposed: 0,
}))

vi.mock('./client.js', () => ({
  CodexClient: class {
    request(method: string): Promise<unknown> {
      state.requests.push(method)
      if (method === 'thread/delete' && state.fail) return Promise.reject(new Error(state.fail))
      return Promise.resolve({})
    }
    notify(): void {}
    respond(): void {}
    async dispose(): Promise<void> {
      state.disposed++
    }
  },
}))

const { CodexAdapter } = await import('./index.js')

beforeEach(() => {
  state.requests.length = 0
  state.fail = null
  state.disposed = 0
})

describe('codex deleteExternalConversation', () => {
  it('지울 것이 있으면 thread/delete를 부른다', async () => {
    await new CodexAdapter().deleteExternalConversation('t1', '/tmp')
    expect(state.requests).toContain('thread/delete')
  })

  it('rollout이 없다는 거절은 성공이다 — 한 번도 안 쓴 세션이 그렇다', async () => {
    state.fail = '{"code":-32600,"message":"no rollout found for thread id 01a0"}'
    await expect(new CodexAdapter().deleteExternalConversation('t1', '/tmp')).resolves.toBeUndefined()
  })

  it('다른 실패는 삼키지 않는다 — 원본이 살아 있는데 지웠다고 답하면 안 된다', async () => {
    state.fail = 'permission denied'
    await expect(new CodexAdapter().deleteExternalConversation('t1', '/tmp')).rejects.toThrow(/permission denied/)
  })

  it('어느 쪽이든 단명 클라이언트는 닫는다', async () => {
    state.fail = '{"code":-32600,"message":"no rollout found for thread id x"}'
    await new CodexAdapter().deleteExternalConversation('t1', '/tmp')
    expect(state.disposed).toBe(1)
  })
})
