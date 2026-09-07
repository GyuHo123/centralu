/**
 * L3 스모크: 스톱이 정말 멈추나 (도그푸딩 2026-09-07 — "툴만 멈추고 몇 초 뒤 다시 시작돼").
 *
 * 원인은 인자 하나였다: `turn/interrupt`에 threadId만 실어 보냈고 서버는
 * `missing field turnId`(-32600)로 거절했다. 거절은 에러 이벤트로만 흘렀고 턴은 끝까지
 * 돌았다 — 화면은 멈춘 듯 보이는데 모델은 20초를 더 일했다.
 *
 * 단위 시험은 "무엇을 보내는가"를 본다. 여기서는 **진짜 codex에게 보내고 조용해지는지**를
 * 본다. 그 둘은 다른 질문이고, 이 버그는 후자에서만 보였다.
 *
 * 실행: pnpm smoke:interrupt   (codex 로그인 필요)
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureToolPath } from '../src/env-path.js'
import type { NormalizedEvent } from '@cc/protocol'

ensureToolPath()
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const { CodexAdapter } = await import('../src/adapters/codex/index.js')
const cwd = mkdtempSync(join(tmpdir(), 'cc-interrupt-'))
const events: NormalizedEvent[] = []
const adapter = new CodexAdapter()
const h = await adapter.createSession({ sessionId: 'int-x', cwd, permissionPreset: 'auto' }, (e) => {
  events.push(e)
  if (e.type === 'error') console.log('[codex] error:', e.error.message)
})

h.send('세 번에 나눠서 bash로 `sleep 5`를 실행하고, 각각 끝나면 한 줄씩 말해줘.')
// 도구가 실제로 돌기 시작할 때까지 (여기서 멈춰야 의미가 있다)
for (let i = 0; i < 40 && !events.some((e) => e.type === 'tool_call'); i++) await wait(500)
const started = events.some((e) => e.type === 'tool_call')
console.log('[codex] 도구 실행 시작:', started ? 'O' : 'X (모델이 안 움직였다 — 다시 돌려보세요)')

h.interrupt()
const mark = events.length
// 끊긴 턴의 tool_result·usage 정도는 뒤따라온다. 문제는 **모델이 계속 말하느냐**다
await wait(20_000)
const after = events.slice(mark)
const kept = after.filter((e) => e.type === 'message_delta' || e.type === 'tool_call')
console.log(`[codex] 스톱 뒤 20초: 새 이벤트 ${after.length}건, 그중 모델이 계속 일한 흔적 ${kept.length}건`)
console.log('[codex] 스톱:', kept.length === 0 ? 'O (조용해졌다)' : `X (${kept.length}건 더 일했다)`)
console.log('[codex] 에러 없이 멈췄나:', after.some((e) => e.type === 'error') ? 'X' : 'O')

await h.dispose().catch(() => {})
rmSync(cwd, { recursive: true, force: true })
process.exit(kept.length === 0 ? 0 : 1)
