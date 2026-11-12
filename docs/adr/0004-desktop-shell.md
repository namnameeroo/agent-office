---
status: accepted
date: 2026-11-09
---

# 데스크탑 앱은 Electron 껍데기이고, 서버·화면 코드는 그대로 둔다

**결정**: `desktop/main.mjs`가 Electron 메인 프로세스에서 `server.mjs`를 import해 같은 프로세스 안에 띄우고, 그 주소(`http://127.0.0.1:4545`)를 BrowserWindow로 연다. `node server.mjs` + 브라우저 방식은 그대로 남는다. **[사용자 2026-11-09]** "데스크탑앱으로 구현"은 Claude Code mod가 아니라 독립 .app이며, 참고 레포 [kys42/agent-office](https://github.com/kys42/agent-office)의 설계 중 이번에는 포장(1번)만 가져오고 하단 오버레이 미니 모드(2번)는 다음에 한다.

| 항목 | 결정 | 이유 |
| --- | --- | --- |
| 런타임 | Electron 45 (devDependency). Tauri 제외 | 수집·포커스 로직이 전부 `node:` 내장 모듈이라 Node가 내장된 Electron이면 한 줄도 안 바꾼다. Tauri는 Rust 툴체인과 Node 사이드카가 필요하고 이 PC에 cargo도 없다 |
| 서버 ↔ 앱 경계 | 메인 프로세스가 HTTP 서버를 **그대로** 띄우고 창은 그 URL을 연다. IPC·preload 없음 | 화면(`public/`)이 이미 `/api/state` 폴링과 `/api/focus` POST로만 서버를 쓴다. 같은 계약을 앱 안에서도 쓰면 브라우저 모드와 데스크탑 모드가 한 코드다. Host·Origin 검사와 CSP도 그대로 적용된다 |
| 준비 신호 | `server.mjs`가 `ready`(listen 완료 Promise)와 `address`를 export | 창을 열기 전에 서버가 떠 있어야 한다. CLI 실행은 아무도 안 기다려도 되므로 동작이 같다 |
| 포트 충돌 | `EADDRINUSE`면 떠 있는 서버를 그대로 쓴다 | 플러그인 스킬(`/agent-office on`)이 띄운 서버와 공존해야 한다. 같은 앱·같은 데이터라 창만 열면 된다 |
| 창 생성 분리 | `openWindow(path, options)` 함수 | 미니 모드(투명·항상 위·클릭 통과 창으로 `/?mini` 같은 경로)를 `openWindow` 한 번 더 부르는 걸로 붙이기 위해 |
| 외부 링크 | `setWindowOpenHandler`로 `http(s)`만 기본 브라우저, 나머지는 거부. `will-navigate`는 서버 주소 밖이면 막는다 | 칩이 `target=_blank`라 앱 안에 창이 또 생기는 걸 막고, 읽기 전용·외부 요청 없음 원칙을 유지 |
| Dock 배지 | 메인이 2초마다 `/api/state`를 읽어 `counts.waiting` | 서버 내부 상태를 끌어내지 않고 화면과 같은 API를 쓴다. 기존 서버를 쓰는 경우에도 동작 |
| PATH | 메인 시작 시 Orca CLI·Homebrew 경로를 앞에 붙인다 | Finder에서 띄운 앱은 PATH가 좁아 `orca terminal switch`(ADR 0003)가 ENOENT가 된다 |
| 패키징 | `@electron/packager`로 `dist/Agent Office-darwin-arm64/Agent Office.app`. 서명·공증·아이콘·자동 업데이트 없음 | 개인 PC에서 쓰는 단계. `dist/`는 gitignore. PF스타더스트 폰트가 로컬에 있으면 .app에 들어가므로 .app을 배포하지 않는다(README 재배포 금지) |

## 확인한 것 (2026-11-09, 이 PC)

- `npm run desktop` — 빈 포트(4599)에서 앱이 서버를 띄운 경우와, 4545가 점유된 상태에서 떠 있는 서버를 재사용한 경우 모두 사무실이 완전히 그려짐(`AGENT_OFFICE_SCREENSHOT`로 캡처).
- `npm run dist`로 만든 .app 바이너리를 직접 실행해도 같음.
- `node --test` 92개 통과. `node server.mjs` 방식 그대로 동작.
- **미확인**: 칠판 클릭 → 터미널 포커스가 Finder에서 띄운 .app에서 실제로 동작하는지(PATH 보정은 넣었으나 Ghostty의 AppleScript 자동화 권한은 앱마다 따로 물으므로 첫 클릭에 권한 창이 뜰 수 있다). Dock 배지 표시는 코드만 있고 눈으로 확인하지 않았다.

## 함정

- **ESM 진입 파일에서 최상위 `await app.whenReady()`를 하면 멈춘다.** Electron은 진입 모듈 로딩이 끝난 뒤에 `ready`를 내므로 서로 기다린다. `app.whenReady().then(...)` 콜백 안에서 창을 연다. (실측: 창이 안 뜨고 프로세스만 남음)
- 앱을 두 개 동시에 띄우면 같은 `userData` 캐시 폴더를 다퉈 디스크 캐시 오류가 찍히고 첫 렌더가 늦을 수 있다. 하나만 띄운다.

## Considered Options

- **Claude Code mod(Pane)로 옮기기** — 사용자가 의도한 "데스크탑앱"이 아니었다. mod 의존성이 생기고 canvas를 못 쓴다.
- **Tauri** — 작지만 Node 로직을 사이드카로 넣거나 Rust로 다시 써야 한다.
- **메인 프로세스가 HTTP 없이 `collectOffice`를 직접 불러 IPC로 주기** — 화면을 preload/IPC용으로 다시 써야 하고 브라우저 모드와 갈라진다. 얻는 건 포트 하나뿐.
- **미니 모드까지 이번에** — 창 구조(투명·클릭 통과)와 canvas 축소판을 새로 그려야 해서 별도 ADR·스펙으로 미룬다.
