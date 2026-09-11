import type { ApprovalDetail, ApprovalScope } from '@cc/protocol'

/**
 * 승인 정책 (FR-3). "막지 말고 보이게 하라" — 제자리 승인을 금지하는 게 아니라,
 * 정보가 부족한 요청만 "확인 필요"로 표시한다.
 */

/**
 * 승인 정책 (FR-3). "막지 말고 보이게 하라".
 *
 * 한때 여기에 **배너 정책**이 있었다 — 비포커스 세션의 승인을 창 맨 위 띠에서 바로
 * 허용하되, 정보가 부족한 요청(파일 수정·여러 파일·너무 긴 명령)은 "확인 필요"로
 * 돌려보내는 규칙. 띠 자체를 걷어내면서(사용자 요청 2026-09-10 — 떴다 사라질 때마다
 * 화면 전체가 밀렸다) 그 규칙이 답할 질문도 같이 사라졌다. 승인은 이제 **그 세션의
 * 카드에서** 답한다: 인박스가 그 자리로 데려다준다.
 */

/*
 * 도구 카드의 접힘 정책은 여기 없다.
 *
 * "조회성은 접고 변경은 펼친다"는 규칙이 있었는데, 도구를 몇 번만 써도 대화가
 * 출력으로 뒤덮여 답을 못 읽었다 (도그푸딩). 지금은 **전부 접는다** —
 * 입력이 무엇이든 답이 같으므로 정책이랄 것이 없어졌다.
 * 규칙이 하나로 줄면 그 규칙은 코드가 아니라 기본값으로 표현하는 게 맞다.
 */

/**
 * "항상 허용" 규칙 (FR-3). 패턴을 허용하되 등록 시 매치 미리보기를 보여준다 —
 * 표현력을 제한하는 대신 결과를 가시화한다.
 */
export type ApprovalRule = {
  scope: ApprovalScope
  projectId?: string
  sessionId?: string
  /** glob 유사 패턴: * 만 지원 (0자 이상) */
  matcher: string
}

export function matchesRule(command: string, matcher: string): boolean {
  if (!matcher.includes('*')) return command === matcher
  const escaped = matcher.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(command)
}

export function findMatchingRule(
  detail: ApprovalDetail,
  rules: readonly ApprovalRule[],
  ctx: { sessionId: string; projectId: string },
): ApprovalRule | null {
  if (detail.kind !== 'command') return null
  return (
    rules.find((r) => {
      if (r.scope === 'session' && r.sessionId !== ctx.sessionId) return false
      if (r.scope === 'project' && r.projectId !== ctx.projectId) return false
      return matchesRule(detail.command, r.matcher)
    }) ?? null
  )
}

/** 규칙 등록 시 "이 규칙에 매치되는 명령" 미리보기 (FR-3) */
export function previewMatches(matcher: string, history: readonly string[]): string[] {
  return [...new Set(history.filter((c) => matchesRule(c, matcher)))]
}

/**
 * 승인 카드의 "항상 허용" 기본 패턴 제안 — 승인한 명령 전체를 그대로.
 *
 * 앞 두 단어 + '*'로 넓히던 시절, `rm -rf node_modules` 승인이 `rm -rf*`를 제안해
 * `rm -rf /`까지 자동 승인될 뻔했다. 전체 명령 뒤에 '*'를 붙이는 것도 안전하지 않다 —
 * `cmd*`는 `cmd; rm -rf /` 같은 체이닝에 뚫린다. 그래서 기본 제안은 완전 일치이고,
 * 넓히는 건 사용자가 직접 고쳐서 미리보기(previewMatches)로 결과를 확인한 뒤 한다.
 */
export function suggestMatcher(command: string): string {
  return command.trim()
}
