// Electron 껍데기. server.mjs를 앱 안에서 그대로 띄우고 그 주소를 창에 연다. 화면(public/)·수집(lib/) 코드는 건드리지 않는다.
// 창은 큰 사무실("/") 하나와, 미니 모드일 때 세션마다 하나씩 뜨는 투명 캐릭터 창("/mini?pid=N")이다(ADR 0006).
import { app, BrowserWindow, Menu, clipboard, ipcMain, screen, shell } from "electron";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { visibleDesks } from "../public/mini-model.mjs";
import {
  PET_W,
  PET_H,
  BASE_H,
  growsDown,
  spotFor,
  fitBounds,
  fitRoom,
  petCenter,
  clampTo,
  prunePositions,
  arrangeAll,
} from "./pets.mjs";
import { installDebug } from "./debug.mjs";

// 검증 실행(npm run smoke 등)은 사용자 데이터(저장된 캐릭터 위치·세션 저장소)를 건드리지 않게 다른 폴더를 쓴다. POS_FILE보다 먼저
if (process.env.AGENT_OFFICE_USER_DATA)
  app.setPath("userData", process.env.AGENT_OFFICE_USER_DATA);

// Finder에서 띄운 앱은 PATH가 좁아 터미널 포커스가 쓰는 orca CLI를 못 찾는다
process.env.PATH = [
  "/Applications/Orca.app/Contents/Resources/bin",
  "/opt/homebrew/bin",
  "/usr/local/bin",
  process.env.PATH,
].join(":");

// 4545를 이미 다른 프로그램(옛 버전 서버, 같은 Mac의 다른 계정 프로그램 포함)이 쥐고 있으면 그 서버를 믿지 않는다.
// 그 화면이 preload 브리지가 있는 창에 실리기 때문이다. 대신 빈 포트에 앱 전용 서버를 띄운다. PORT를 주면 그 값 그대로
if (!process.env.PORT && !(await tryPort(4545)))
  process.env.PORT = String(await tryPort(0));
const { ready, address } = await import("../server.mjs");
const serverUp = ready;
const ORIGIN = new URL(address).origin;

// 그 포트에 잠깐 열어 보고 닫는다. 열리면 실제 포트 번호, 이미 쓰이면 0
function tryPort(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(0));
    s.listen(port, "127.0.0.1", () => {
      const { port: p } = s.address();
      s.close(() => resolve(p));
    });
  });
}

const PRELOAD = fileURLToPath(new URL("./preload.cjs", import.meta.url));

function openWindow(path, options = {}) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: "Agent Office",
    ...options,
    webPreferences: { sandbox: true, preload: PRELOAD },
  });
  // PR·Jira·artifact 칩은 target=_blank다. 앱 안에 새 창을 만들지 않고 기본 브라우저로 넘긴다. http(s) 밖은 열지 않는다
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // 접두사 비교는 http://127.0.0.1:4545@evil.example/ 이나 :45450을 통과시킨다. 파싱한 origin을 정확히 비교한다
  win.webContents.on("will-navigate", (e, url) => {
    if (!(URL.canParse(url) && new URL(url).origin === ORIGIN)) e.preventDefault();
  });
  win.loadURL(address + path);
  return win;
}

let office = null;
const primaryArea = () => screen.getPrimaryDisplay().workArea; // 새 캐릭터 자리·자동 정렬
// 끌기·맞춤·복원: 그 캐릭터가 있는(끌려가는) 지점에 가장 가까운 디스플레이의 작업 영역 → 보조 모니터로도 끌 수 있다
const areaAt = (anchor) =>
  screen.getDisplayNearestPoint(petCenter(anchor)).workArea;

// ── 캐릭터 창(미니 모드 2). pid → { win, pid, anchor, size }. anchor = 창의 왼쪽 아래 모서리(DIP), size = 렌더러가 마지막으로 잰 내용물 ──
// ponytail: 창 = 세션 하나(보통 5개 안팎). 15개를 넘기는 일이 잦으면 투명 창 하나 + setIgnoreMouseEvents(forward)로
const pets = new Map();
let miniOn = false;
let lastDesks = []; // 마지막으로 받은 책상들. 폴링이 실패해도 유지한다(창을 닫지 않기 위해)
const POS_FILE = join(app.getPath("userData"), "mini-positions.json");
let positions = {};
try {
  positions = JSON.parse(readFileSync(POS_FILE, "utf8"));
} catch {}
if (!positions || typeof positions !== "object") positions = {};
function savePositions() {
  try {
    writeFileSync(POS_FILE, JSON.stringify(positions));
  } catch {}
}
const senderPet = (e) =>
  [...pets.values()].find((p) => p.win.webContents === e.sender) ?? null;

// 창을 앵커와 렌더러가 마지막으로 잰 내용물 크기(size)에 맞춘다. 렌더러가 캐릭터를 화면 제자리에 두도록
// pets.mjs fitRoom 값({ shiftX, roomAbove } 또는 아래로 자라면 { shiftX, down, roomBelow, footY })을 돌려준다.
// 캐릭터가 화면 위쪽 절반이면 아래로 자란다(base = 렌더러가 잰 얼굴·이름표 칸, 첫 응답 전엔 BASE_H). 허브는 늘 위로, 캐릭터 최소 크기(80×70)에도 안 묶는다(투명 여백이 클릭을 먹지 않게)
function place(p) {
  const wa = areaAt(p.anchor);
  const hub = p.pid === HUB;
  const base = !hub && growsDown(p.anchor, wa) ? (p.size.base ?? BASE_H) : undefined;
  const r = fitBounds(p.anchor, p.size.w, p.size.h, wa, hub ? { w: 0, h: 0 } : undefined, base);
  p.win.setBounds(r);
  return fitRoom(p.anchor, r, wa, base != null);
}
// 앵커를 옮긴다(그 지점에서 가장 가까운 화면의 작업 영역 안으로). 캐릭터 창의 한계는 clampTo 기본(오른쪽 접힌 창 폭·위 정렬 첫 줄), 허브는 따로
function moveTo(p, anchor) {
  p.anchor = clampTo(areaAt(anchor), anchor, p.pid === HUB);
  return place(p);
}
// 메인이 스스로 옮길 때(정렬·디스플레이 변경)는 렌더러가 묻지 않았으므로 같은 값을 보낸다
const relocate = (p, anchor) =>
  p.win.webContents.send("pet:room", moveTo(p, anchor));

// 자리 규칙은 pets.mjs spotFor. 새로 놓은 자리는 바로 저장해 예약한다(휴면해도 다른 새 캐릭터가 못 가져간다)
function createPet(pid) {
  const { anchor, fresh } = spotFor({
    saved: positions[pid],
    pets: [...pets.values()].filter((p) => p.pid !== HUB).map((p) => p.anchor),
    hub: pets.get(HUB)?.anchor,
    reserved: Object.entries(positions)
      .filter(([k]) => k !== String(pid))
      .map(([, v]) => v),
    areaAt,
    primary: primaryArea(),
  });
  if (fresh) {
    positions[pid] = anchor;
    savePositions();
  }
  const win = openWindow(`/mini?pid=${pid}`, {
    x: anchor.x,
    y: anchor.y,
    width: PET_W,
    height: PET_H,
    show: !petsHidden, // 허브에서 캐릭터를 숨겨 둔 동안 생긴 세션은 창만 만들고 안 보인다
    type: "panel", // 비활성 패널: 끌기·더블클릭을 해도 쓰던 앱의 키 입력을 뺏지 않는다
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    closable: false, // 기본 메뉴의 ⌘W가 frameless 창도 닫기 때문
    acceptFirstMouse: true,
    title: `Agent Office · ${pid}`,
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true });
  const pet = { win, pid, anchor, size: { w: PET_W, h: PET_H } };
  pets.set(pid, pet);
  return pet;
}
// 본부(허브) 창: 타워 엠블럼 + 바로가기(사무실·정렬·새 터미널). pets 맵에 "hub"로 들어가 fit·drag IPC를 그대로 쓴다
const HUB = "hub";
let petsHidden = false; // 허브의 눈 타일: 캐릭터 창을 한꺼번에 가린다(허브는 남는다). 저장하지 않는다 — 앱을 다시 켜면 보임
function createHub() {
  const wa = primaryArea();
  const saved = positions[HUB];
  const anchor = saved
    ? clampTo(areaAt(saved), saved, true)
    : { x: wa.x + wa.width - 24 - 100, y: wa.y + wa.height - PET_H }; // 기본: 바닥 오른쪽
  const win = openWindow("/mini?hub=1", {
    x: anchor.x,
    y: anchor.y,
    width: 100,
    height: PET_H,
    type: "panel",
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    closable: false,
    acceptFirstMouse: true,
    title: "Agent Office · hub",
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true });
  const hub = { win, pid: HUB, anchor, size: { w: 100, h: PET_H } };
  pets.set(HUB, hub);
  return hub;
}
function closePet(pid) {
  const p = pets.get(pid);
  if (!p) return;
  pets.delete(pid);
  p.win.setClosable(true);
  p.win.close();
}
// 보이는 세션 집합과 창 집합을 맞춘다. 미니 모드일 때만 창을 만든다
function syncPets(desks) {
  // 위치는 세션이 아예 사라졌을 때만 지운다(휴면은 유지: 복귀하면 같은 자리)
  const pruned = prunePositions(positions, [...desks.map((d) => d.pid), HUB]);
  if (Object.keys(pruned).length !== Object.keys(positions).length) {
    positions = pruned;
    savePositions();
  }
  const want = new Set(visibleDesks(desks, Date.now()).map((d) => d.pid));
  for (const pid of [...pets.keys()])
    if (pid !== HUB && !want.has(pid)) closePet(pid);
  if (!miniOn) return;
  for (const pid of want) {
    const p = pets.get(pid) ?? createPet(pid);
    if (petsHidden) {
      if (p.win.isVisible()) p.win.hide();
    } else if (!p.win.isVisible()) p.win.showInactive();
  }
}
function showMini() {
  miniOn = true;
  office.hide();
  syncPets(lastDesks);
  const h = pets.get(HUB) ?? createHub();
  if (!h.win.isVisible()) h.win.showInactive();
}
function showOffice() {
  miniOn = false;
  for (const p of pets.values()) p.win.hide();
  office.show();
  office.focus();
}
const toggleMini = () => (miniOn ? showOffice() : showMini());

ipcMain.handle("office:open", () => showOffice());
ipcMain.handle("mini:open", () => showMini());
// 내용물 크기에 창을 맞춘다. 말풍선이 생기면 이웃 창에 가리지 않게 맨 위로. opts.base: 얼굴·이름표 칸 높이(아래로 자랄 때 창 위 끝 → 발밑).
// → fitRoom 값 | false
ipcMain.handle("pet:fit", (e, w, h, opts) => {
  const p = senderPet(e);
  if (!p || !Number.isFinite(w) || !Number.isFinite(h)) return false;
  p.size = { w, h, base: Number.isFinite(opts?.base) ? opts.base : undefined };
  const room = place(p);
  if (opts?.top) p.win.moveTop();
  if (process.env.AGENT_OFFICE_DEBUG)
    console.log("[fit]", p.pid, w, h, opts, JSON.stringify(p.win.getBounds()));
  return room;
});
// 끌기: 렌더러가 앵커(왼쪽 x, 발밑 bottom = 앵커 y + PET_H)를 요청한다. 끌던 중 창 높이·자라는 방향이 바뀌어도(말풍선, 중간선) 앵커가 흔들리지 않는다.
// 끌려가는 지점의 화면을 따른다(보조 모니터). → fit과 같은 fitRoom 값 | false
ipcMain.handle("pet:drag", (e, x, bottom) => {
  const p = senderPet(e);
  if (process.env.AGENT_OFFICE_DEBUG) console.log("[drag]", !!p, x, bottom);
  if (!p || !Number.isFinite(x) || !Number.isFinite(bottom)) return false;
  return moveTo(p, { x: Math.round(x), y: Math.round(bottom) - PET_H });
});
ipcMain.handle("pet:drag-end", (e) => {
  const p = senderPet(e);
  if (!p) return false;
  positions[p.pid] = p.anchor;
  savePositions();
  return true;
});
// 허브: 캐릭터 자동 정렬 — 보이는 순서(기다림→작업→휴식)대로 바닥(side "top"이면 위) 왼쪽부터 한 줄, 저장된 위치를 덮어쓴다
function arrangePets(side) {
  const order = visibleDesks(lastDesks, Date.now())
    .map((d) => d.pid)
    .filter((pid) => pets.has(pid));
  const spots = arrangeAll(order, primaryArea(), side);
  for (const pid of order) {
    const q = pets.get(pid);
    relocate(q, spots[pid]);
    positions[pid] = q.anchor;
  }
  savePositions();
  return order.length;
}
// 허브의 정렬 타일 둘(↓ 아래 · ↑ 위). 토글이 아니다: 누를 때마다 그 쪽으로 다시 줄 세운다
ipcMain.handle("hub:arrange", (e, side) => {
  const p = senderPet(e);
  if (!p || p.pid !== HUB) return false;
  arrangePets(side === "top" ? "top" : "bottom");
  return true;
});
// 허브: 캐릭터 창을 한꺼번에 숨기거나 다시 보인다. 창은 닫지 않으므로 자리·펼친 말풍선이 그대로 돌아온다
ipcMain.handle("hub:pets", (e) => {
  const p = senderPet(e);
  if (!p || p.pid !== HUB) return petsHidden;
  petsHidden = !petsHidden;
  syncPets(lastDesks);
  return petsHidden;
});
// 허브: 새 Ghostty 창. Ghostty 1.4에는 새 창 CLI가 없어 활성화 뒤 ⌘N을 보낸다(System Events → 손쉬운 사용 권한을 한 번 묻는다)
ipcMain.handle("hub:terminal", (e) => {
  const p = senderPet(e);
  if (!p || p.pid !== HUB) return false;
  return new Promise((resolve) =>
    execFile(
      "osascript",
      [
        "-e",
        'tell application "Ghostty" to activate',
        "-e",
        'tell application "System Events" to tell process "Ghostty" to keystroke "n" using command down',
      ],
      { timeout: 5000 },
      (err) => resolve(!err),
    ),
  );
});
// 우클릭 메뉴(네이티브). 고른 항목을 렌더러에 돌려주고, 터미널 포커스는 렌더러가 /api/focus로 보낸다
ipcMain.handle("pet:menu", (e, pid, info) => {
  const p = senderPet(e);
  if (!p || p.pid !== pid) return {};
  return new Promise((resolve) => {
    let picked = {};
    const items = [
      { label: "터미널 앞으로", click: () => (picked = { focus: true }) },
      { label: "큰 사무실 열기", click: () => showOffice() },
    ];
    if (info?.canExpand)
      items.push({
        label: info.expanded ? "말풍선 접기" : "말풍선 전문 보기",
        click: () => (picked = { expand: !info.expanded }),
      });
    // 캐릭터 창은 키 입력을 뺏지 않는 패널이라 ⌘C에 기댈 수 없다. 렌더러가 준 글(전문, 없으면 보이는 말풍선)을 클립보드로
    if (typeof info?.copy === "string" && info.copy)
      items.push({ label: "응답 복사", click: () => clipboard.writeText(info.copy) });
    items.push(
      { type: "separator" },
      { label: "Agent Office 종료", click: () => app.quit() },
    );
    Menu.buildFromTemplate(items).popup({
      window: p.win,
      callback: () => resolve(picked),
    });
  });
});

// ready는 ESM 진입 파일 로딩이 끝난 뒤에 난다. 최상위에서 await app.whenReady()를 하면 서로 기다리다 멈춘다
app.whenReady().then(async () => {
  await serverUp;
  office = openWindow("/");
  // 숨긴 창이 남아 있으면 window-all-closed가 안 나므로 큰 창이 닫히면 직접 끝낸다
  office.on("closed", () => app.quit());

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "fileMenu" },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          {
            label: "미니 모드 토글",
            accelerator: "CmdOrCtrl+Shift+M",
            click: toggleMini,
          },
          { type: "separator" },
          { role: "reload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      { role: "windowMenu" },
    ]),
  );
  // 디스플레이가 바뀌거나 빠지면 캐릭터를 가장 가까운 화면의 작업 영역 안으로
  const refit = () => {
    for (const p of pets.values()) relocate(p, p.anchor);
  };
  screen.on("display-metrics-changed", refit);
  screen.on("display-removed", refit);

  // 1초마다 /api/state: Dock 배지(나를 기다리는 수) + 미니 모드의 캐릭터 창 집합. 실패하면 아무것도 바꾸지 않는다
  setInterval(async () => {
    try {
      const { counts, desks } = await (
        await fetch(`${address}/api/state`)
      ).json();
      app.dock?.setBadge(counts.waiting ? String(counts.waiting) : "");
      lastDesks = desks;
      if (miniOn) syncPets(desks);
    } catch {}
  }, 1000);

  // 검증 장치(캡처·[layout-test] 등 탐침·npm run smoke). 환경 변수가 없으면 아무것도 안 한다
  installDebug({
    office,
    pets,
    HUB,
    showMini,
    arrangePets,
    savedPos: (pid) => positions[pid],
    relocate,
  });
});
app.on("activate", () => office && showOffice()); // Dock 아이콘 클릭 → 큰 창
// closable:false 창은 quit의 닫기도 거부한다. 끝낼 때는 닫을 수 있게 돌려놓는다
app.on("before-quit", () => {
  for (const p of pets.values()) p.win.setClosable(true);
});
app.on("window-all-closed", () => app.quit());
