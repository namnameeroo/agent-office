# 설치·동작 확인 체크리스트

Agent Office를 새 환경에 처음 띄울 때 위에서 아래로 확인한다. 항목마다 **명령**과 **기대 결과**가 있다. 하나라도 어긋나면 맨 아래 "문제가 있을 때"를 본다.

## 1. 사전 조건

- [ ] **Claude Code가 도는 그 머신이다.** 팀장 생존을 `process.kill(pid, 0)`으로 확인하므로(`lib/sources.mjs`) 서버는 Claude Code 터미널과 같은 머신, 같은 PID 공간에서 떠야 한다. Docker 기본 설정이나 원격 `~/.claude` 마운트로는 모든 팀장이 퇴근으로 보인다.
- [ ] **Node 18 이상.** 의존성과 빌드가 없다. 확인된 버전: 24.18.1(개발), 26.12.1(2026-10-27 이 문서 작성 시).
  ```sh
  node -v
  ```
- [ ] **Claude Code가 설치되어 있고 세션 파일을 쓴다.** 확인된 버전: 2.1.303(ADR 0001 관측), 2.1.311(2026-10-27).
  ```sh
  claude --version
  ```
- [ ] **`~/.claude/sessions/<pid>.json`에 `kind: "interactive"`와 `status`가 있다.** 상태 판정 출처다([ADR 0001](adr/0001-read-status-from-sessions-files.md)). Claude Code 터미널을 하나 띄운 뒤 확인한다.
  ```sh
  grep -l '"kind":"interactive"' ~/.claude/sessions/*.json | wc -l   # 떠 있는 터미널 수 이상
  grep -o '"status":"[a-z]*"' "$(ls ~/.claude/sessions/*.json | head -1)"   # "status":"idle" 등
  ```
- [ ] **세션 기록이 `~/.claude/projects/<폴더>/<sessionId>.jsonl`에 있다.** 말풍선·팀원·링크 칩의 출처다. 없어도 팀장은 이름과 상태로 뜬다.
  ```sh
  ls ~/.claude/projects/*/*.jsonl | head -3
  ```
- [ ] **(선택) `git`이 PATH에 있다.** 레포와 worktree를 같은 층으로 묶는 데 쓴다. 없으면 폴더 이름으로 층을 나눈다.
  ```sh
  git --version
  ```
- [ ] **(선택) Claude 디렉터리가 `~/.claude`가 아니면** `AGENT_OFFICE_CLAUDE_DIR`로 지정한다.

## 2. 설치

- [ ] 레포를 받는다. `npm install`은 없다.
  ```sh
  git clone <repo> agent-office && cd agent-office
  ```
- [ ] **(선택) 한글 도트 글꼴.** PF스타더스트는 재배포 금지라 git에 없다. 없으면 Galmuri(git에 포함)로 그린다.
  ```sh
  for f in PFStardust PFStardustBold PFStardustExtraBold; do curl -sSfL "https://cdn.jsdelivr.net/gh/projectnoonnu/2506-1@1.0/$f.woff2" -o "public/fonts/$f.woff2"; done
  ```
- [ ] **환경 변수를 정한다.**
  | 변수 | 기본값 | 언제 바꾸나 |
  | --- | --- | --- |
  | `PORT` | `4545` | 포트가 겹칠 때 |
  | `AGENT_OFFICE_CLAUDE_DIR` | `~/.claude` | Claude 디렉터리가 다를 때 |
  | `AGENT_OFFICE_JIRA_BASE` | (없음) | 쓰는 조직의 Jira 주소. 환경 변수가 없으면 `~/.config/agent-office/config.json`의 `jiraBase`, 둘 다 없으면 글자 칩만 |

## 3. 동작 확인

- [ ] **테스트가 모두 통과한다.**
  ```sh
  node --test   # fail 0
  ```
- [ ] **서버가 뜬다.** `Agent Office: http://127.0.0.1:4545`가 찍힌다.
  ```sh
  node server.mjs
  ```
- [ ] **API가 사무실을 준다.** `desks` 개수가 떠 있는 Claude Code 터미널 수와 같다.
  ```sh
  curl -s http://127.0.0.1:4545/api/state | head -c 300   # {"generatedAt":…,"counts":{…},"desks":[…
  ```
- [ ] **화면이 그려진다.** 브라우저에서 `http://127.0.0.1:4545`를 연다. 이 터미널이 방 하나로 보이고, 칠판에 폴더 이름과 상태가 있다.
- [ ] **상태 변화가 반영된다.** 어느 터미널에서 권한 승인이 필요한 명령을 시키면 그 방 테두리가 빨개지고 `<[!]` 말풍선이 뜬다. 승인하면 돌아온다.
- [ ] **외부 Host는 막힌다.** DNS 리바인딩 방어가 살아 있다.
  ```sh
  curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: evil.example' http://127.0.0.1:4545/   # 403
  ```

## 4. 문제가 있을 때

- **`desks`가 비어 있다** → 1절의 sessions 파일 확인부터. `kind`·`status` 필드가 없거나 이름이 바뀌었으면 Claude Code 버전 드리프트다(ADR 0001 "깨지면" 절). 관측된 버전과 지금 버전을 비교한다.
- **팀장이 전부 퇴근으로 보인다** → 서버가 Claude Code와 다른 PID 공간(컨테이너, 다른 머신)에 떠 있다.
- **터미널에 `수집 실패:`가 찍힌다** → 마지막 결과를 유지하며 1초 뒤 다시 시도한다. 계속되면 그 오류를 그대로 티켓에 적는다.
- **글꼴이 Galmuri다** → PF스타더스트를 안 받았다. 2절의 curl을 실행하고 새로고침한다.
- **원격 머신의 Claude Code를 내 브라우저로 보고 싶다** → 그 머신에서 서버를 띄우고 터널을 판다. Host 검사는 `localhost:<PORT>`를 허용한다.
  ```sh
  ssh -L 4545:127.0.0.1:4545 <host>
  ```
