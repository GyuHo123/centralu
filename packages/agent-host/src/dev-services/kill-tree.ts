import { execFileSync } from 'node:child_process'

/**
 * 프로세스 **트리**를 죽인다 — 명령 실행기와 터미널 탭이 함께 쓴다.
 *
 * node-pty의 `kill()`은 pty 자식 pid **하나**에만 시그널을 보낸다. 그런데 우리가 띄우는
 * 건 언제나 셸이고, 데브 서버는 그 아래에 있다. 셸만 맞고 서버는 살아남아 포트를 물고
 * 있는 일이 실제로 있었다 (도그푸딩 2026-09-07).
 *
 * 그룹(-pid) 하나로 끝나지 않는 이유 (실측 2026-09-07):
 *
 *   - `zsh -lc <command>` (명령 실행기)는 **비대화형**이라 잡 컨트롤이 없다. 자식들은
 *     셸과 같은 프로세스 그룹에 남으므로 `kill(-pid)` 한 방이면 트리 전체가 맞는다.
 *   - `zsh -l` (터미널 탭)은 **대화형**이라 잡 컨트롤이 켜진다. 거기서 띄운 데브 서버는
 *     **자기 프로세스 그룹**을 갖는다 — 셸의 그룹을 쏴도 서버는 안 맞는다. SIGHUP을
 *     스스로 다루는 서버(흔하다)라면 셸이 죽어도 그대로 남아 고아가 된다.
 *
 * 그래서 ps로 자손을 훑어 **그들이 속한 그룹 전부**를 과녁으로 삼는다. 한 번의 ps는
 * 10ms 남짓이고, 이 함수는 Stop을 누를 때와 앱을 끌 때만 불린다.
 *
 * 자기 자신(호스트)이 속한 그룹은 절대 쏘지 않는다 — 정리하다 자기를 죽이면 남은
 * 프로세스를 아무도 못 치운다.
 */

/** SIGTERM 뒤 이만큼 안 죽으면 SIGKILL — trap을 걸어 둔 데브 서버가 버티는 것까지 책임진다 */
export const KILL_GRACE_MS = 3000

export type KillablePty = {
  /** node-pty가 준 자식 pid. 페이크·win32에는 없다 */
  pid?: number
  kill(signal?: string): void
}

export type ProcRow = { pid: number; ppid: number; pgid: number }

/** `ps -A -o pid=,ppid=,pgid=` 출력 → 행들. 못 읽은 줄은 조용히 버린다 */
export function parsePs(out: string): ProcRow[] {
  const rows: ProcRow[] = []
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line)
    if (!m) continue
    rows.push({ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]) })
  }
  return rows
}

/**
 * 쏠 프로세스 그룹들 (음수로 보낼 pgid). root 자신의 그룹이 언제나 첫 과녁이다.
 *
 * `self`(호스트)가 속한 그룹은 뺀다. ps를 못 읽었으면 rows가 비고, 그러면 답은
 * root의 그룹 하나 — 예전 동작 그대로다.
 */
export function killTargets(rows: ProcRow[], root: number, self: number): number[] {
  const byParent = new Map<number, number[]>()
  const pgidOf = new Map<number, number>()
  for (const r of rows) {
    pgidOf.set(r.pid, r.pgid)
    const kids = byParent.get(r.ppid)
    if (kids) kids.push(r.pid)
    else byParent.set(r.ppid, [r.pid])
  }

  const seen = new Set<number>([root])
  const queue = [root]
  while (queue.length > 0) {
    const pid = queue.shift()!
    for (const kid of byParent.get(pid) ?? []) {
      if (seen.has(kid)) continue
      seen.add(kid)
      queue.push(kid)
    }
  }

  /*
   * ps는 읽혔는데 root가 그 안에 없다 = 이미 죽었다. 그럴 땐 **아무것도 쏘지 않는다.**
   * root의 그룹을 짐작해 쏘는 폴백은 ps 자체를 못 읽었을 때의 이야기고, 여기서 그러면
   * 유예 뒤의 두 번째 발이 **재사용된 pid의 남의 그룹**을 때릴 수 있다.
   */
  if (rows.length > 0 && !pgidOf.has(root)) return []

  const selfPgid = pgidOf.get(self)
  const groups: number[] = []
  for (const pid of seen) {
    const g = pgidOf.get(pid) ?? (pid === root ? root : null)
    if (g === null || g <= 1) continue
    if (g === selfPgid) continue // 우리 자신 — 여기서 죽으면 정리가 중간에 끊긴다
    if (!groups.includes(g)) groups.push(g)
  }
  return groups
}

/** ps 한 장. 실패하면 빈 배열 — 그러면 root의 그룹만 쏘는 예전 동작으로 내려앉는다 */
function snapshot(): ProcRow[] {
  try {
    return parsePs(execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid='], { encoding: 'utf8', timeout: 2000 }))
  } catch {
    return []
  }
}

/** 트리에 시그널 한 발. pid를 모르면(페이크·win32) 종전처럼 pty.kill로 물러난다 */
export function killTree(handle: KillablePty, signal: 'SIGTERM' | 'SIGKILL'): void {
  const pid = handle.pid
  if (process.platform === 'win32' || typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
    try {
      handle.kill(signal)
    } catch {
      // 이미 죽었다
    }
    return
  }

  let hit = false
  for (const g of killTargets(snapshot(), pid, process.pid)) {
    try {
      process.kill(-g, signal)
      hit = true
    } catch {
      // 그 그룹은 이미 사라졌다 — 나머지는 계속 쏜다
    }
  }
  if (hit) return
  try {
    handle.kill(signal) // 그룹이 전부 사라졌거나 권한이 없다 — 마지막 확인 사살
  } catch {
    // 이미 죽었다
  }
}

/** SIGTERM으로 정중히, 유예 안에 안 죽으면 SIGKILL. `alive`가 false면 두 번째 발은 없다 */
export function stopTree(handle: KillablePty, graceMs: number, alive: () => boolean): void {
  killTree(handle, 'SIGTERM')
  const t = setTimeout(() => {
    if (alive()) killTree(handle, 'SIGKILL')
  }, graceMs)
  t.unref?.()
}
