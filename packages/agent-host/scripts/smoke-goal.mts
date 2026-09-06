/**
 * L3 스모크: 골 상태가 실제로 흐르는가 (2026-09-07 — 도그푸딩 "배지가 안 보였어").
 *
 * claude: 실측 결론 — 헤드리스 SDK에 /goal이 **없다** (원류에 active_goal 0건,
 *   모델이 역할극만 함). 어댑터가 가로채 정직하게 거절하는지를 본다.
 * codex: /goal은 우리 가로채기 → thread/goal/set·get·clear. set의 updated 알림이
 *   goal 이벤트가 되는지, clear가 null로 오는지 — 토큰 없이 프로토콜만으로 본다.
 *
 * 실행: npx tsx packages/agent-host/scripts/smoke-goal.mts [claude|codex]
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureToolPath } from '../src/env-path.js'
import type { NormalizedEvent } from '@cc/protocol'

ensureToolPath()
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const only = process.argv[2]

async function waitFor(events: NormalizedEvent[], pred: (e: NormalizedEvent) => boolean, ms: number) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const hit = events.find(pred)
    if (hit) return hit
    await wait(300)
  }
  return null
}

async function codexSmoke() {
  const { CodexAdapter } = await import('../src/adapters/codex/index.js')
  const cwd = mkdtempSync(join(tmpdir(), 'cc-goal-x-'))
  const events: NormalizedEvent[] = []
  const adapter = new CodexAdapter()
  const h = await adapter.createSession({ sessionId: 'goal-x', cwd, permissionPreset: 'auto' }, (e) => {
    events.push(e)
    if (e.type === 'goal') console.log('[codex] goal 이벤트:', JSON.stringify(e.goal))
    if (e.type === 'message_delta') console.log('[codex] 채팅 줄:', e.text)
    if (e.type === 'error') console.log('[codex] error:', e.error.message)
  })

  h.send('/goal 빌드를 초록으로 유지')
  const set = await waitFor(events, (e) => e.type === 'goal' && e.goal !== null, 15_000)
  console.log('[codex] set 후 goal 이벤트:', set ? 'O' : 'X (안 옴)')

  h.send('/goal')
  await waitFor(events, (e) => e.type === 'message_delta' && /Goal|goal/.test(e.text ?? ''), 10_000)

  const before = events.length
  h.send('/goal clear')
  const cleared = await waitFor(
    events,
    (e, i = events.indexOf(e)) => i >= before && e.type === 'goal' && e.goal === null,
    15_000,
  )
  console.log('[codex] clear 후 goal:null 이벤트:', cleared ? 'O' : 'X (안 옴)')

  await h.dispose().catch(() => {})
  rmSync(cwd, { recursive: true, force: true })
  return { set: !!set, cleared: !!cleared }
}

async function claudeSmoke() {
  /*
   * 실측 결론 (2026-09-07): 헤드리스 SDK에 /goal은 **없다** — 원류 프로브에서
   * active_goal 0건, local_command_output 0건이었고 모델이 골 역할극만 했다.
   * 그래서 어댑터가 가로채 정직한 한 줄을 답한다. 이 스모크는 그 거절과,
   * SDK가 골 API를 열면 다시 잴 것(active_goal 수신 배선은 이미 있다)을 기록한다.
   */
  const { ClaudeAdapter } = await import('../src/adapters/claude/index.js')
  const cwd = mkdtempSync(join(tmpdir(), 'cc-goal-c-'))
  const events: NormalizedEvent[] = []
  const adapter = new ClaudeAdapter()
  const h = await adapter.createSession(
    { sessionId: 'goal-c', cwd, permissionPreset: 'auto', model: 'haiku' },
    (e) => {
      events.push(e)
      if (e.type === 'goal') console.log('[claude] goal 이벤트:', JSON.stringify(e.goal))
      if (e.type === 'message_delta') console.log('[claude] 채팅 줄:', (e.text ?? '').slice(0, 120))
    },
  )

  h.send('/goal a file named done.txt exists in this directory')
  const notice = await waitFor(
    events,
    (e) => e.type === 'message_delta' && /not available for Claude/.test(e.text ?? ''),
    5_000,
  )
  console.log('[claude] 정직한 거절 한 줄:', notice ? 'O' : 'X (안 옴)')

  await h.dispose().catch(() => {})
  rmSync(cwd, { recursive: true, force: true })
  return { any: !!notice }
}

console.log('=== 골 스모크 ===')
if (only !== 'claude') {
  const x = await codexSmoke()
  console.log(`[codex] 판정: set=${x.set ? 'O' : 'X'} clear=${x.cleared ? 'O' : 'X'}`)
}
if (only !== 'codex') {
  const c = await claudeSmoke()
  console.log(`[claude] 판정: /goal 정직 거절=${c.any ? 'O' : 'X'} (SDK에 골 API 없음 — 실측)`)
}
process.exit(0)
