import { execFile } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { promisify } from 'node:util'
import { userInfo } from 'node:os'
import { wireSegments } from '@cc/protocol'

const exec = promisify(execFile)

/**
 * 우리 폴더에서 아직 돌고 있는 남은 프로세스 (사용자 요청 2026-09-07).
 *
 * **왜 필요한가 (실측 2026-09-07):** 에이전트가 bash 도구로 띄운 데브 서버는 앱을 꺼도
 * 안 죽는다. 재보니 그 프로세스는 `ppid=1`(명령을 실행한 셸이 즉시 끝나 init에게 입양됨)에
 * **자기 프로세스 그룹**을 갖고 있었다 — 부모 사슬도 그룹도 우리와 끊겨 있어서, 우리가
 * PTY에 쓰는 트리 킬(kill-tree.ts)이 닿을 수 없는 자리다. codex는 명령이 끝날 때 자기
 * 그룹을 정리해서 이 문제가 없고, claude 경로에서만 남는다.
 *
 * 그래서 **죽이는 대신 먼저 보여준다.** 무엇을 죽일지는 사람이 안다 — 같은 폴더에서
 * 사람이 직접 띄운 서버를 앱이 말없이 죽이면, 고아를 없애려다 남의 일을 끊는다.
 *
 * 고르는 규칙 넷 (넷 다 만족해야 목록에 든다):
 *
 *  1. **cwd가 우리 폴더 안이다** — 프로젝트 디렉토리이거나 워크트리 디렉토리.
 *  2. **제어 터미널이 없다** (tty가 `??`). 이게 사람이 자기 터미널에서 띄운 것과 가르는
 *     선이다 (실측: 터미널에서 띄우면 `ttys005`, 에이전트가 파이프로 띄우면 `??`).
 *     사람의 셸과 그 셸에서 돌리는 것들이 목록에 섞이면 이 기능은 못 쓴다.
 *  3. **우리 자손이 아니다** — host의 자손은 종료 절차가 이미 트리째 정리한다. 여기
 *     싣는 것은 그 정리가 닿지 않는 것들뿐이다.
 *  4. **살아 있는 주인이 없다** (사용자 지적 2026-09-10). 부모 사슬을 타고 올라가 init(1)에
 *     닿아야 한다. VS Code의 Claude 확장이 이 규칙 없이 목록에 들었다 — 워크스페이스가
 *     우리 프로젝트 폴더라 cwd가 맞고, 파이프로 떠서 tty도 없다. 규칙 1~3만으로는
 *     **남의 앱이 지금 쓰고 있는 프로세스와 주인 없는 고아가 구별되지 않는다.**
 *     실제로 종료할 때 그 확장이 SIGTERM(143)을 맞고 죽었다.
 *
 *     사슬 중간이 전부 후보(같은 폴더·터미널 없음)면 그건 고아가 낳은 자식들이라 함께
 *     둔다 — `npm run dev`(고아)가 띄운 node까지 한 화면에서 고를 수 있어야 한다.
 */

export type StrayProcess = {
  pid: number
  /** 실행 명령 (표시용, 앞부분만) */
  command: string
  /** 어느 폴더에서 도는가 — 사람이 "아 그거" 하고 알아보는 단서 */
  cwd: string
}

export type PsRow = { pid: number; ppid: number; tty: string; command: string }

/** `ps -o pid=,ppid=,tty=,command=` 출력 → 행들 */
export function parsePsRows(out: string): PsRow[] {
  const rows: PsRow[] = []
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line)
    if (!m) continue
    rows.push({ pid: Number(m[1]), ppid: Number(m[2]), tty: m[3]!, command: m[4]!.trim() })
  }
  return rows
}

/** `lsof -a -d cwd -Fpn` 출력 → pid별 cwd */
export function parseLsofCwd(out: string): Map<number, string> {
  const cwds = new Map<number, string>()
  let pid: number | null = null
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1)) || null
    else if (line.startsWith('n') && pid !== null) {
      // 한 프로세스에 cwd는 하나다 — 처음 것만 취한다
      if (!cwds.has(pid)) cwds.set(pid, line.slice(1))
    }
  }
  return cwds
}

/** 제어 터미널이 없는가. macOS는 `??`, Linux ps는 `?`로 적는다 */
export function noTty(tty: string): boolean {
  return tty === '??' || tty === '?' || tty === '-'
}

/**
 * `cwd`가 root 중 하나의 안(또는 그 자신)인가 — **조각 경계로** 판정한다.
 * 문자열 접두사로 재면 `/a/project-old`가 `/a/project`의 안이 된다.
 */
export function insideAny(cwd: string, roots: readonly string[]): string | null {
  const parts = wireSegments(cwd)
  for (const root of roots) {
    const rp = wireSegments(root)
    if (rp.length === 0 || parts.length < rp.length) continue
    if (rp.every((seg, i) => parts[i] === seg)) return root
  }
  return null
}

/** 규칙 넷을 적용해 목록을 만든다 (순수 — 시험은 여기까지만 본다) */
export function pickStrays(
  rows: readonly PsRow[],
  cwdOf: ReadonlyMap<number, string>,
  roots: readonly string[],
  selfPid: number,
): StrayProcess[] {
  // 우리 자손 집합 — host가 종료할 때 트리째 정리하는 쪽이다
  const kids = new Map<number, number[]>()
  for (const r of rows) kids.set(r.ppid, [...(kids.get(r.ppid) ?? []), r.pid])
  const ours = new Set<number>([selfPid])
  const queue = [selfPid]
  while (queue.length > 0) {
    for (const kid of kids.get(queue.shift()!) ?? []) {
      if (ours.has(kid)) continue
      ours.add(kid)
      queue.push(kid)
    }
  }

  // 규칙 1~3을 통과한 것들. 규칙 4(주인 없음)는 이 집합을 알아야 판정할 수 있다
  const candidates = new Map<number, string>()
  for (const r of rows) {
    if (r.pid <= 1 || ours.has(r.pid)) continue
    if (!noTty(r.tty)) continue
    const cwd = cwdOf.get(r.pid)
    if (!cwd || !insideAny(cwd, roots)) continue
    candidates.set(r.pid, cwd)
  }

  const byPid = new Map(rows.map((r) => [r.pid, r]))
  /**
   * 이 프로세스를 **아직 들고 있는 앱이 있는가**를 부모 사슬로 묻는다.
   *
   * init(1)까지 후보만 지나 올라가면 주인이 없다 — 우리가 치워도 되는 고아다.
   * 중간에 후보가 아닌 살아 있는 프로세스가 있으면 그건 그 앱의 것이다 (VS Code의
   * 확장 호스트가 정확히 그 자리에 있다). 사슬이 우리 계정 밖으로 나가 부모를 못 찾는
   * 경우도 남의 것으로 본다 — 모를 때 쏘지 않는 쪽이 이 기능의 규칙이다.
   */
  const unowned = (pid: number): boolean => {
    const seen = new Set<number>()
    let cur = byPid.get(pid)
    while (cur && !seen.has(cur.pid)) {
      seen.add(cur.pid)
      if (cur.ppid <= 1) return true
      if (!candidates.has(cur.ppid)) return false
      cur = byPid.get(cur.ppid)
    }
    return false
  }

  const out: StrayProcess[] = []
  for (const [pid, cwd] of candidates) {
    if (!unowned(pid)) continue
    out.push({ pid, command: byPid.get(pid)!.command, cwd })
  }
  return out.sort((a, b) => a.pid - b.pid)
}

async function psRows(): Promise<PsRow[]> {
  try {
    // 우리 계정 것만 본다 — 남의 계정 프로세스는 어차피 못 죽이고, 물어볼 일도 아니다
    const { stdout } = await exec('ps', ['-U', userInfo().username, '-o', 'pid=,ppid=,tty=,command='], {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 5000,
    })
    return parsePsRows(stdout)
  } catch {
    return []
  }
}

async function cwdsOf(pids: readonly number[]): Promise<Map<number, string>> {
  if (pids.length === 0) return new Map()
  try {
    const { stdout } = await exec('lsof', ['-a', '-d', 'cwd', '-p', pids.join(','), '-Fpn'], {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 5000,
    })
    return parseLsofCwd(stdout)
  } catch (e) {
    // lsof는 못 읽는 프로세스가 있으면 1로 끝내면서도 **읽은 것은 출력한다** — 버리지 않는다
    const partial = (e as { stdout?: string }).stdout
    return partial ? parseLsofCwd(partial) : new Map()
  }
}

/**
 * 지금 살아 있는 남은 프로세스들. 두 단계로 훑는다: ps로 후보를 좁히고(터미널 없는 것만),
 * 그 pid들에만 lsof를 건다 — 전체 lsof는 수백 ms지만 후보만이면 수십 ms다.
 */
export async function findStrays(roots: readonly string[], selfPid = process.pid): Promise<StrayProcess[]> {
  if (process.platform === 'win32' || roots.length === 0) return []
  const rows = await psRows()
  const candidates = rows.filter((r) => r.pid > 1 && noTty(r.tty)).map((r) => r.pid)
  const cwdOf = await cwdsOf(candidates)
  return pickStrays(rows, cwdOf, resolveRoots(roots), selfPid)
}

/**
 * 심볼릭 링크를 푼 뿌리도 함께 본다.
 *
 * lsof는 **풀린 경로**를 답한다 (실측: `/tmp/x`에서 도는 프로세스를 `/private/tmp/x`로
 * 보고한다 — macOS의 /tmp·/var가 그렇다). 우리가 든 뿌리는 사람이 고른 그대로라, 한쪽만
 * 보면 같은 폴더인데 못 알아본다. 둘 다 후보로 든다.
 */
export function resolveRoots(roots: readonly string[]): string[] {
  const out = new Set<string>()
  for (const r of roots) {
    out.add(r)
    try {
      out.add(realpathSync(r))
    } catch {
      // 아직 없는 폴더(워크트리 뿌리가 그럴 수 있다) — 원본만 든다
    }
  }
  return [...out]
}

/**
 * 고른 것들을 멈춘다 — **죽이기 직전에 다시 잰다.**
 *
 * 목록을 만든 순간과 사람이 누르는 순간 사이에 그 pid가 죽고 다른 프로세스가 그 번호를
 * 물려받았을 수 있다. 그때 그냥 쏘면 우리가 고아를 치우려다 남의 프로세스를 죽인다.
 * 그래서 "지금도 우리 폴더에서 도는 터미널 없는 프로세스"인 것만 신호를 받는다.
 */
export async function stopStrays(
  pids: readonly number[],
  roots: readonly string[],
  selfPid = process.pid,
): Promise<{ stopped: number }> {
  const live = await findStrays(roots, selfPid)
  const allowed = new Set(live.map((s) => s.pid))
  let stopped = 0
  for (const pid of pids) {
    if (!allowed.has(pid)) continue
    try {
      process.kill(pid, 'SIGTERM')
      stopped++
    } catch {
      // 방금 죽었다 — 목적은 이뤄졌다
    }
  }
  return { stopped }
}
