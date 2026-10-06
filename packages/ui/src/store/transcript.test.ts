import { describe, expect, it } from 'vitest'
import type { NormalizedEvent, StoredMessage } from '@cc/protocol'
import { appendChat, bumpChatKeysAbove, messagesToChat, nextChatKey, type ChatItem } from './transcript.js'

/**
 * The transcript rules on their own — the same assertions store.test.ts makes through the store,
 * here without a platform or a session.
 */

const feed = (events: object[], start: ChatItem[] = []): ChatItem[] =>
  events.reduce<ChatItem[]>((items, e) => appendChat(items, { sessionId: 's', ...e } as NormalizedEvent), start)

const row = (seq: number, kind: StoredMessage['kind'], payload: object, role: StoredMessage['role'] = 'system'): StoredMessage =>
  ({ sessionId: 's', seq, role, kind, payload, ts: seq }) as StoredMessage

describe('appendChat — live events', () => {
  it('chunks with the same stored number are one item, a different number starts the next one (#77)', () => {
    const items = feed([
      { type: 'message_delta', role: 'assistant', text: 'One review ', seq: 5 },
      { type: 'message_delta', role: 'assistant', text: 'is still running.', seq: 5 },
      { type: 'message_delta', role: 'assistant', text: 'All six reviews are in.', seq: 6 },
    ])
    expect(items.map((i) => [i.kind, i.storedSeq, (i as { text: string }).text])).toEqual([
      ['assistant', 5, 'One review is still running.'],
      ['assistant', 6, 'All six reviews are in.'],
    ])
  })

  it("the parent's result goes to the parent's card and the agent's steps to the agent's card (#98)", () => {
    const items = feed([
      { type: 'tool_call', callId: 'toolu_agent', summary: { tool: 'Agent', title: 'Research', readOnly: false, paths: [] } },
      { type: 'tool_output_delta', callId: 'toolu_agent', text: 'Running in the background\n' },
      { type: 'tool_call', callId: 'toolu_bash', summary: { tool: 'Bash', title: 'git status', readOnly: false, paths: [] } },
      { type: 'tool_output_delta', callId: 'toolu_agent', text: 'Grep: boundaries\n' },
      { type: 'tool_result', callId: 'toolu_bash', ok: true, summary: 'nothing to commit' },
    ])
    expect(items.flatMap((i) => (i.kind === 'tool' ? [{ tool: i.tool, result: i.result, live: i.live }] : []))).toEqual([
      { tool: 'Agent', result: undefined, live: 'Running in the background\nGrep: boundaries\n' },
      { tool: 'Bash', result: 'nothing to commit', live: undefined },
    ])
  })

  it('an event for a row history already brought in is not drawn a second time (#79)', () => {
    const restored = messagesToChat([row(3, 'tool_call', { callId: 'c1', summary: { tool: 'Bash', title: 'ls', readOnly: true } })])
    const items = feed([{ type: 'tool_call', callId: 'c1', seq: 3, summary: { tool: 'Bash', title: 'ls', readOnly: true, paths: [] } }], restored)
    expect(items).toBe(restored)
  })

  it('a live key is always above every key brought in from the store', () => {
    bumpChatKeysAbove([{ seq: 100_000 }])
    const [item] = feed([{ type: 'message_delta', role: 'assistant', text: 'hi' }])
    expect(item!.seq).toBeGreaterThan(100_000)
    expect(nextChatKey()).toBeGreaterThan(item!.seq)
  })
})

describe('messagesToChat — restoration', () => {
  const call = (seq: number) => row(seq, 'tool_call', { type: 'tool_call', summary: { tool: 'Bash', title: 'pnpm test', readOnly: true } })
  const result = (seq: number, summary: string, ok = true) => row(seq, 'tool_result', { type: 'tool_result', callId: 'c1', ok, summary })

  it('with several calls, results pair in the order they were emitted — never swapped', () => {
    const items = messagesToChat([call(1), call(2), result(3, 'first'), result(4, 'second', false)])
    expect(items.map((i) => (i.kind === 'tool' ? [i.result, i.ok] : null))).toEqual([
      ['first', true],
      ['second', false],
    ])
  })

  it('a result with no match is discarded — never creates a row that never existed', () => {
    expect(messagesToChat([result(1, 'output with no owner')])).toEqual([])
  })

  it('a marker kind this build does not know is left out, not drawn as a compaction', () => {
    const items = messagesToChat([
      row(1, 'marker', { type: 'from_a_newer_host', text: 'x' }),
      row(2, 'marker', { type: 'compaction', failed: false }),
    ])
    expect(items.map((i) => (i as { text: string }).text)).toEqual(['Earlier messages were compacted here'])
  })

  it('neighboring reasoning rows stay separate thoughts and keep their stored numbers as keys (#77)', () => {
    const items = messagesToChat([
      row(1, 'reasoning', { type: 'reasoning_delta', text: '**Path review**' }, 'assistant'),
      row(2, 'reasoning', { type: 'reasoning_delta', text: '**Test check**' }, 'assistant'),
      row(3, 'text', { type: 'message_delta', text: 'reply' }, 'assistant'),
    ])
    expect(items).toEqual([
      { kind: 'reasoning', seq: 1, storedSeq: 1, text: '**Path review**' },
      { kind: 'reasoning', seq: 2, storedSeq: 2, text: '**Test check**' },
      { kind: 'assistant', seq: 3, storedSeq: 3, text: 'reply' },
    ])
  })
})
