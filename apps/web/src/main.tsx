import { createRoot } from 'react-dom/client'
import { App, useStore } from '@cc/ui'
import { createWebPlatform } from '@cc/platform/web'
import { createMockPlatform } from '@cc/platform/mock'
import type { Platform } from '@cc/platform/ports'
import '../../../packages/ui/src/styles/index.css'

/**
 * 구현체를 아는 유일한 곳 (docs/platform-abstraction.md §4).
 *
 * 물음표 뒤에 붙일 수 있는 것은 둘뿐이다:
 *
 *   ?mock=1            인메모리 구현으로 뜬다. **빈 화면** — Playwright가 쓰는 길이다.
 *   ?demo[=씬]         그 위에 씬을 깐다 (프로젝트·세션·대화·깃·사용량). 말을 걸면 답이 온다.
 *                      씬: focus(기본) · grid · empty
 *
 * `demo`는 `mock`을 함의한다 — 씬은 목 위에서만 자란다. 아무것도 안 붙이면 진짜 host에
 * 붙는다 (ws://127.0.0.1:5175).
 */
const params = new URLSearchParams(location.search)
const demo = params.get('demo')
const wantsMock = params.has('mock') || demo !== null

const platform: Platform = wantsMock
  ? seedMock()
  : createWebPlatform({
      hostUrl: import.meta.env.VITE_HOST_URL ?? 'ws://127.0.0.1:5175',
      token: import.meta.env.VITE_HOST_TOKEN ?? 'dev-token',
    })

function seedMock(): Platform {
  const mock = createMockPlatform()
  // E2E가 조작할 수 있게 노출 (mock 모드에서만)
  ;(window as unknown as { __mock: unknown }).__mock = mock
  ;(window as unknown as { __store: unknown }).__store = useStore
  return mock
}

/*
 * 씬은 **그리기 전에** 깔린다. 앱은 뜨자마자 목록을 물으므로, 늦게 깔면 빈 화면을 한 번
 * 그린 뒤에야 내용이 들어온다 — 사람이 보려던 그 화면이 아니다.
 */
if (demo !== null) {
  const { seedDemo, isDemoScene } = await import('@cc/platform/mock/demo')
  await seedDemo(platform as never, isDemoScene(demo) ? demo : 'focus')
}

createRoot(document.getElementById('root')!).render(<App platform={platform} />)
