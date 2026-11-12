// 미니 모드 화면. 저장(localStorage)은 하지 않는다. 두 모드:
// - 펫 모드(/mini?pid=N, Electron, ADR 0006 · 설계 v2): 투명 창에 캐릭터 하나. 얼굴·이름표 끌기 = 이동, 더블클릭 = 터미널, 우클릭 = 메뉴
// - 띠 모드(/mini, 브라우저 미리보기): 세션 전부를 한 줄로. 얼굴 클릭 = 터미널, ▲ = "/"
import { el, sync, setText, setAttr } from "./dom.mjs";
import { hms } from "./common.mjs";
import { fetchState, requestFocus } from "./api.mjs";
import {
  visibleDesks,
  avatarState,
  elapsedText,
  waitLevel,
  chickCount,
  bubbleText,
  canExpand,
  overflowCount,
  expandedAfter,
  signText,
  peekLines,
  elapsedShort,
  whereShort,
} from "./mini-model.mjs";
import { avatarSvg } from "./mini-sprites.mjs";

const PARAMS = new URLSearchParams(location.search);
// 본부(허브) 창(/mini?hub=1): 캐릭터 대신 타워 엠블럼 + 바로가기. 폴링·캐릭터 렌더는 하지 않는다
const HUB = PARAMS.has("hub");
if (HUB) {
  document.documentElement.classList.add("hub");
  document.body.classList.add("hub");
  import("./hub.mjs");
}
const PET = PARAMS.get("pid");
const petPid = PET ? Number(PET) : null;
const pet = petPid != null;
document.documentElement.classList.toggle("pet", pet);
document.body.classList.toggle("pet", pet);

const bar = document.getElementById("bar");
const row = document.getElementById("row");
const status = document.getElementById("status");

let desks = [];
let expanded = null; // 펼친 말풍선의 pid
let peek = false; // 펫 모드: 잠깐(0.15초) 올려두면 쪽지(위치·요청·지금·링크)를 편다
let offlineSince = null;
let lastOk = null;

function make(d) {
  const cell = el("div", "cell");
  cell.setAttribute("role", "listitem");
  const msg = el("div", "msg");
  msg.hidden = true;
  const bubble = el("button", "bubble");
  bubble.type = "button";
  bubble.dataset.action = "bubble";
  // 표지판 "! 승인": 기다릴 때만(펫 모드), 왜 기다리는지. 얼마나는 이름표 끝의 .wait
  const sign = el("div", "sign");
  sign.hidden = true;
  sign.append(el("b", null, "!"), el("span", "why"));
  const face = el("button", "face");
  face.type = "button";
  face.dataset.action = "focus";
  const name = el("div", "name");
  name.dataset.action = "focus";
  name.append(el("i", "dot"), el("span", "title"), el("span", "wait"));
  cell.append(msg, bubble, sign, face, name);
  if (pet) {
    const pk = el("dl", "peek");
    pk.hidden = true;
    msg.after(pk);
    name.append(el("span", "where")); // 이름표 둘째 줄: 어디서 도는 세션인지
    // 등장: 3프레임 낙하(CSS .enter). 끝나면 떼서 다시 안 돌게
    cell.classList.add("enter");
    setTimeout(() => cell.classList.remove("enter"), 400);
  }
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
  setAttr(cell, "data-state", st === "alert" ? "waiting" : st);
  face.dataset.pid = d.pid;
  setAttr(face, "aria-label", `${d.title} 터미널로`);
  const name = cell.querySelector(".name");
  name.dataset.pid = d.pid;
  setText(name.querySelector(".title"), d.title);
  const wait = name.querySelector(".wait");
  const sign = cell.querySelector(".sign");
  if (d.state === "waiting") {
    const ms = now - d.since;
    const level = String(waitLevel(ms));
    setAttr(name, "data-level", level); // 띠 모드: 이름·경과 색이 5분·15분에 세진다
    setAttr(cell, "data-level", level); // 펫 모드: 5분부터 이름표 빨강, 15분부터 표지판 깜빡임
    setText(sign.querySelector(".why"), signText(d));
    sign.hidden = !pet;
  } else {
    name.removeAttribute("data-level");
    cell.removeAttribute("data-level");
    sign.hidden = true;
  }
  // 경과: 띠 모드는 기다릴 때만, 펫 모드는 늘(이 상태로 얼마나 — 오래 도는 작업·방금 끝난 일을 가린다)
  const ms = now - d.since;
  setText(
    wait,
    pet ? elapsedShort(ms) : d.state === "waiting" ? elapsedText(ms) : "",
  );
  const where = name.querySelector(".where");
  if (where) setText(where, whereShort(d));
  const pk = cell.querySelector(".peek");
  if (pk) {
    const lines = peek && !open ? peekLines(d) : [];
    const sig = JSON.stringify(lines);
    if (pk.dataset.sig !== sig) {
      pk.dataset.sig = sig;
      pk.replaceChildren(
        ...lines.flatMap(([k, v]) => [el("dt", null, k), el("dd", null, v)]),
      );
    }
    pk.hidden = !lines.length;
  }
  const bubble = cell.querySelector(".bubble");
  const text = open ? d.full : bubbleText(d);
  bubble.hidden = text == null;
  setText(bubble, text ?? "");
  bubble.dataset.pid = d.pid;
  if (canExpand(d)) delete bubble.dataset.static;
  else bubble.dataset.static = "";
  if (open) {
    bubble.dataset.open = "";
    cell.dataset.open = "";
    // 창 상한(작업 영역 60%, pets.mjs fitBounds)에서 말풍선 밖의 높이(얼굴·이름표·여백)를 잰 만큼 뺀다.
    // 상수(70)였을 땐 모습이 바뀌며 어긋나, 긴 응답을 펼치면 내용물이 창보다 커져 캐릭터가 창 아래로 밀렸다. 100vh는 지금 창 높이라 쓸 수 없다
    const rest =
      cell.getBoundingClientRect().height -
      bubble.getBoundingClientRect().height;
    bubble.style.maxHeight = `${Math.floor(screen.availHeight * 0.6) - Math.ceil(rest) - 1}px`;
  } else {
    delete bubble.dataset.open;
    delete cell.dataset.open;
    bubble.style.maxHeight = "";
  }
  if (pet) cell.classList.toggle("offline", offlineSince != null);
}

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
  // 칸 폭은 고정(가운데 축)이고 쪽지·펼친 말풍선·늘어난 이름표는 그 오른쪽으로 넘친다 → 넘칠 땐 scrollWidth + 그림자 여백
  const r = cell.getBoundingClientRect();
  const w = Math.ceil(
    cell.scrollWidth > cell.clientWidth ? cell.scrollWidth + 10 : r.width,
  );
  const h = Math.ceil(r.height);
  const key = `${w}x${h}|${top}`;
  if (key === lastFit) return;
  lastFit = key;
  window.agentOffice?.fit(w, h, { top });
}
const ro =
  pet && "ResizeObserver" in window ? new ResizeObserver(sendFit) : null;

function render() {
  const now = Date.now();
  let list = visibleDesks(desks, now);
  if (pet) list = list.filter((d) => d.pid === petPid);
  expanded = expandedAfter(expanded, list); // 세션이 사라지거나 펼칠 말풍선이 없어지면 접는다
  sync(
    row,
    list,
    (d) => d.pid,
    make,
    (n, d) => update(n, d, now),
  );
  document.body.classList.toggle("offline", offlineSince != null);

  if (pet) {
    const cell = row.firstElementChild;
    if (cell && observed !== cell) {
      observed = cell;
      ro?.observe(cell);
      for (const c of cell.children) ro?.observe(c); // 칸 폭이 고정이라 넘치는 자식(이름표·말풍선·쪽지)의 크기 변화도 따로 본다
    }
    sendFit();
    return;
  }

  let empty = row.querySelector(".empty");
  if (!list.length && !empty)
    row.prepend(el("div", "empty", "떠 있는 Claude Code 터미널이 없다"));
  else if (list.length && empty) empty.remove();

  const parts = [];
  if (offlineSince != null)
    parts.push(`연결 끊김 · ${lastOk ? hms(lastOk) : "--:--:--"}`);
  const over = overflowCount(list.length, row.clientWidth);
  if (over > 0) parts.push(`+${over}`);
  setText(status, parts.join(" · "));
  bar.classList.toggle("offline", offlineSince != null);
}

async function poll() {
  try {
    ({ desks } = await fetchState());
    offlineSince = null;
    lastOk = Date.now();
  } catch {
    offlineSince ??= Date.now();
  }
  render();
  setTimeout(poll, 1000);
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

document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-action]");
  if (!a) {
    if (!pet && expanded != null) {
      expanded = null;
      render();
    }
    return;
  }
  const pid = Number(a.dataset.pid);
  // 펫 모드에서 한 번 클릭은 아무 일도 하지 않는다(끌기·더블클릭과 섞이지 않게)
  if (a.dataset.action === "focus" && !pet)
    return void focusDesk(a.closest(".cell"), pid);
  if (a.dataset.action === "bubble" && a.dataset.static === undefined)
    toggleExpand(pid);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && expanded != null) {
    expanded = null;
    render();
  }
});
document.getElementById("open").addEventListener("click", () => {
  if (window.agentOffice) window.agentOffice.openOffice();
  else location.href = "/";
});

// ── 펫 모드: 끌기·더블클릭·우클릭 ──
if (pet) {
  let drag = null; // { gx, gyb(창 왼쪽·아래 기준으로 잡은 점), sx, sy, moved }
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
  document.addEventListener("mousedown", () => setPeek(false), true);
  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !grabbable(e.target)) return;
    drag = {
      gx: e.clientX,
      gyb: innerHeight - e.clientY, // 창 아래 기준(끌던 중 창 높이가 바뀌어도 어긋나지 않게)
      sx: e.screenX,
      sy: e.screenY,
      moved: false,
    };
  });
  document.addEventListener("mousemove", (e) => {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.abs(e.screenX - drag.sx) + Math.abs(e.screenY - drag.sy) <= 4)
        return;
      drag.moved = true;
      cellOf()?.classList.add("dragging"); // 들림 + 둥둥 정지 + 그림자 옅게
    }
    window.agentOffice?.dragTo(e.screenX - drag.gx, e.screenY + drag.gyb);
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) window.agentOffice?.dragEnd();
    drag = null;
    cellOf()?.classList.remove("dragging");
  };
  document.addEventListener("mouseup", endDrag);
  document.addEventListener("mouseleave", endDrag);
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
if (!HUB) {
  addEventListener("resize", render);
  poll();
}
