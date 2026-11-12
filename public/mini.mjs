// 미니 모드 화면. 저장(localStorage)은 하지 않는다. 두 창:
// - 펫 모드(/mini?pid=N, Electron, ADR 0006 · 설계 v2): 투명 창에 캐릭터 하나. 얼굴·이름표 끌기 = 이동, 더블클릭 = 터미널, 우클릭 = 메뉴
// - 허브(/mini?hub=1): hub.mjs가 그린다
// 인자 없는 /mini(옛 하단 띠, ADR 0005)는 없어졌다 → 큰 사무실("/")로 보낸다
import { el, sync, setText, setAttr } from "./dom.mjs";
import { fetchState, requestFocus } from "./api.mjs";
import { linkEl } from "./common.mjs";
import { draggable } from "./drag.mjs";
import {
  visibleDesks,
  avatarState,
  stateAttr,
  waitLevel,
  chickCount,
  bubbleText,
  canExpand,
  expandedAfter,
  signText,
  peekLines,
  elapsedShort,
  whereShort,
  isBackground,
  mdBlocks,
  mdPlain,
} from "./mini-model.mjs";
import { avatarSvg } from "./mini-sprites.mjs";

const PARAMS = new URLSearchParams(location.search);
// 본부(허브) 창(/mini?hub=1): 캐릭터 대신 타워 엠블럼 + 바로가기. 폴링·캐릭터 렌더는 하지 않는다
const HUB = PARAMS.has("hub");
if (HUB) {
  document.body.classList.add("hub");
  import("./hub.mjs");
}
const PET = PARAMS.get("pid");
const petPid = PET ? Number(PET) : null;
const pet = petPid != null;
document.body.classList.toggle("pet", pet);
if (!HUB && !pet) location.replace("/");

const bar = document.getElementById("bar");
const row = document.getElementById("row");

let desks = [];
let expanded = null; // 펼친 말풍선의 pid
let peek = false; // 잠깐(0.15초) 올려두면 쪽지(위치·요청·지금·링크)를 편다
let offlineSince = null;
// 메인이 마지막으로 알려 준 창 사정(pet:fit·pet:drag 응답, pet:room = desktop/pets.mjs fitRoom) + 그때의 내용물 폭 w.
// shiftX: 오른쪽 끝에 걸려 창이 앵커보다 왼쪽으로 밀린 px. roomAbove/roomBelow: 창이 위로/아래로 자랄 수 있는 높이.
// down: 화면 위쪽 절반이라 창이 위 끝을 고정하고 아래로 자란다(body.down → 얼굴·이름표가 위, 말풍선·표지판·쪽지가 그 아래). footY: 창 위 끝 → 발밑
let room = null;
const reach = (r) => r?.roomBelow ?? r?.roomAbove; // 창이 자랄 수 있는 높이(방향 무관)
let fitW = 0; // 마지막으로 보낸 내용물 폭

// 펼친 말풍선의 마크다운(mini-model mdBlocks 토큰) → DOM. 응답 글은 믿지 않으므로 createElement·textContent로만 짓는다.
// 링크는 linkEl(common.mjs): http(s)만 <a target=_blank rel=noopener>, 메인 setWindowOpenHandler가 기본 브라우저로 넘긴다
const inlineEls = (tokens) =>
  tokens.map((t) => {
    if (t.t === "text") return document.createTextNode(t.v);
    if (t.t === "code") return el("code", null, t.v);
    if (t.t === "b") {
      const b = el("strong");
      b.append(...inlineEls(t.c));
      return b;
    }
    const a = linkEl({ url: t.href });
    a.textContent = t.v;
    return a;
  });
function blockEl(b) {
  if (b.type === "pre") return el("pre", null, b.text);
  if (b.items) {
    const list = el(b.type);
    if (b.start !== 1) list.start = b.start;
    for (const it of b.items) {
      const li = el("li");
      li.append(...inlineEls(it));
      list.append(li);
    }
    return list;
  }
  const p = el("p", b.type === "h" ? "h" : null);
  p.append(...inlineEls(b.inline));
  return p;
}
// 쪽지 값: 글, 또는 링크 줄(링크 객체 배열 → 누르면 기본 브라우저로)
function peekValue(v) {
  if (typeof v === "string") return el("dd", null, v);
  const dd = el("dd");
  v.forEach((l, i) => {
    if (i) dd.append(" · ");
    const a = linkEl(l);
    a.textContent = l.label;
    dd.append(a);
  });
  return dd;
}

function make(d) {
  const cell = el("div", "cell");
  cell.setAttribute("role", "listitem");
  const msg = el("div", "msg");
  msg.hidden = true;
  const pk = el("dl", "peek");
  pk.hidden = true;
  const bubble = el("button", "bubble");
  bubble.type = "button";
  bubble.dataset.action = "bubble";
  // 표지판 "! 승인": 기다릴 때만, 왜 기다리는지. 얼마나는 이름표 끝의 .wait
  const sign = el("div", "sign");
  sign.hidden = true;
  sign.append(el("b", null, "!"), el("span", "why"));
  const face = el("button", "face");
  face.type = "button";
  const name = el("div", "name");
  // 둘째 줄 .where: 어디서 도는 세션인지
  name.append(el("i", "dot"), el("span", "title"), el("span", "wait"), el("span", "where"));
  cell.append(msg, pk, bubble, sign, face, name);
  // 등장: 3프레임 낙하(CSS .enter). 끝나면 떼서 다시 안 돌게
  cell.classList.add("enter");
  setTimeout(() => cell.classList.remove("enter"), 400);
  return cell;
}

function update(cell, d, now) {
  const open = expanded === d.pid;
  const st = avatarState(d, now);
  const n = chickCount(d);
  const sig = `${d.pid}|${st}|${n}`;
  const face = cell.querySelector(".face");
  if (face.dataset.sig !== sig) {
    face.innerHTML = avatarSvg({ seed: d.pid, state: st, chicks: n });
    face.dataset.sig = sig;
  }
  cell.dataset.pid = d.pid;
  // 상태 점·이름표 색·표지판은 CSS가 data-state·data-level로 고른다(설계 v2)
  setAttr(cell, "data-state", stateAttr(st));
  cell.toggleAttribute("data-background", isBackground(d)); // 이름표 점: 빈 초록 고리
  setAttr(face, "aria-label", `${d.title} 터미널로`);
  const name = cell.querySelector(".name");
  setText(name.querySelector(".title"), d.title);
  const sign = cell.querySelector(".sign");
  const ms = now - d.since;
  if (d.state === "waiting") {
    // 5분부터 이름표 빨강, 15분부터 표지판 깜빡임
    setAttr(cell, "data-level", String(waitLevel(ms)));
    setText(sign.querySelector(".why"), signText(d));
    sign.hidden = false;
  } else {
    cell.removeAttribute("data-level");
    sign.hidden = true;
  }
  // 경과: 늘 보인다(이 상태로 얼마나 — 오래 도는 작업·방금 끝난 일을 가린다)
  setText(name.querySelector(".wait"), elapsedShort(ms));
  setText(name.querySelector(".where"), whereShort(d));
  const pk = cell.querySelector(".peek");
  const lines = peek && !open ? peekLines(d) : [];
  const lsig = JSON.stringify(lines);
  if (pk.dataset.sig !== lsig) {
    pk.dataset.sig = lsig;
    pk.replaceChildren(
      ...lines.flatMap(([k, v]) => [el("dt", null, k), peekValue(v)]),
    );
  }
  pk.hidden = !lines.length;
  const bubble = cell.querySelector(".bubble");
  const text = open ? d.full : bubbleText(d);
  bubble.hidden = text == null;
  // 펼침 = 가벼운 마크다운, 접힘(두 줄) = 기호를 벗긴 글. 글이 바뀔 때만 다시 짓는다(펼친 말풍선의 스크롤 유지)
  const bsig = `${open}|${text}`;
  if (bubble.sig !== bsig) {
    bubble.sig = bsig;
    if (open) bubble.replaceChildren(...mdBlocks(text).map(blockEl));
    else setText(bubble, mdPlain(text ?? ""));
  }
  bubble.dataset.pid = d.pid;
  if (canExpand(d)) delete bubble.dataset.static;
  else bubble.dataset.static = "";
  if (open) {
    bubble.dataset.open = "";
    cell.dataset.open = "";
    // 창이 자랄 수 있는 높이(메인의 roomAbove/roomBelow: 작업 영역 끝·60% 상한 중 작은 쪽)에서 말풍선 밖의 높이(얼굴·이름표·여백)를 잰 만큼 뺀다.
    // 화면 끝 가까이 둔 캐릭터도 이름표가 창 안에 남는다. 첫 응답 전에는 화면 60%로 대신. 100vh는 지금 창 높이라 쓸 수 없다
    const rest =
      cell.getBoundingClientRect().height -
      bubble.getBoundingClientRect().height;
    const limit = reach(room) ?? Math.floor(screen.availHeight * 0.6);
    bubble.style.maxHeight = `${Math.max(0, limit - Math.ceil(rest) - 1)}px`;
  } else {
    delete bubble.dataset.open;
    delete cell.dataset.open;
    bubble.style.maxHeight = "";
  }
  cell.classList.toggle("offline", offlineSince != null);
}

// 칸 자식의 레이아웃상 오른쪽 끝(px). translate(applyShift)는 레이아웃을 안 바꾸므로 열을 옮겨도 이 값은 그대로다
const rightOf = (c) => c.offsetLeft + c.offsetWidth;

// 펫 모드: 창을 캐릭터(말풍선·표지판·문구 포함) 크기에 맞춘다. body는 height:100%라 못 쓰고 .cell을 잰다.
// 호버로 이름표가 넓어지는 것까지 따라가도록 ResizeObserver가 부른다. 같은 값은 다시 보내지 않는다
let lastFit = "";
let observed = null;
function sendFit() {
  const cell = row.firstElementChild;
  if (!cell || !cell.classList.contains("cell")) return;
  const d = desks.find((x) => x.pid === petPid);
  const bubbleShown = !cell.querySelector(".bubble").hidden;
  const top = bubbleShown || expanded != null || d?.state === "waiting" || peek;
  // 칸 폭은 고정(가운데 축)이고 쪽지·펼친 말풍선·늘어난 이름표는 그 오른쪽으로 넘친다 → 넘칠 땐 가장 오른쪽 끝 + 그림자 여백.
  // scrollWidth는 옮긴(translate) 열까지 넣어 폭 → shiftX → 폭 되먹임이 생기므로 레이아웃 값으로 잰다
  const r = cell.getBoundingClientRect();
  const right = Math.max(...[...cell.children].map(rightOf));
  const w = Math.ceil(right > cell.clientWidth ? right + 10 : r.width);
  const h = Math.ceil(r.height);
  // 얼굴 위 끝 ~ 이름표 아래 끝 + 칸 위 padding 8 + 발밑 여백 5 = 아래로 자랄 때 창 위 끝에서 발밑까지(메인 fitBounds의 base).
  // 레이아웃 값이라 등장·끌기 transform에 안 흔들리고, 방향(body.down)과 무관하다(얼굴 바로 밑이 이름표)
  const face = cell.querySelector(".face");
  const name = cell.querySelector(".name");
  const base = name.offsetTop + name.offsetHeight - face.offsetTop + 13;
  const key = `${w}x${h}|${top}|${base}`;
  if (key === lastFit) return;
  lastFit = key;
  fitW = w;
  window.agentOffice?.fit(w, h, { top, base }).then((rm) => setRoom(rm, w));
}

// 오른쪽 끝에 걸려 창이 shiftX만큼 왼쪽으로 밀렸으면 칸의 자식을 그만큼 오른쪽으로 옮긴다(translate) → 캐릭터는 화면 제자리.
// 단 그 응답 때의 창 폭(room.w)에서 칸 여백 6을 뺀 곳 밖으로는 안 옮긴다: 쪽지·펼친 말풍선·늘어난 이름표처럼 넓은 것은 덜(4 이하) 옮겨져
// 창 왼쪽부터 놓이고, 열 폭(116) 안의 것은 전부 옮겨져 얼굴 축에 남는다.
// 얼굴(오른쪽 끝 104)은 늘 shiftX 전부: clampTo가 앵커를 작업 영역 오른쪽 - 128 안에 두므로 창 폭 - shiftX ≥ 128
function applyShift() {
  const cell = row.firstElementChild;
  if (!cell) return;
  const s = room?.shiftX ?? 0;
  const limit = Math.max(room?.w ?? 0, cell.clientWidth) - 6;
  for (const c of cell.children) {
    const dx = Math.max(0, Math.min(s, limit - rightOf(c)));
    const v = dx ? `${dx}px` : "";
    if (c.style.translate !== v) c.style.translate = v;
  }
}
// 메인의 응답(fit·drag) 또는 알림(onRoom)을 받는다. 자라는 방향을 body.down으로 따르고(끌어서 중간선을 넘기면 바로 뒤집힌다),
// 자랄 높이가 바뀌었으면 펼친 말풍선 상한을 다시 잡는다
function setRoom(r, w) {
  if (!r) return; // false: 메인이 이 창을 모른다
  const reflow = expanded != null && reach(r) !== reach(room);
  room = { ...r, w };
  document.body.classList.toggle("down", !!r.down);
  if (reflow) render();
  else applyShift();
}
const ro =
  pet && "ResizeObserver" in window ? new ResizeObserver(sendFit) : null;

// 펫 모드에서만 불린다(폴링·이벤트가 모두 펫 모드 안)
function render() {
  const now = Date.now();
  const list = visibleDesks(desks, now).filter((d) => d.pid === petPid);
  expanded = expandedAfter(expanded, list); // 세션이 사라지거나 펼칠 말풍선이 없어지면 접는다
  sync(
    row,
    list,
    (d) => d.pid,
    make,
    (n, d) => update(n, d, now),
  );

  const cell = row.firstElementChild;
  if (cell && observed !== cell) {
    observed = cell;
    ro?.observe(cell);
    for (const c of cell.children) ro?.observe(c); // 칸 폭이 고정이라 넘치는 자식(이름표·말풍선·쪽지)의 크기 변화도 따로 본다
  }
  sendFit();
  applyShift();
}

// 1초마다 자기 세션만(/api/state?pid=N) 받는다. 창이 안 보이는 동안(허브의 숨김 토글 → document.hidden)은 쉬고,
// 다시 보이면 visibilitychange가 곧바로 한 번 부른다. polling: 받는 중에 다시 불려 고리가 둘이 되지 않게
let pollTimer;
let polling = false;
async function poll() {
  clearTimeout(pollTimer);
  if (polling || document.hidden) return;
  polling = true;
  try {
    ({ desks } = await fetchState(petPid));
    offlineSince = null;
  } catch {
    offlineSince ??= Date.now();
  }
  polling = false;
  render();
  pollTimer = setTimeout(poll, 1000);
}

let msgTimer;
async function focusDesk(cell, pid) {
  const msg = await requestFocus(pid);
  const m = cell.querySelector(".msg");
  setText(m, msg ?? "");
  m.hidden = !msg;
  clearTimeout(msgTimer);
  if (msg)
    msgTimer = setTimeout(() => {
      m.hidden = true;
      render(); // 펫 모드: 문구가 사라지면 창도 줄인다
    }, 4000);
  render();
}
const toggleExpand = (pid) => {
  expanded = expanded === pid ? null : pid;
  render();
};

// 한 번 클릭은 말풍선 펼침·접힘만. 얼굴·이름표는 아무 일도 하지 않는다(끌기·더블클릭과 섞이지 않게).
// 링크(펼친 말풍선·쪽지)는 기본 브라우저로 열릴 뿐 말풍선을 접지 않는다
document.addEventListener("click", (e) => {
  if (e.target.closest("a")) return;
  const a = e.target.closest("[data-action]");
  if (a?.dataset.action === "bubble" && a.dataset.static === undefined)
    toggleExpand(Number(a.dataset.pid));
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && expanded != null) {
    expanded = null;
    render();
  }
});

// ── 펫 모드: 끌기·더블클릭·우클릭 ──
if (pet) {
  const grabbable = (t) => t.closest?.(".face, .name");
  const cellOf = () => row.firstElementChild;
  // 쪽지: 창 = 캐릭터라 창에 들어온 것이 곧 올려둔 것. 스쳐 지나갈 땐 안 뜨게 0.15초, 누르면(끌기·메뉴) 접는다
  let peekTimer;
  const setPeek = (on) => {
    clearTimeout(peekTimer);
    if (peek === on) return;
    peek = on;
    render();
  };
  const root = document.documentElement;
  root.addEventListener("mouseenter", () => {
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => setPeek(true), 150);
  });
  root.addEventListener("mouseleave", () => setPeek(false));
  // 쪽지의 링크를 누를 땐 쪽지를 접지 않는다(접으면 클릭이 링크에 닿지 않는다)
  document.addEventListener(
    "mousedown",
    (e) => e.target.closest?.("a") || setPeek(false),
    true,
  );
  // 얼굴·이름표 끌기. 창이 오른쪽 끝에 걸려 밀린 상태(shiftX)나 아래로 자라는 창(footY)에서 잡아도 앵커 기준으로 바꿔 튀지 않는다
  draggable({
    canStart: (e) => grabbable(e.target),
    shiftX: () => room?.shiftX ?? 0,
    footY: () => room?.footY ?? innerHeight,
    onStart: () => cellOf()?.classList.add("dragging"), // 들림 + 둥둥 정지 + 그림자 옅게
    onEnd: () => cellOf()?.classList.remove("dragging"),
    onRoom: (r) => setRoom(r, fitW),
  });
  // 메인이 스스로 창을 옮겼을 때(허브 정렬·디스플레이 변경)
  window.agentOffice?.onRoom((r) => setRoom(r, fitW));
  document.addEventListener("dblclick", (e) => {
    const t = grabbable(e.target);
    if (!t) return;
    const cell = t.closest(".cell");
    cell.classList.add("hop"); // 폴짝 2프레임
    setTimeout(() => cell.classList.remove("hop"), 320);
    focusDesk(cell, petPid);
  });
  document.addEventListener("contextmenu", async (e) => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    e.preventDefault();
    const d = desks.find((x) => x.pid === petPid);
    cell.classList.add("menu"); // 이름표 반전 유지: 메뉴가 어느 캐릭터 것인지
    const r =
      (await window.agentOffice?.menu(petPid, {
        canExpand: !!d && canExpand(d),
        expanded: expanded === petPid,
        copy: d ? d.full || bubbleText(d) : null, // "응답 복사": 전문, 없으면 보이는 말풍선 글
      })) ?? {};
    cell.classList.remove("menu");
    if (r.focus) focusDesk(cell, petPid);
    if ("expand" in r) {
      expanded = r.expand ? petPid : null;
      render();
    }
  });
}

// 탭이 가려지거나 움직임 줄이기면 둥둥을 멈춘다
const still = matchMedia("(prefers-reduced-motion: reduce)");
const setStill = () =>
  bar.classList.toggle("still", still.matches || document.hidden);
still.addEventListener("change", setStill);
document.addEventListener("visibilitychange", setStill);
setStill();
if (pet) {
  addEventListener("resize", render);
  document.addEventListener("visibilitychange", () => document.hidden || poll());
  poll();
}
