---
status: accepted
---

# 팀장 상태는 훅이 아니라 `~/.claude/sessions/<pid>.json`에서 읽는다

**결정**: 팀장이 작업 중인지, 나를 기다리는지, 쉬는지는 `~/.claude/sessions/<pid>.json` 파일로 판정한다. Claude Code가 터미널마다 쓰는 파일이고, 우리는 그 안의 `status`(`idle`/`busy`/`waiting`)와 `waitingFor`(`"permission prompt"`/`"input needed"`) 값을 읽는다. 2026-10-21 v2.1.303에서 관측했다.

**이유**: 이 화면은 Claude Code 설정을 하나도 바꾸지 않고 읽기만 한다는 원칙을 따른다. 그래서 훅을 쓰지 않았다.
- 훅(`Notification`의 `permission_prompt`, `PermissionRequest` 이벤트)은 공식 인터페이스라서 더 안정적이다.
- 대신 `~/.claude/settings.json`이나 기존 훅 스크립트를 고쳐야 한다.

**위험**: 공식 문서에 없는 내부 파일에 기대는 방식이다. Claude Code가 업데이트되면서 필드가 바뀌면 깨질 수 있다.

**깨지면**: 훅 방식으로 옮긴다. 사용자가 이미 승인한 대안이 있다. 기존 `~/.claude/hooks/friction-log.sh`의 기록에 `session_id` 한 줄을 추가하는 것이다.

## Considered Options

- **훅 전용**: 정확하고 공식 인터페이스다. 하지만 전역 설정을 바꿔야 하고, 이미 떠 있는 세션에 바로 적용되는지는 확인하지 않았다.
- **세션 기록(jsonl) 추론만**: 쓰기가 전혀 필요 없다. 하지만 오래 걸리는 명령 실행과 권한 대기를 구분할 수 없다.
