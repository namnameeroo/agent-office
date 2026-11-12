// 본부(허브) 창(/mini?hub=1, Electron 전용): 작은 벤토 타일 하나. 왼쪽 타워(52px, 26px 맵의 2배) = 큰 사무실, 가운데 아이콘 둘 = ↑ 위 정렬 · ↓ 아래 정렬
// (토글이 아니다 — 누를 때마다 그 쪽으로 다시 줄 세운다), 세로 타일 = 새 터미널 · 캐릭터 한꺼번에 숨김/보임(숨긴 동안 나를 기다리는 수를 빨간 배지로).
// 판 어디를 잡아도 끌린다(4px 넘게 움직이면 끌기, 안 움직이고 놓으면 그 타일의 동작). 자리는 캐릭터 창과 같은 IPC로 기억한다.
import { el } from "./dom.mjs";
import { towerSvg } from "./mini-sprites.mjs";
import { fetchState } from "./api.mjs";
import { draggable } from "./drag.mjs";

const ICON = {
  // 정렬: 흩어진 점 셋이 바닥 한 줄로 → 아래 화살표 + 바닥선 위 점 셋
  arrange:
    '<svg viewBox="0 0 12 12" width="16" height="16" aria-hidden="true"><path d="M6 1v5M3.5 4 6 6.5 8.5 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="2.5" cy="9.5" r="1.1" fill="currentColor"/><circle cx="6" cy="9.5" r="1.1" fill="currentColor"/><circle cx="9.5" cy="9.5" r="1.1" fill="currentColor"/></svg>',
  // 위 정렬: 정렬 아이콘을 위아래로 뒤집은 것 → 위 화살표 + 천장선 아래 점 셋
  arrangeTop:
    '<svg viewBox="0 0 12 12" width="16" height="16" aria-hidden="true"><path d="M6 11V6M3.5 8 6 5.5 8.5 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="2.5" cy="2.5" r="1.1" fill="currentColor"/><circle cx="6" cy="2.5" r="1.1" fill="currentColor"/><circle cx="9.5" cy="2.5" r="1.1" fill="currentColor"/></svg>',
  // 터미널: >_
  terminal:
    '<svg viewBox="0 0 12 12" width="16" height="16" aria-hidden="true"><path d="M2 3 5.5 6 2 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 9.5h3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  // 눈: 캐릭터가 보이는 중(누르면 숨김)
  eye: '<svg viewBox="0 0 12 12" width="16" height="16" aria-hidden="true"><path d="M1 6c1.4-2.4 3-3.5 5-3.5S9.6 3.6 11 6c-1.4 2.4-3 3.5-5 3.5S2.4 8.4 1 6Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="6" cy="6" r="1.5" fill="currentColor"/></svg>',
  // 빗금 친 눈: 숨긴 중(누르면 다시 보임)
  eyeOff:
    '<svg viewBox="0 0 12 12" width="16" height="16" aria-hidden="true"><path d="M1 6c1.4-2.4 3-3.5 5-3.5S9.6 3.6 11 6c-1.4 2.4-3 3.5-5 3.5S2.4 8.4 1 6Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" opacity="0.55"/><path d="M2 10.5 10 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
};

const row = document.getElementById("row");
const hub = el("div", "hub");
const tile = (act, title, html, cls) => {
  const b = el("button", `tile ${cls}`);
  b.type = "button";
  b.dataset.act = act;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.innerHTML = html;
  return b;
};
const side = el("div", "side");
side.append(
  tile("arrange-top", "캐릭터를 화면 위 한 줄로", ICON.arrangeTop, "icon"),
  tile("arrange", "캐릭터를 화면 아래 한 줄로", ICON.arrange, "icon"),
);
const terminal = tile("terminal", "새 Ghostty 창", ICON.terminal, "icon tall");
// 숨김 토글: 세로 타일(32×52). 아이콘 + 숨긴 동안의 기다림 배지
const SHOWN = "캐릭터 모두 숨기기";
const HIDDEN = "캐릭터 다시 보이기";
const pets = tile("pets", SHOWN, "", "icon tall");
const eye = el("span", "eye");
eye.innerHTML = ICON.eye;
const badge = el("span", "badge");
badge.hidden = true;
pets.append(eye, badge);
pets.setAttribute("aria-pressed", "false");
hub.append(tile("office", "큰 사무실 열기", towerSvg(52), "tower"), side, terminal, pets);
row.replaceChildren(hub);

// 숨긴 동안에만 2초마다 상태를 물어, 나를 기다리는 세션 수를 배지로 보인다(캐릭터가 안 보여도 놓치지 않게)
let hidden = false;
let waitTimer = null;
async function pollWaiting() {
  try {
    const n = (await fetchState()).counts?.waiting ?? 0;
    badge.textContent = String(n);
    badge.hidden = !hidden || n === 0;
    pets.setAttribute("aria-label", n ? `${HIDDEN} · 기다림 ${n}` : HIDDEN);
  } catch {
    // 서버가 잠깐 안 받으면 마지막 표시를 둔다
  }
}
function setHidden(on) {
  hidden = on;
  eye.innerHTML = on ? ICON.eyeOff : ICON.eye;
  pets.title = on ? HIDDEN : SHOWN;
  pets.setAttribute("aria-label", pets.title);
  pets.setAttribute("aria-pressed", String(on));
  clearInterval(waitTimer);
  badge.hidden = true;
  if (on) {
    pollWaiting();
    waitTimer = setInterval(pollWaiting, 2000);
  }
}

// 끌기: 판 어디서나. 끌었으면 뒤따르는 click은 무시한다
let dragged = false;
draggable({
  canStart: (e) => hub.contains(e.target),
  onStart: () => hub.classList.add("dragging"),
  onEnd: (moved) => {
    if (moved) dragged = true;
    hub.classList.remove("dragging");
  },
});

hub.addEventListener("click", async (e) => {
  if (dragged) {
    dragged = false;
    return;
  }
  const b = e.target.closest("button.tile");
  const api = window.agentOffice;
  if (!b || !api) return;
  b.disabled = true;
  try {
    if (b.dataset.act === "office") await api.openOffice();
    if (b.dataset.act === "arrange") await api.arrange();
    if (b.dataset.act === "arrange-top") await api.arrange("top");
    if (b.dataset.act === "terminal") await api.newTerminal();
    if (b.dataset.act === "pets") setHidden(await api.togglePets());
  } finally {
    b.disabled = false;
  }
});

// 창 크기를 판에 맞춘다(캐릭터 창과 같은 fit)
let lastFit = "";
const sendFit = () => {
  const r = hub.getBoundingClientRect();
  const w = Math.ceil(r.width) + 12; // 그림자 여백(margin 6)
  const h = Math.ceil(r.height) + 12;
  const key = `${w}x${h}`;
  if (key === lastFit) return;
  lastFit = key;
  window.agentOffice?.fit(w, h, {});
};
new ResizeObserver(sendFit).observe(hub);
sendFit();
