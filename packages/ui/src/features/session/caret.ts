/**
 * 커서가 **눈에 보이는** 첫 줄/마지막 줄에 있는가 (#38의 뒷이야기).
 *
 * history.ts는 줄을 개행으로만 셌다. 한 줄이 길어 두세 줄로 접히면, 접힌 두 번째 줄에서
 * 위 화살표를 눌러도 개행이 없으니 "첫 줄"로 쳐서 커서 대신 기록이 올라왔다 — 쓰던 글이
 * 사라진 것처럼 보인다 (사용자 지적 2026-09-07).
 *
 * 접힌 줄을 세려면 결국 글자의 화면 좌표가 필요하고, textarea에는 그걸 물어볼 API가 없다.
 * 그래서 **같은 폭·같은 글꼴의 거울 <div>** 를 하나 만들어 커서 앞까지를 그려 보고, 그
 * 자리의 y를 읽는다. 값을 아끼는 두 가지 규칙:
 *
 *  1. 개행 기준으로 이미 첫/마지막 줄이 아니면 여기까지 오지 않는다 (부르는 쪽에서 거른다).
 *  2. 거울은 화살표를 누른 순간에만 그린다 — 타이핑마다가 아니라. 한 번 만든 노드는
 *     문서에 남겨 두고 다시 쓴다.
 *
 * 잴 수 없으면(레이아웃이 없는 환경, 폭 0) **true를 돌려준다** — 못 재는 것을 이유로
 * 기록 기능이 사라지면 안 된다. 그 경우 예전 동작(개행만 세기)으로 얌전히 내려앉는다.
 */

/** 잰 값에서 첫/마지막 줄 여부만 뽑는 순수 부분 — DOM 없이 시험할 수 있게 떼어 둔다 */
export function rowsFromMetrics(
  caretTop: number,
  contentHeight: number,
  lineHeight: number,
): { first: boolean; last: boolean } | null {
  if (!(lineHeight > 0) || !(contentHeight > 0)) return null
  // 반 줄만큼의 여유 — 소수점 높이(예: 16.5px)가 줄 수를 어긋나게 만들지 않게
  const slack = lineHeight / 2
  return {
    first: caretTop < slack,
    last: caretTop + lineHeight > contentHeight - slack,
  }
}

/** 거울은 하나만 만들어 계속 쓴다 (매 측정마다 노드를 붙였다 떼면 레이아웃이 두 번 돈다) */
let mirror: HTMLDivElement | null = null

function getMirror(): HTMLDivElement {
  if (mirror?.isConnected) return mirror
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.dataset.testid = 'caret-mirror'
  document.body.appendChild(el)
  mirror = el
  return el
}

/** textarea의 줄바꿈에 영향을 주는 것만 베낀다 — 색·테두리는 안 보이는 노드에 필요 없다 */
const COPIED = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'letterSpacing',
  'textTransform',
  'textIndent',
  'wordSpacing',
  'lineHeight',
  'whiteSpace',
  'overflowWrap',
  'wordBreak',
  'tabSize',
] as const

/**
 * 커서 자리의 y와 전체 높이, 한 줄 높이.
 *
 * 커서 **뒤의 글까지** 거울에 넣는다. 낱말 한가운데 커서가 있을 때 그 낱말이 통째로
 * 다음 줄로 넘어가는지는 뒤 글자들이 정한다 — 앞부분만 그리면 다른 자리에 접힌다.
 */
function measure(el: HTMLTextAreaElement): { caretTop: number; contentHeight: number; lineHeight: number } | null {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return null
  const style = getComputedStyle(el)
  const inner = el.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0')
  if (!(inner > 0)) return null

  const m = getMirror()
  for (const k of COPIED) m.style[k] = style[k]
  // 여백은 폭에 이미 반영했다 — 거울에서 다시 주면 y가 그만큼 밀린다
  m.style.padding = '0'
  m.style.border = '0'
  m.style.width = `${inner}px`
  m.style.position = 'absolute'
  m.style.top = '0'
  m.style.left = '-9999px'
  m.style.visibility = 'hidden'
  m.style.whiteSpace = style.whiteSpace === 'nowrap' ? 'pre' : 'pre-wrap'
  m.style.overflowWrap = style.overflowWrap === 'normal' ? 'break-word' : style.overflowWrap

  const caret = el.selectionStart ?? 0
  const value = el.value
  m.textContent = value.slice(0, caret)
  const rest = document.createElement('span')
  // 커서가 글 맨 끝이면 잴 대상이 없다 — 마침표 하나가 그 자리의 높이를 대신한다
  rest.textContent = value.slice(caret) || '.'
  m.appendChild(rest)

  const caretTop = rest.offsetTop
  const contentHeight = m.scrollHeight
  // line-height가 'normal'이면 숫자로 안 나온다 — 한 글자를 그려 그 높이를 쓴다
  let lineHeight = parseFloat(style.lineHeight)
  if (!(lineHeight > 0)) {
    m.textContent = 'x'
    lineHeight = m.scrollHeight
  }
  m.textContent = ''
  return { caretTop, contentHeight, lineHeight }
}

/** 커서가 접힌 것까지 세어 첫 줄에 있나 (못 재면 true — 부르는 쪽의 개행 판단을 따른다) */
export function onFirstVisualLine(el: HTMLTextAreaElement): boolean {
  const m = measure(el)
  if (!m) return true
  return rowsFromMetrics(m.caretTop, m.contentHeight, m.lineHeight)?.first ?? true
}

/** 커서가 접힌 것까지 세어 마지막 줄에 있나 */
export function onLastVisualLine(el: HTMLTextAreaElement): boolean {
  const m = measure(el)
  if (!m) return true
  return rowsFromMetrics(m.caretTop, m.contentHeight, m.lineHeight)?.last ?? true
}
