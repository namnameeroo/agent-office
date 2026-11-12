// 검증 장치. 환경 변수로만 켜지고, main.mjs가 창·서버 준비를 마친 뒤 한 번 부른다.
// AGENT_OFFICE_SCREENSHOT=<png>면 큰 창을 캡처(기본 3초 뒤), AGENT_OFFICE_SCREENSHOT_MINI=<png>면 미니 모드로 바꾼 뒤
// 바탕화면 전체를 screencapture로 찍고 끝낸다(기본 4초). AGENT_OFFICE_SCREENSHOT_EXPAND=1이면 캡처 2초 전에 첫 펼칠 수 있는 말풍선을 누른다.
// AGENT_OFFICE_SMOKE=1이면 미니 모드로 바꾼 뒤 캐릭터 창을 재고 옮겨 보며 [smoke] JSON 줄을 찍고 끝낸다(캡처 없음).
// 단언은 scripts/smoke-pets.mjs(npm run smoke)가 한다. smoke 동안 기본 브라우저 열기·클립보드 쓰기·우클릭 메뉴는 가로채 기록만 한다
import { app, clipboard, Menu, screen, shell } from "electron";
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
    // 사용자 바깥 상태(브라우저·클립보드)를 건드리지 않는다. 우클릭 메뉴는 outside.pick 항목을 눌러 바로 닫는다
    shell.openExternal = async (url) => void outside.opened.push(url);
    clipboard.writeText = (text) => void outside.copied.push(text);
    Menu.prototype.popup = function (opts) {
      outside.menus.push(this.items.map((m) => m.label).filter(Boolean));
      this.items.find((m) => m.label === outside.pick)?.click();
      opts?.callback?.();
    };
    setTimeout(showMini, 1200);
    setTimeout(
      () =>
        smoke(pets, HUB, relocate, office)
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
const outside = { opened: [], copied: [], menus: [], pick: null };
// 캐릭터 창의 fetch를 감싼다: /api/state 요청 수·마지막 주소를 세고, full을 주면 그 창의 응답을 긴 마크다운으로 바꾼다(펼침을 실데이터와 무관하게)
const SPY = `(() => {
  if (window.__smoke) return;
  const s = (window.__smoke = { polls: 0, last: null, full: null });
  const f = window.fetch.bind(window);
  window.fetch = async (u, o) => {
    if (!String(u).startsWith("/api/state")) return f(u, o);
    s.polls++;
    s.last = String(u);
    const r = await f(u, o);
    if (!s.full || !r.ok) return r;
    const j = await r.json();
    for (const d of j.desks) { d.said = d.bubble = "스모크: 눌러서 펼침"; d.full = s.full; }
    return new Response(JSON.stringify(j));
  };
})()`;
const FULL = [
  "## 스모크 응답",
  "**굵게**와 `코드`, 링크 [예시 문서](https://example.com/smoke-doc), 그리고 <img src=x onerror=alert(1)> 글자.",
  "",
  "- 목록 하나",
  "- 목록 둘 [나쁜 링크](javascript:alert(1))",
  "",
  "```",
  "npm run smoke",
  "```",
  ...Array.from({ length: 40 }, (_, i) => `${i + 1}번째 줄: 긴 응답이 창 위로 넘치지 않는지 본다.`),
].join("\n");
const POLLS = "JSON.stringify({ n: window.__smoke?.polls ?? null, last: window.__smoke?.last ?? null, hidden: document.hidden, vis: document.visibilityState })";
const MD = `(() => { const b = document.querySelector(".bubble[data-open]"); if (!b) return "null"; const n = (s) => b.querySelectorAll(s).length;
  const a = b.querySelector("a"), r = a?.getBoundingClientRect();
  return JSON.stringify({ strong: n("strong"), code: n("code"), li: n("li"), pre: n("pre"), h: n(".h"), a: n("a"), bad: n("img, script, [onerror]"),
    link: a && { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), href: a.href, target: a.target, rel: a.rel } }); })()`;
// 창 안 (x, y)를 잡고 화면 x로 dxs만큼 차례로 끈 뒤 놓는다(실제 입력 이벤트). 창이 따라 움직이므로 창 안 좌표는 그대로 둔다
async function dragBy(win, x, y, dxs) {
  const b = win.getBounds();
  const wc = win.webContents;
  const at = (type, dx, extra = {}) =>
    wc.sendInputEvent({ type, x, y, globalX: b.x + x + dx, globalY: b.y + y, ...extra });
  at("mouseDown", 0, { button: "left", clickCount: 1 });
  for (const dx of dxs) {
    await sleep(80);
    at("mouseMove", dx);
  }
  await sleep(600);
  return () => {
    at("mouseUp", dxs.at(-1), { button: "left", clickCount: 1 });
    wc.sendInputEvent({ type: "mouseLeave", x: -1, y: -1 }); // 포인터를 창 밖으로(호버·쪽지가 다음 단계에 남지 않게)
  };
}
// 캐릭터 창 안의 칸 수치(창 기준 CSS px). 숨긴 요소는 null
const MEASURE = `(()=>{const q=(s)=>{const e=document.querySelector(s);if(!e||e.hidden)return null;const r=e.getBoundingClientRect();return{l:r.left,t:r.top,w:r.width,h:r.height}};const b=document.querySelector(".bubble");return JSON.stringify({iw:innerWidth,ih:innerHeight,face:q(".face"),name:q(".name"),bubble:q(".bubble"),open:!!document.querySelector(".bubble[data-open]"),canOpen:!!b&&!b.hidden&&!("static" in b.dataset)})})()`;
const BUBBLE = 'document.querySelector(".bubble:not([hidden]):not([data-static])")?.click()';

// 측정 순서: 접힘(전부) → 펼침(바닥 왼쪽, 링크 누름·응답 복사) → 위쪽 끝 펼침 → 오른쪽 끝 쪽지·끌기 시작 → 허브 숨김·보임(폴링 멈춤) → 허브 끌기.
// 단계마다 [smoke] 한 줄
async function smoke(pets, HUB, relocate, office) {
  const log = (step, data) =>
    console.log("[smoke]", JSON.stringify({ step, ...data }));
  const js = (p, code) => p.win.webContents.executeJavaScript(code);
  // 측정 중에 세션이 끝나 창이 닫힐 수 있다(실세션) → 닫힌 창은 건너뛴다
  const all = () => [...pets.values()].filter((p) => !p.win.isDestroyed());
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
  // 지나가는 마우스(쪽지·호버)가 수치를 흔들지 않게. 아래 단계는 DOM 이벤트·click()·sendInputEvent로만 누른다
  for (const p of all()) p.win.setIgnoreMouseEvents(true);
  const chars = all().filter((p) => p.pid !== HUB);
  // 상태 요청 세기(전부) + 첫 캐릭터의 응답을 긴 마크다운으로(펼침·위쪽 끝·링크·복사가 실데이터와 무관하게 돈다)
  for (const p of chars) await js(p, SPY);
  if (chars.length) await js(chars[0], `window.__smoke.full = ${JSON.stringify(FULL)}`);
  await sleep(1500);
  const collapsed = await snapAll();
  log("collapsed", { wins: collapsed });

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
      // 펼친 전문의 마크다운 요소, 그 안 링크를 실제 클릭(→ 메인 setWindowOpenHandler → openExternal), 말풍선은 펼친 채
      const md = JSON.parse(await js(target, MD));
      if (md?.link) {
        const wc = target.win.webContents;
        const { x, y } = md.link;
        wc.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
        wc.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
        wc.sendInputEvent({ type: "mouseLeave", x: -1, y: -1 }); // 포인터를 창 밖으로(쪽지가 다음 단계에 남지 않게)
        await sleep(600);
      }
      const clicked = await snap(target);
      // 우클릭 메뉴의 "응답 복사"
      outside.pick = "응답 복사";
      await js(target, 'document.querySelector(".cell").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))');
      await sleep(500);
      outside.pick = null;
      await toggle(target);
      log("expand", {
        before,
        after,
        md,
        link: { opened: outside.opened, stillOpen: clicked.open },
        copy: { menu: outside.menus.at(-1) ?? null, same: outside.copied.at(-1) === FULL, n: outside.copied.length },
      });
      // 위쪽 끝: 창 아래 모서리를 작업 영역 위 끝 + 160에 두고 펼친다(roomAbove 160)
      relocate(target, { x: wa.x + 24, y: wa.y + 160 - PET_H });
      await sleep(800);
      const tb = await snap(target);
      await toggle(target);
      const ta = await snap(target);
      await toggle(target);
      log("top", { before: tb, after: ta });
    }
    // 오른쪽 끝: 앵커 요청 = 작업 영역 오른쪽 - 112 → clampTo가 - 128(접힌 창 폭)로 막아 접힌 창은 안 밀린다(shiftX 0).
    // 마우스 올림(쪽지)으로 창을 넓히면 밀린 만큼 캐릭터 열이 옮겨진다. 그 상태에서 얼굴을 잡고 왼쪽으로 30 끈다(튀지 않아야)
    const p = chars[0];
    relocate(p, { x: wa.x + wa.width - 112, y: floor });
    await sleep(800);
    const rb = await snap(p);
    await js(p, 'document.documentElement.dispatchEvent(new MouseEvent("mouseenter"))');
    await sleep(1000);
    const ra = await snap(p);
    let drag = null;
    if (ra.face) {
      const DX = -30;
      const release = await dragBy(
        p.win,
        Math.round(ra.face.l + ra.face.w / 2),
        Math.round(ra.face.t + ra.face.h / 2),
        [-10, -20, DX],
      );
      drag = { dx: DX, during: await snap(p) };
      release();
      await sleep(500);
    }
    await js(p, 'document.documentElement.dispatchEvent(new MouseEvent("mouseleave"))');
    await sleep(800);
    log("right", { before: rb, after: ra, drag });
  }

  // 허브의 눈 타일: 숨김 → 보임
  const hub = pets.get(HUB);
  if (hub) {
    const click = async () => {
      await js(hub, 'document.querySelector("[data-act=pets]").click()');
      await sleep(900);
    };
    const polls = () =>
      Promise.all(
        chars
          .filter((p) => !p.win.isDestroyed())
          .map(async (p) => ({ pid: p.pid, ...JSON.parse(await js(p, POLLS)) })),
      );
    const before = await snapAll();
    await click();
    const hidden = await snapAll();
    // 숨긴 동안 3초: 캐릭터 창의 상태 요청이 멈춰야 한다(document.hidden). 다시 보이면 곧바로 재개
    const h0 = await polls();
    await sleep(3000);
    const h1 = await polls();
    await click();
    const shown = await snapAll();
    const s1 = await polls();
    log("hide", { before, hidden, shown, polls: { h0, h1, s1 } });

    // 허브 끌기(공용 drag.mjs): 타워를 잡고 왼쪽으로 40. 끈 뒤의 click은 무시돼 큰 사무실이 안 열려야 한다
    const t = JSON.parse(
      await js(hub, 'JSON.stringify((r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }))(document.querySelector("[data-act=office]").getBoundingClientRect()))'),
    );
    const hb = hub.win.getBounds();
    const release = await dragBy(hub.win, t.x, t.y, [-10, -20, -40]);
    release();
    await sleep(500);
    log("hubdrag", { dx: -40, before: hb, after: hub.win.getBounds(), office: office.isVisible() });
  }
  log("end", { pets: chars.length });
}
