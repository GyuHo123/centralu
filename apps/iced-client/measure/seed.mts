/**
 * Fills a store with the measuring fixture: one project, one long session and five ordinary ones.
 *
 *   tsx apps/iced-client/measure/seed.mts <data dir>
 *
 * The same store is served to both clients, so the comparison is the clients and nothing else.
 * Never point it at a real data folder: it writes the store it is given.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SessionInfo, sessionLiveDefaults, type StoredMessage } from '@cc/protocol'
import { Store } from '../../../packages/agent-host/src/dev-services/store.js'

const dir = process.argv[2]
if (!dir) throw new Error('usage: seed.mts <data dir>')
mkdirSync(join(dir, 'project'), { recursive: true })
const store = new Store(join(dir, 'store.db'))
store.addProject({ id: 'p1', path: join(dir, 'project'), name: 'fixture' })

const words = 'the host keeps the conversation and the window draws it again after every restart'.split(' ')
const sentence = (n: number) => Array.from({ length: n }, (_, i) => words[(i * 7 + n) % words.length]).join(' ')

function session(id: string, name: string, turns: number): void {
  store.upsertSession(
    SessionInfo.parse({
      id, projectId: 'p1', tool: 'claude', externalId: null, name, autoNamed: false, state: 'idle',
      createdAt: Date.now(), live: false, ...sessionLiveDefaults(),
    }),
  )
  const rows: StoredMessage[] = []
  let seq = 0
  for (let t = 0; t < turns; t++) {
    rows.push({ sessionId: id, seq: ++seq, role: 'user', kind: 'text', payload: { text: sentence(12 + (t % 9)) }, ts: t })
    rows.push({
      sessionId: id, seq: ++seq, role: 'assistant', kind: 'tool_call',
      payload: { type: 'tool_call', sessionId: id, callId: `c${t}`, summary: { tool: 'Read', title: `src/file-${t}.ts`, readOnly: true } }, ts: t,
    })
    rows.push({ sessionId: id, seq: ++seq, role: 'assistant', kind: 'text', payload: { text: sentence(60 + (t % 40)) }, ts: t })
  }
  store.appendMessages(rows)
}

session('s-long', 'A long conversation', 700)
for (let i = 1; i <= 5; i++) session(`s-${i}`, `Session ${i}`, 60)
store.close()
console.log(`seeded ${dir}`)
