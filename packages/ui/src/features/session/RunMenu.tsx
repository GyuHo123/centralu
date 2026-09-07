import { useEffect } from 'react'
import { PlayIcon } from '../../components/icons.jsx'
import { IconButton } from '../../components/IconButton.jsx'
import { useStore } from '../../store/store.js'

/**
 * 자주 쓰는 명령어 여는 버튼 (issue #44 → #60에서 창으로 확장).
 *
 * 열림 상태를 칸(pane)이 드는 이유는 그대로다: 그리드에서 이 헤더는 칸을 옮기는
 * 손잡이(`draggable`)라, 창이 열려 있는 동안 끌기를 꺼야 한다.
 *
 * 목록·등록·실행·로그는 전부 CommandRunnerOverlay로 옮겨 갔다 — 헤더의 작은
 * 팝오버로는 로그를 볼 자리가 없었다 (#60). 여기 남은 것은 여는 버튼뿐이다.
 *
 * 다만 **돌고 있으면 아이콘이 흰색으로 선다** (사용자 요청 2026-09-07). 창을 닫으면
 * 실행 중이라는 사실이 이 헤더에서 사라졌었다 — 터미널 탭·접힌 띠의 점과 같은 장부를
 * 같은 식으로 읽어, 문이 곧 표시등을 겸한다.
 */
export function RunMenu({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const running = useStore((s) => Object.values(s.commandRuns[projectId] ?? {}).some((r) => r.running))

  /*
   * 장부를 여기서도 한 번 읽는다. 증거 패널이 프로젝트가 바뀔 때 읽지만 그리드에는
   * 증거 패널이 없고, UI를 새로 띄운 직후엔 창을 한 번 열기 전까지 장부가 비어 있다 —
   * 그러면 데브 서버가 돌고 있어도 아이콘이 회색이라 **거짓말을 하는 표시등**이 된다.
   */
  useEffect(() => {
    void useStore.getState().loadCommandRuns(projectId)
  }, [projectId])

  return (
    <IconButton
      label={running ? 'Saved commands — one is running' : 'Saved commands — run with live logs'}
      onClick={() => onOpenChange(!open)}
      testId="run-open"
      align="right"
      lit={running}
    >
      <PlayIcon />
    </IconButton>
  )
}
