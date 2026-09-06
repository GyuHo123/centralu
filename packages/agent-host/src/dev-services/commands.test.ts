import { describe, expect, it, vi } from 'vitest'
import { CommandRunner } from './commands.js'

/**
 * 자주 쓰는 명령어 실행기 (#60)의 계약:
 *   - 명령별 마지막 실행 하나 (재실행 = 죽이고 새로, 로그 교체)
 *   - 서로 다른 명령은 동시 실행
 *   - 끝나면 종료 코드와 함께 로그가 남는다 (단발/상주 구분 없음)
 */

function fakePty() {
  const instances: {
    kill: ReturnType<typeof vi.fn>
    resize: ReturnType<typeof vi.fn>
    emitData: (d: string) => void
    emitExit: (code: number) => void
  }[] = []
  const mod = {
    /** 실제 pid를 주면 그룹 킬 경로가 산다 — 반드시 process.kill을 모킹한 테스트에서만 줄 것 */
    pid: undefined as number | undefined,
    spawn(_file: string, args: string[], _opts: Record<string, unknown>) {
      let onData = (_d: string) => {}
      let onExit = (_e: { exitCode: number }) => {}
      const inst = {
        pid: mod.pid,
        args,
        write: vi.fn(),
        resize: vi.fn(),
        kill: vi.fn(),
        emitData: (d: string) => onData(d),
        emitExit: (code: number) => onExit({ exitCode: code }),
        onData: (cb: (d: string) => void) => (onData = cb),
        onExit: (cb: (e: { exitCode: number }) => void) => (onExit = cb),
      }
      instances.push(inst)
      return inst
    },
  }
  return { mod, instances }
}

function stub(svc: CommandRunner, mod: unknown): void {
  ;(svc as unknown as { loadPty: () => unknown }).loadPty = () => mod
}

describe('CommandRunner', () => {
  it('출력이 로그에 쌓이고, 끝나면 종료 코드가 남는다', () => {
    const fake = fakePty()
    const frames: unknown[] = []
    const svc = new CommandRunner((f) => frames.push(f))
    stub(svc, fake.mod)

    const r = svc.run('/tmp/p', 'pnpm test')
    fake.instances[0]!.emitData('오류 0건\r\n')
    fake.instances[0]!.emitExit(0)

    const log = svc.log('/tmp/p', 'pnpm test')!
    expect(log.history).toBe('오류 0건\r\n')
    expect(log.running).toBe(false)
    expect(log.exitCode).toBe(0)
    expect(frames).toContainEqual({ terminalId: r.runId, data: '오류 0건\r\n' })
    expect(frames).toContainEqual({ terminalId: r.runId, exitCode: 0 })
  })

  it('재실행은 죽이고 새로 시작하며 로그를 교체한다 — runId도 새것', () => {
    const fake = fakePty()
    const svc = new CommandRunner(() => {})
    stub(svc, fake.mod)

    const r1 = svc.run('/tmp/p', 'pnpm dev')
    fake.instances[0]!.emitData('옛 로그')
    const r2 = svc.run('/tmp/p', 'pnpm dev')

    expect(fake.instances[0]!.kill).toHaveBeenCalled()
    expect(r2.runId).not.toBe(r1.runId)
    expect(svc.log('/tmp/p', 'pnpm dev')!.history).toBe('')
    // 죽어가는 옛 프로세스의 마지막 출력은 새 로그에 섞이지 않는다
    fake.instances[0]!.emitData('유령 출력')
    expect(svc.log('/tmp/p', 'pnpm dev')!.history).toBe('')
  })

  it('서로 다른 명령은 동시에 돈다 — 명령당 프로세스 하나', () => {
    const fake = fakePty()
    const svc = new CommandRunner(() => {})
    stub(svc, fake.mod)

    svc.run('/tmp/p', 'pnpm dev')
    svc.run('/tmp/p', 'pnpm test')
    expect(fake.instances).toHaveLength(2)
    expect(fake.instances[0]!.kill).not.toHaveBeenCalled()

    const state = svc.state('/tmp/p')
    expect(state.map((s) => s.command).sort()).toEqual(['pnpm dev', 'pnpm test'])
    expect(state.every((s) => s.running)).toBe(true)
  })

  it('stop은 프로세스만 죽인다 — 로그는 남는다 (종료도 결과다)', () => {
    const fake = fakePty()
    const svc = new CommandRunner(() => {})
    stub(svc, fake.mod)

    svc.run('/tmp/p', 'pnpm dev')
    fake.instances[0]!.emitData('서버 뜸\r\n')
    svc.stop('/tmp/p', 'pnpm dev')
    fake.instances[0]!.emitExit(130)

    const log = svc.log('/tmp/p', 'pnpm dev')!
    expect(log.running).toBe(false)
    expect(log.history).toBe('서버 뜸\r\n')
    expect(log.exitCode).toBe(130)
  })

  it('실행된 적 없는 명령의 로그는 null — 빈 로그와 구분된다', () => {
    const svc = new CommandRunner(() => {})
    stub(svc, fakePty().mod)
    expect(svc.log('/tmp/p', 'pnpm build')).toBeNull()
  })

  it('디렉토리가 다르면 같은 명령도 별개다 (워크트리 준비 — 터미널과 같은 규칙)', () => {
    const fake = fakePty()
    const svc = new CommandRunner(() => {})
    stub(svc, fake.mod)
    svc.run('/tmp/a', 'pnpm dev')
    svc.run('/tmp/b', 'pnpm dev')
    expect(fake.instances).toHaveLength(2)
    expect(svc.state('/tmp/a')).toHaveLength(1)
  })
})

/**
 * Stop이 안 먹히던 버그 (도그푸딩 2026-09-07): node-pty kill()은 pty 자식 pid 하나에만
 * 시그널을 보내는데, 명령은 `zsh -lc`로 떠서 실제 서버는 그 아래 트리였다.
 * 계약: pid가 있으면 프로세스 **그룹**(-pid)으로 SIGTERM, 유예 안에 안 죽으면 SIGKILL.
 */
describe('CommandRunner — 트리 킬', () => {
  it('stop은 프로세스 그룹에 SIGTERM을 보내고, 유예가 지나도 살아 있으면 SIGKILL한다', () => {
    vi.useFakeTimers()
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    try {
      const fake = fakePty()
      fake.mod.pid = 54321
      const svc = new CommandRunner(() => {})
      stub(svc, fake.mod)

      svc.run('/tmp/p', 'pnpm dev')
      svc.stop('/tmp/p', 'pnpm dev')
      expect(killSpy).toHaveBeenCalledWith(-54321, 'SIGTERM')
      // 단일 pid 킬로 물러나지 않았다 — 그룹이 과녁이다
      expect(fake.instances[0]!.kill).not.toHaveBeenCalled()

      vi.advanceTimersByTime(3000)
      expect(killSpy).toHaveBeenCalledWith(-54321, 'SIGKILL')
    } finally {
      killSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('유예 안에 죽으면 SIGKILL은 없다 — 정중한 종료가 존중된다', () => {
    vi.useFakeTimers()
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    try {
      const fake = fakePty()
      fake.mod.pid = 54321
      const svc = new CommandRunner(() => {})
      stub(svc, fake.mod)

      svc.run('/tmp/p', 'pnpm dev')
      svc.stop('/tmp/p', 'pnpm dev')
      fake.instances[0]!.emitExit(143) // SIGTERM을 받고 죽었다
      vi.advanceTimersByTime(3000)
      expect(killSpy).not.toHaveBeenCalledWith(-54321, 'SIGKILL')
    } finally {
      killSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('앱 종료(disposeAll)는 그룹을 바로 SIGKILL한다 — 유예를 기다릴 프로세스가 없다', () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    try {
      const fake = fakePty()
      fake.mod.pid = 54321
      const svc = new CommandRunner(() => {})
      stub(svc, fake.mod)

      svc.run('/tmp/p', 'pnpm dev')
      svc.disposeAll()
      expect(killSpy).toHaveBeenCalledWith(-54321, 'SIGKILL')
    } finally {
      killSpy.mockRestore()
    }
  })

  it('pid가 없으면(페이크·win32) 종전처럼 pty.kill로 물러난다', () => {
    const fake = fakePty()
    const svc = new CommandRunner(() => {})
    stub(svc, fake.mod)

    svc.run('/tmp/p', 'pnpm dev')
    svc.stop('/tmp/p', 'pnpm dev')
    expect(fake.instances[0]!.kill).toHaveBeenCalledWith('SIGTERM')
  })
})
