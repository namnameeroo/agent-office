---
status: superseded by 0006
date: 2026-11-10
---

> 2026-11-11: 띠 창은 [ADR 0006](0006-mini-pets.md)의 세션별 캐릭터 창으로 대체됐다. 띠는 브라우저 `/mini` 미리보기로만 남는다. 아래 `desk.full`·말풍선·저장 금지·방금 끝남 기준은 그대로 유효하다.

# 미니 모드는 같은 서버를 보는 두 번째 창(하단 띠)이다

**결정**: 데스크탑 앱(ADR 0004)에 창을 하나 더 둔다. 주 디스플레이 작업 영역 맨 아래에 붙는 96px 띠(`/mini`)에 세션마다 큰 얼굴 아바타를 한 줄 세우고, 큰 사무실 창과 서로 전환한다(하나만 보인다). 서버·판정은 그대로 쓰고 `desk.full` 한 필드만 더 싣는다. **[사용자 2026-11-10]** "각 세션 상태를 굳이 full screen으로 띄우지 않아도 알고 싶어." 아바타는 시안 C(얼굴만), 왕관 없음, 얼굴 = 터미널, 말풍선 = 펼침, 띠 끝 `▲` = 큰 창. 설계: [specs/2026-11-10-mini-mode-design.md](../superpowers/specs/2026-11-10-mini-mode-design.md), 시안: [wireframes/mini-mode-mock.dc.html](../../wireframes/mini-mode-mock.dc.html).

| 항목 | 결정 | 이유 |
| --- | --- | --- |
| 경로 | `/mini`는 별도 페이지(`public/mini.html` + `mini.mjs` + `mini.css`). 큰 창의 `index.html`·`app.mjs`·`style.css`를 싣지 않는다 | 스펙의 `/?mini` 대신. `app.mjs`에 모드 분기를 넣지 않고 큰 창 CSS 영향을 0으로 |
| 데이터 | 같은 `/api/state`를 1초 폴링. 순수 판정(`public/mini-model.mjs`)은 정렬·소품·경과·펼침 가능만 정한다 | "미니만의 상태 규칙"을 두지 않는다(스펙 안티목표) |
| `desk.full` | 서버 `buildOffice`가 펼침용 전문을 싣는다: 질문·방금 끝남 = 최종 응답 전체(2000자), 권한·답변 대기 = `bubble`과 같은 글, 그 밖 null | 기존 payload의 `said`(80자)·`bubble`(30자)로는 펼쳐도 볼 게 없었다. 판정은 건드리지 않고 이미 읽은 글을 자르지 않을 뿐 |
| 창 | `openWindow("/mini", …)` frameless·`alwaysOnTop("floating")`·모든 Space·`closable:false`·`#2f3542`. 작업 영역 너비 전체, 높이 96. 말풍선을 펼치면 렌더러가 preload `agentOffice.resize(h)`로 높이를 요청하고 메인이 아래 가장자리를 유지한 채 최대 작업 영역 60%까지 키운다 | 불투명 창 하나라 클릭 통과가 필요 없다. 데스크 펫식 투명 창은 다음 ADR |
| 전환 | 큰 창 머리줄 `▼ 미니`(preload가 있을 때만 보임) ↔ 띠 끝 `▲`. 메뉴 View → "미니 모드 토글" `Cmd+Shift+M`. 큰 창이 닫히면 숨은 미니 창이 있어도 `app.quit()` | 창 둘 중 하나만 보이게. `window-all-closed`는 숨은 창이 있으면 안 난다 |
| preload | `desktop/preload.cjs`가 `agentOffice.{openOffice, openMini, resize}` 셋만 노출. `resize`는 보낸 창이 미니 창일 때만, 숫자일 때만 | 렌더러는 sandbox. 그 밖은 전부 HTTP |
| 말풍선 | `waiting`·방금 끝남에만. `working`은 노트북이 말한다. 펼침은 한 번에 하나, 전문은 `full`, `full === bubble`이면 펼침 없음(`data-static`). Esc·바깥 클릭으로 접힘. 펼친 세션이 사라지면 접힘 | 시안 "말풍선은 응답 전용" |
| 저장 | 미니는 localStorage에 쓰지 않는다 | 큰 창의 "여기까지 봄"(`ao-seenAt`)을 미니 숨김이 덮지 않게 |
| 연결 끊김 | 이름 줄 오른쪽에 `연결 끊김 · HH:MM:SS`, 아바타 0.5 투명. 마지막 데이터 유지 | 큰 창 `#offline`과 같은 조건 |
| 방금 끝남 | `resting && now - since < FRESH_MS`(큰 창과 같은 5분) → 깃발 + 반짝임 | 같은 판정 |
| 캐릭터 | seed = `desk.pid`, 팔레트·머리 모양은 `tower.mjs`의 `F_PEOPLE`·`fPerson`(export 추가). 큰 머리 그림·소품·병아리는 시안에서 옮겨 적은 `mini-sprites.mjs` | 큰 창과 같은 사람으로 보이게. Fable 반짝임은 미니에서 생략(인자 자리만) |

## 확인한 것 (2026-11-10, 이 PC)

- `node --test` 103개 통과(`full` 2개, `mini-model` 8개, `/mini` 정적 경로 1개 추가). `node --check` 전 브라우저 모듈.
- `PORT=4599 AGENT_OFFICE_SCREENSHOT_MINI=… npm run desktop`: 띠 3024×192(레티나), 기다리는 세션이 맨 앞에 손 들고 "질문 남김…" 말풍선, 작업 중 셋은 노트북, 방금 끝난 세션은 깃발·반짝임, `▲` 오른쪽 끝. 캐릭터 머리색·머리 모양이 큰 창과 같음(양갈래 #8 확인).
- `AGENT_OFFICE_SCREENSHOT_EXPAND=1`: 말풍선을 누르면 창이 1132px(작업 영역 60% 상한)까지 자라고 전문이 상자 안에서 스크롤된다. 아바타 줄은 바닥에 그대로.
- 연결 끊김: 4601에 따로 띄운 서버를 앱이 재사용하게 한 뒤 그 서버를 죽이자 "연결 끊김 · 17:53:34"와 반투명 아바타.
- 큰 창에 `▼ 미니` 버튼이 보인다(`AGENT_OFFICE_SCREENSHOT_DELAY=7000`).
- **미확인(사용자 확인 필요)**: `▼ 미니`/`▲`/`Cmd+Shift+M` 실제 전환, 큰 창 ⌘W로 앱 종료, 얼굴 클릭 → 터미널 포커스. 세션에서 메뉴·클릭을 누를 수단이 없어 코드만 있다.

## 함정

- **큰 창의 첫 렌더는 3초를 넘길 수 있다.** 서버가 막 떠서 jsonl을 처음 읽는 동안 `/api/state` 첫 응답이 1.5초를 넘기고(렌더러 fetch 타임아웃 1.5초라 한 번 실패 후 다음 폴링에 받음), 화면은 5초쯤에 찬다. 스크린샷 검증은 `AGENT_OFFICE_SCREENSHOT_DELAY`로 늦춘다. 빈 캡처를 보고 코드를 의심해 한참 돌았다.
- `closable:false` 창은 `app.quit()`의 닫기도 거부해 프로세스가 남는다. `before-quit`에서 `setClosable(true)`.
- 펼친 말풍선의 최대 높이에 `100vh`를 쓰면 지금 창 높이(96px)라 자기 자신을 막는다. 렌더러가 `screen.availHeight * 0.6 - 70`으로 계산한다.
- `hidden`인 말풍선은 격자 자리를 비워 아바타가 한 줄 올라간다. 칸 자식마다 `grid-row`를 고정한다.
- 띠 위로 넘친 부분은 `scrollHeight`에 안 잡힌다. 펼친 `.cell`의 `offsetHeight`로 창 높이를 요청한다.
- 디버그: `AGENT_OFFICE_DEBUG=1`이면 큰 창 렌더러 콘솔이 메인 로그에 `[renderer]`로 찍힌다.

## Considered Options

- **`/?mini`로 `app.mjs` 안에서 분기** — 큰 창 코드에 모드 분기가 생기고 `style.css`가 같이 실린다. 별도 페이지가 더 싸다.
- **투명·클릭 통과 창(데스크 펫)** — 그린 부분을 알려주는 IPC와 `setIgnoreMouseEvents(forward)`가 필요. 이번 범위 밖, 다음 ADR.
- **큰 창을 숨기지 않고 둘 다 띄우기** — 사용자가 원한 건 "큰 창 없이". 하나만 보인다.
- **`said`로 펼침** — 첫 줄 80자뿐이라 펼칠 게 없다. `full`을 추가했다.
