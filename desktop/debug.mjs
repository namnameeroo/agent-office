// 검증 장치. 환경 변수로만 켜지고, main.mjs가 창·서버 준비를 마친 뒤 한 번 부른다.
// AGENT_OFFICE_SCREENSHOT=<png>면 큰 창을 캡처(기본 3초 뒤), AGENT_OFFICE_SCREENSHOT_MINI=<png>면 미니 모드로 바꾼 뒤
// 바탕화면 전체를 screencapture로 찍고 끝낸다(기본 4초). AGENT_OFFICE_SCREENSHOT_EXPAND=1이면 캡처 2초 전에 첫 펼칠 수 있는 말풍선을 누른다.
// AGENT_OFFICE_SMOKE=1이면 미니 모드로 바꾼 뒤 캐릭터 창을 재고 옮겨 보며 [smoke] JSON 줄을 찍고 끝낸다(캡처 없음).
// 단언은 scripts/smoke-pets.mjs(npm run smoke)가 한다
import { app, screen } from "electron";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { PET_H } from "./pets.mjs";

export function installDebug({
  office,
  pets,
  HUB,
  showMini,
  arrangePets,
  savedPos,
  relocate,
}) {
  const delay = Number(process.env.AGENT_OFFICE_SCREENSHOT_DELAY);
  if (process.env.AGENT_OFFICE_DEBUG) {
    const relay = (win, tag) =>
      win.webContents.on("console-message", (ev) =>
        console.log(
          `[${tag}]`,
          ev.level,
          ev.message,
          ev.sourceId,
          ev.lineNumber,
        ),
      );
    relay(office, "office");
    app.on("browser-window-created", (_e, w) => relay(w, "pet"));
  }
  if (process.env.AGENT_OFFICE_SCREENSHOT)
    setTimeout(async () => {
      await writeFile(
        process.env.AGENT_OFFICE_SCREENSHOT,
        (await office.webContents.capturePage()).toPNG(),
      );
      app.quit();
    }, delay || 3000);
  if (process.env.AGENT_OFFICE_SMOKE) {
    setTimeout(showMini, 1200);
    setTimeout(
      () =>
        smoke(pets, HUB, relocate)
          .catch((e) => console.log("[smoke]", JSON.stringify({ step: "error", message: String(e?.stack ?? e) })))
          .finally(() => setTimeout(() => app.quit(), 300)), // 파이프로 나가는 마지막 줄이 잘리지 않게
      4500,
    );
  }
  if (process.env.AGENT_OFFICE_SCREENSHOT_MINI) {
    const at = delay || 4000;
    setTimeout(showMini, 1200);
    if (process.env.AGENT_OFFICE_DEBUG_ARRANGE)
      setTimeout(() => {
        const before = [...pets.values()].map((q) => [q.pid, q.win.getBounds().x, q.win.getBounds().y]);
        const n = arrangePets();
        const after = [...pets.values()].map((q) => [q.pid, q.win.getBounds().x, q.win.getBounds().y]);
        console.log("[arrange-test]", n, JSON.stringify(before), "->", JSON.stringify(after));
      }, at - 1500);
    if (process.env.AGENT_OFFICE_DEBUG_DRAG)
      setTimeout(async () => {
        const p = [...pets.values()][0];
        if (!p) return console.log("[drag-test] no pet");
        const wc = p.win.webContents;
        console.log("[drag-test] before", JSON.stringify(p.win.getBounds()));
        const b = p.win.getBounds();
        const sx = b.x + 40, sy = b.y + b.height - 30;
        wc.sendInputEvent({ type: "mouseDown", x: 40, y: b.height - 30, button: "left", clickCount: 1 });
        for (let i = 1; i <= 10; i++) {
          await new Promise((r) => setTimeout(r, 30));
          wc.sendInputEvent({ type: "mouseMove", x: 40 + i * 20, y: b.height - 30 - i * 10, globalX: sx + i * 20, globalY: sy - i * 10, buttons: 1 });
        }
        await new Promise((r) => setTimeout(r, 100));
        wc.sendInputEvent({ type: "mouseUp", x: 240, y: b.height - 130, button: "left", clickCount: 1 });
        await new Promise((r) => setTimeout(r, 200));
        console.log("[drag-test] after", JSON.stringify(p.win.getBounds()), "saved", JSON.stringify(savedPos(p.pid)));
      }, at - 1500); // 첫 폴링이 lastDesks를 채운 뒤
    if (process.env.AGENT_OFFICE_SCREENSHOT_EXPAND)
      setTimeout(() => {
        for (const p of pets.values())
          p.win.webContents.executeJavaScript(
            'document.querySelector(".bubble:not([hidden]):not([data-static])")?.click()',
          );
      }, at - 2000);
    // 허브의 숨김 토글: 숨김 → 보임 → 숨김을 눌러 보고 단계마다 창 표시 여부·좌표·타일 상태를 찍는다(캡처는 숨긴 화면)
    if (process.env.AGENT_OFFICE_DEBUG_HIDE)
      setTimeout(async () => {
        const hub = pets.get(HUB)?.win.webContents;
        if (!hub) return console.log("[hide-test] no hub");
        const wins = () =>
          JSON.stringify(
            [...pets.values()].map((p) => {
              const b = p.win.getBounds();
              return [p.pid, p.win.isVisible(), b.x, b.y + b.height];
            }),
          );
        const tile = () =>
          hub.executeJavaScript(
            `(()=>{const b=document.querySelector("[data-act=pets]"),g=b.querySelector(".badge"),r=document.querySelector(".hub").getBoundingClientRect();return JSON.stringify({pressed:b.getAttribute("aria-pressed"),title:b.title,badge:g.hidden?null:g.textContent,hub:[r.width,r.height],win:[innerWidth,innerHeight]})})()`,
          );
        const click = async () => {
          await hub.executeJavaScript(
            'document.querySelector("[data-act=pets]").click()',
          );
          await new Promise((r) => setTimeout(r, 900));
        };
        console.log("[hide-test] 0 처음", wins(), await tile());
        await click();
        console.log("[hide-test] 1 숨김", wins(), await tile());
        await click();
        console.log("[hide-test] 2 보임", wins(), await tile());
        await click();
        console.log("[hide-test] 3 숨김", wins(), await tile());
      }, at - 5000);
    // 펼친 뒤의 창·캐릭터·스크롤 수치(캐릭터가 창 밖으로 밀리는지 본다)
    if (process.env.AGENT_OFFICE_DEBUG)
      setTimeout(async () => {
        for (const p of pets.values())
          console.log(
            "[layout-test]",
            p.pid,
            JSON.stringify(p.win.getBounds()),
            await p.win.webContents.executeJavaScript(
              `(()=>{const q=(s)=>document.querySelector(s)?.getBoundingClientRect(),f=q(".face"),b=q(".bubble"),c=q(".cell"),n=q(".name");return JSON.stringify({iw:innerWidth,ih:innerHeight,faceL:f?.left,faceB:f?.bottom,nameL:n?.left,nameW:n?.width,nameB:n?.bottom,bubL:b?.left,bubW:b?.width,bubT:b?.top,bubH:b?.height,cellW:c?.width,cellH:c?.height,open:!!document.querySelector(".bubble[data-open]"),scroll:[document.scrollingElement.scrollTop,document.body.scrollTop,document.getElementById("bar").scrollTop,document.getElementById("row").scrollTop]})})()`,
            ),
          );
      }, at - 500);
    setTimeout(() => {
      execFile(
        "screencapture",
        ["-x", process.env.AGENT_OFFICE_SCREENSHOT_MINI],
        () => app.quit(),
      );
    }, at);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 캐릭터 창 안의 칸 수치(창 기준 CSS px). 숨긴 요소는 null
const MEASURE = `(()=>{const q=(s)=>{const e=document.querySelector(s);if(!e||e.hidden)return null;const r=e.getBoundingClientRect();return{l:r.left,t:r.top,w:r.width,h:r.height}};const b=document.querySelector(".bubble");return JSON.stringify({iw:innerWidth,ih:innerHeight,face:q(".face"),name:q(".name"),bubble:q(".bubble"),open:!!document.querySelector(".bubble[data-open]"),canOpen:!!b&&!b.hidden&&!("static" in b.dataset)})})()`;
const BUBBLE = 'document.querySelector(".bubble:not([hidden]):not([data-static])")?.click()';

// 측정 순서: 접힘(전부) → 펼침(바닥 왼쪽) → 위쪽 끝 펼침 → 오른쪽 끝 쪽지 → 허브 숨김·보임. 단계마다 [smoke] 한 줄
async function smoke(pets, HUB, relocate) {
  const log = (step, data) =>
    console.log("[smoke]", JSON.stringify({ step, ...data }));
  const js = (p, code) => p.win.webContents.executeJavaScript(code);
  const all = () => [...pets.values()];
  const snap = async (p) => {
    const b = p.win.getBounds();
    return {
      pid: p.pid,
      visible: p.win.isVisible(),
      b,
      wa: screen.getDisplayMatching(b).workArea, // 메인의 선택(areaAt)과 따로: 창이 실제로 걸친 화면
      anchor: p.anchor,
      ...(p.pid === HUB ? {} : JSON.parse(await js(p, MEASURE))),
    };
  };
  const snapAll = () => Promise.all(all().map(snap));
  const toggle = async (p) => {
    await js(p, BUBBLE);
    await sleep(1000);
  };
  // 지나가는 마우스(쪽지·호버)가 수치를 흔들지 않게. 아래 단계는 DOM 이벤트·click()으로만 누른다
  for (const p of all()) p.win.setIgnoreMouseEvents(true);
  const collapsed = await snapAll();
  log("collapsed", { wins: collapsed });

  const chars = all().filter((p) => p.pid !== HUB);
  if (chars.length) {
    const wa = screen.getPrimaryDisplay().workArea;
    const floor = wa.y + wa.height - PET_H;
    const target = chars.find(
      (p) => collapsed.find((s) => s.pid === p.pid)?.canOpen,
    );
    if (!target) log("expand", { skip: "펼칠 수 있는 말풍선이 없다" });
    else {
      // 펼침: 오른쪽·위쪽 끝에 안 걸리는 바닥 왼쪽에서
      relocate(target, { x: wa.x + 24, y: floor });
      await sleep(800);
      const before = await snap(target);
      await toggle(target);
      const after = await snap(target);
      await toggle(target);
      log("expand", { before, after });
      // 위쪽 끝: 창 아래 모서리를 작업 영역 위 끝 + 160에 두고 펼친다(roomAbove 160)
      relocate(target, { x: wa.x + 24, y: wa.y + 160 - PET_H });
      await sleep(800);
      const tb = await snap(target);
      await toggle(target);
      const ta = await snap(target);
      await toggle(target);
      log("top", { before: tb, after: ta });
    }
    // 오른쪽 끝: 앵커 = 작업 영역 오른쪽 - 112(접힌 128 창이 16 밀리는 자리). 마우스 올림(쪽지)으로 창을 넓힌다
    const p = chars[0];
    relocate(p, { x: wa.x + wa.width - 112, y: floor });
    await sleep(800);
    const rb = await snap(p);
    await js(p, 'document.documentElement.dispatchEvent(new MouseEvent("mouseenter"))');
    await sleep(1000);
    const ra = await snap(p);
    await js(p, 'document.documentElement.dispatchEvent(new MouseEvent("mouseleave"))');
    await sleep(800);
    log("right", { before: rb, after: ra });
  }

  // 허브의 눈 타일: 숨김 → 보임
  const hub = pets.get(HUB);
  if (hub) {
    const click = async () => {
      await js(hub, 'document.querySelector("[data-act=pets]").click()');
      await sleep(900);
    };
    const before = await snapAll();
    await click();
    const hidden = await snapAll();
    await click();
    const shown = await snapAll();
    log("hide", { before, hidden, shown });
  }
  log("end", { pets: chars.length });
}
