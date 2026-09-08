/**
 * L3 스모크: 남은 프로세스 찾기·멈추기 (사용자 요청 2026-09-07).
 *
 * 단위 시험(strays.test.ts)은 **고르는 규칙**을 값으로 본다. 여기서는 진짜 프로세스를
 * 두 개 띄워 **ps·lsof가 이 기계에서 실제로 무엇을 답하는지**를 본다 — 이 기능의 위험은
 * 규칙이 아니라 도구 출력에 있다 (실측: lsof는 심볼릭 링크를 푼 경로를 답해서, 뿌리를
 * 안 풀면 같은 폴더인데 못 알아본다).
 *
 *   1. 에이전트가 남긴 모양 — 중간 셸이 끝나 ppid=1, 제어 터미널 없음 → **잡혀야 한다**
 *   2. 사람이 터미널에서 띄운 것 — tty 있음 → **안 잡혀야 한다**
 *
 * 실행: pnpm smoke:strays
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { findStrays, stopStrays } from '../src/dev-services/strays.js'
const require = createRequire(import.meta.url)
const pty = require('node-pty')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }

const root = mkdtempSync(join(tmpdir(), 'cc-stray-'))
const pidfile = join(root, 'pid')
// 중간 셸이 즉시 끝나 node가 init에게 입양된다 (에이전트 bash 도구가 만드는 모양)
const sh = spawn('/bin/sh', ['-c', `node -e 'require("fs").writeFileSync("${pidfile}", String(process.pid));setInterval(()=>{},1e3)' &`], {
  cwd: root, stdio: 'ignore', detached: true,
})
sh.unref()
for (let i = 0; i < 20 && !existsSync(pidfile); i++) await sleep(300)
const orphanPid = Number(readFileSync(pidfile, 'utf8'))

const p = pty.spawn('/bin/zsh', ['-l'], { name: 'xterm-256color', cols: 80, rows: 24, cwd: root })
let buf = ''
p.onData((d: string) => (buf += d))
p.write(`node -e 'setInterval(()=>{},1e3)' & echo MINE=$!\n`)
await sleep(2500)
const mine = Number(/MINE=(\d+)/.exec(buf)?.[1])
console.log('고아 :', execSync(`ps -o pid=,ppid=,tty= -p ${orphanPid}`).toString().trim())
console.log('사람 :', execSync(`ps -o pid=,ppid=,tty= -p ${mine}`).toString().trim())

const found = await findStrays([root])
console.log('찾은 것:', found.map((s) => `${s.pid}`).join(',') || '(없음)')
console.log('고아 잡혔나:', found.some((s) => s.pid === orphanPid), '/ 사람 것 안 잡혔나:', !found.some((s) => s.pid === mine))

console.log('stopStrays:', await stopStrays([orphanPid], [root]))
await sleep(1200)
console.log('고아 죽었나:', !alive(orphanPid), '/ 사람 것 살아있나:', alive(mine))
const cleanup = (pid: number) => {
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // 이미 죽었다 — 치우려던 목적은 이뤄졌다
  }
}
cleanup(mine)
cleanup(orphanPid)
p.kill()
rmSync(root, { recursive: true, force: true })
const ok = found.some((s) => s.pid === orphanPid) && !found.some((s) => s.pid === mine)
console.log(ok ? '[strays] OK' : '[strays] 실패 — 위 줄을 보세요')
process.exit(ok ? 0 : 1)
