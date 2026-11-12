---
status: accepted
date: 2026-11-12
---

# 백그라운드 세션(`claude agents`·`--bg`·`/bg`)도 팀장으로 앉히고, 칠판 클릭은 다시 붙는 명령을 안내한다

**결정**: 세션 파일(`~/.claude/sessions/<pid>.json`)을 `kind` 허용 목록 `{interactive, bg}`로 읽는다. `bg` 세션은 대화형과 같은 구역·상태 규칙으로 팀장 자리에 앉힌다. **[사용자 2026-11-12]** 터미널에서 `claude agents`로 띄운 세션이 사무실에 안 보이는 문제. bg 칠판 클릭은 터미널 이동이 불완전해도 되지만, 대화형 칠판 클릭은 이전과 같아야 한다.

| 항목 | 결정 | 이유 |
| --- | --- | --- |
| 읽는 kind | `interactive`, `bg`만(허용 목록) | `daemon` 등은 사람이 대화하는 세션이 아니다. 형식이 바뀌면 bg가 예전처럼 빠지기만 한다(안전한 실패) |
| 대화형 보존 | `kind`·`jobId`는 **bg 객체에만** 붙인다. 대화형 터미널·책상 객체는 이전과 같다 | 칠판 클릭·상태 판정이 대화형에서 바뀌지 않았음을 테스트 하나로 고정한다(`collectOffice`: bg가 함께 있어도 대화형 책상 deepEqual) |
| 칠판 클릭(bg) | `server.mjs` `/api/focus`에서 `kind === "bg"`면 bg 세션 프로세스로는 `focusTerminal`을 타지 않고 `attachHelp`. 터미널 고르기 순서: ① 그 잡에 붙은 `claude attach <jobId>` 클라이언트의 터미널(복사 없음) ② 가장 최근에 띄운 `claude agents`(agent view) 클라이언트의 터미널 + 명령 복사 ③ `claude attach <jobId>`를 클립보드에(pbcopy) 넣고 supervisor를 띄운 터미널 **앱만** 앞으로(`open -b`, 탭은 고르지 않음). ①②는 클라이언트 프로세스(pgrep `-U` 내 계정, 실행 파일 claude + 첫 인자 agents·attach)를 대화형과 같은 `focusTerminal`로 옮긴다 — 그 env가 실제 터미널 것이라 Orca면 탭까지. 클릭할 때만 약 0.1초(pgrep 33ms·ps 5ms·lsof 67ms 실측) **[사용자 2026-11-12: claude agents를 실행한 터미널로]**. 화면은 기존 문구 4초 경로로 "복사함: … · Orca에서 새 탭을 열고 붙여넣기(⌘V)" | bg 프로세스의 env는 supervisor를 띄운 터미널 것이라 탭까지 고르면 엉뚱한 탭으로 간다. 앱은 맞다. 입력은 보내지 않는다(ADR 0003). 복사는 서버가 한다 — 미니 캐릭터 창은 포커스를 받지 않는 panel이라 브라우저 클립보드 API가 막힐 수 있다. `focusTerminal`은 그대로(추가만) **[사용자 2026-11-12: 터미널 앱을 앞으로·명령 복사]** |
| 휴식·휴면(bg) | 쉰 기준 시각 = 대화 기록의 마지막 시각(`summary.lastEventAt`, 없으면 `statusUpdatedAt`) | supervisor가 재기동하며 `statusUpdatedAt`을 새로 써, 몇 주 쉰 세션이 "휴식 5분"으로 보였다 |
| `jobId` | `/^[\w-]{1,64}$/`만 받고 아니면 null(안내 문구에서 명령을 뺀다) | 화면에 문자열로만 쓰지만 형식 밖 값은 싣지 않는다 |

## 하지 않은 것

- `/bg`로 넘긴 원래 대화형(`parkedJobId`) 숨김: 대화형의 표시가 바뀌므로 뺐다. 같은 줄기가 둘로 보일 수 있다.
- 프로세스가 내려간 bg 세션(나를 기다리다 60분 뒤 내려간 것 포함) 표시: `claude agents --json` 보조 경로(조사 문서 B-B)가 필요하다.
- 화면의 "터미널 없음" 표식, 미니 캐릭터 창 키를 `jobId`로(재기동 때 pid가 바뀌면 캐릭터 위치가 초기화된다).
- 새 터미널 창을 열어 attach까지 실행: 프로세스를 띄우거나 키 입력을 보내야 해서 ADR 0003 범위 밖.

## 확인한 것

- 재현 테스트 4개(수정 전 실패) → `node --test` 142/142. 복사·앱 열기(attachHelp)는 가짜 실행기 테스트 → 143/143.
- 실제 bg 세션 칠판 클릭(임시 서버): 클립보드 = `claude attach <jobId>`, Orca 앱이 앞으로, 문구 확인.
- 실제 `~/.claude`(대화형 24, bg 2): 수정 전·후 코드를 같은 시각으로 수집하면 대화형 책상 24/24 동일(pid 기준), bg 2개가 새로 앉음.
- 조사: `docs/superpowers/research/2026-11-12-background-agents.md`.
