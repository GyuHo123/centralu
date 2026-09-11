import { expect, test } from '@playwright/test'

/**
 * 손으로 보는 화면 (`?demo`) — 사용자 요청 2026-09-10.
 *
 * 이 씬은 UI를 고치는 사람이 **열자마자 볼 것이 있게** 하려고 깐다. 개발용이라 아무도
 * 안 보는 사이 조용히 썩기 쉬운 자리다 (목의 포트가 하나 바뀌면 씨앗이 그 자리에서 터진다).
 * 그래서 최소한 이것만은 지킨다: 열면 내용이 있고, 말을 걸면 답이 온다.
 */
test('?demo — 열자마자 볼 것이 있다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/?demo')

  // 프로젝트와 세션이 이미 서 있다 — 소개 화면이 아니라 일하던 화면이다
  await expect(page.getByTestId('project-centralu')).toBeVisible()
  await expect(page.getByTestId('project-landing-site')).toBeVisible()
  await expect(page.getByTestId('session-name')).toBeVisible()
  // 지난 대화도 있다 (툴 카드까지)
  await expect(page.getByTestId('chat-stream')).toContainText('무지개 링')
  await expect(page.getByTestId('tool-card').first()).toBeVisible()
  // 계기판의 도넛과 증거 패널의 깃 변경도 채워져 있다
  await expect(page.getByTestId('usage-donut-claude')).toBeVisible()
  await expect(
    page.getByTestId('evidence-file-packages/ui/src/features/session/SessionView.tsx'),
  ).toBeVisible()

  expect(errors).toEqual([])
})

test('?demo — 말을 걸면 답이 온다', async ({ page }) => {
  await page.goto('/?demo')
  await page.getByTestId('prompt-input').fill('답 오나 보자')
  await page.getByTestId('prompt-input').press('Enter')

  // 각본: 도구 하나 → 답 몇 조각 → 끝. 끝나면 '입력 대기'로 선다
  await expect(page.getByTestId('chat-stream')).toContainText('답 오나 보자', { timeout: 10_000 })
  await expect(page.getByTestId('chat-stream')).toContainText('데모 목이라', { timeout: 10_000 })
})

test('?demo=grid — 그리드로 뜨고 칸이 넷이다', async ({ page }) => {
  await page.goto('/?demo=grid')
  await expect(page.getByTestId('grid')).toBeVisible()
  await expect(page.locator('[data-testid^="grid-panel-"]')).toHaveCount(4)
  // 응답 중인 칸이 하나 — 무지개 링이 도는 자리다
  await expect(page.locator('.cc-orbit-ring-layer')).toHaveCount(1)
})

/** `?mock=1`은 지금까지 그대로다 — E2E가 쓰는 문이라 씬이 새어 들어오면 안 된다 */
test('?mock=1은 비어 있다 — 씬은 demo에만 있다', async ({ page }) => {
  await page.goto('/?mock=1')
  await expect(page.getByTestId('intro')).toBeVisible()
})
