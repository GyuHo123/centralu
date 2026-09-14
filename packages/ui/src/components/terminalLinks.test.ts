import type { ILinkProvider, Terminal } from '@xterm/xterm'
import { describe, expect, it } from 'vitest'
import { findTerminalHttpLinks, isTerminalLinkActivation, registerTerminalHttpLinks } from './terminalLinks.js'

describe('terminal HTTP links', () => {
  it('finds only valid http(s) URLs and leaves sentence punctuation outside', () => {
    expect(findTerminalHttpLinks('Open https://example.com/a?x=1). Then http://localhost:5174/.')).toEqual([
      { text: 'https://example.com/a?x=1', start: 5, end: 30 },
      { text: 'http://localhost:5174/', start: 38, end: 60 },
    ])
  })

  it('requires Command or Control before a terminal link activates', () => {
    expect(isTerminalLinkActivation({ metaKey: false, ctrlKey: false })).toBe(false)
    expect(isTerminalLinkActivation({ metaKey: true, ctrlKey: false })).toBe(true)
    expect(isTerminalLinkActivation({ metaKey: false, ctrlKey: true })).toBe(true)
  })

  it('provides one-based xterm ranges for the URL cells', () => {
    let provider: ILinkProvider | undefined
    const term = {
      buffer: { active: { getLine: (line: number) => (line === 3 ? { translateToString: () => 'go https://example.com' } : undefined) } },
      registerLinkProvider: (next: ILinkProvider) => {
        provider = next
        return { dispose() {} }
      },
    } as unknown as Terminal

    registerTerminalHttpLinks(term)
    let links: Parameters<ILinkProvider['provideLinks']>[1] extends (value: infer T) => void ? T : never
    provider!.provideLinks(4, (value) => {
      links = value
    })
    expect(links).toMatchObject([{ text: 'https://example.com/', range: { start: { x: 4, y: 4 }, end: { x: 22, y: 4 } } }])
  })
})
