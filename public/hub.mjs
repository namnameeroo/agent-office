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

// 끌기 안내(T67, T63의 호버 안내를 바꿈): 허브를 끌기 시작하면 판 위 쪽지 — 지금 무엇을 옮기는 중인지 + 다른 방법. 놓으면 숨김.
// 쪽지 자리는 늘 차지하고 visibility만 바꾼다 → 끌기 시작에 창 크기가 안 바뀐다(T62와 같은 이유: 창 크기와 새 프레임이 따로 반영돼 깜빡임).
// 그래서 창이 판보다 크고, 판 밖(쪽지 자리·그림자 여백)은 클릭을 뒤 창으로 통과시킨다(pet:hit). 끄는 동안은 통과하지 않는다(놓기를 잃지 않게)
// ponytail: 쪽지는 늘 판 위 — 허브를 화면 맨 위에 두면 쪽지 자리만큼 아래로 밀린다. 그런 배치가 잦으면 위쪽 절반에선 판 아래로
const hint = el("div", "hint");
hint.setAttribute("aria-hidden", "true");
// 두 줄을 처음부터 채워 둔다(빈 줄은 높이 0이라 처음 보일 때 창이 자란다). 모드는 끌기 시작 때 ⌥로 정해진다(메인 hubDrag와 같은 시점)
const hintNow = el("div", "now", "캐릭터도 함께 옮기는 중");
const hintAlt = el("div", "alt", "⌥ 누른 채 끌면 허브만");
hint.append(hintNow, hintAlt);
const stack = el("div", "stack");
stack.append(hint, hub);
row.replaceChildren(stack);

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

// 끌기: 판 어디서나. 끌었으면 뒤따르는 click은 무시한다. 끄는 동안은 안내 쪽지를 보이고 클릭 통과를 끈다
let dragged = false;
let dragging = false;
draggable({
  canStart: (e) => hub.contains(e.target),
  onStart: (e) => {
    dragging = true;
    const alone = !!e?.altKey;
    hintNow.textContent = alone ? "허브만 옮기는 중" : "캐릭터도 함께 옮기는 중";
    hintAlt.textContent = alone ? "⌥ 없이 끌면 캐릭터도 함께" : "⌥ 누른 채 끌면 허브만";
    hint.classList.add("on");
    hub.classList.add("dragging");
  },
  onEnd: (moved) => {
    dragging = false;
    if (moved) dragged = true;
    hint.classList.remove("on");
    hub.classList.remove("dragging");
  },
});

// 포인터가 판 위인가(창 기준). 바뀔 때만 메인에 알린다(밖이면 클릭 통과, 움직임은 계속 받는다). 끄는 동안은 늘 받는다
let over = false;
function setOver(on) {
  if (on === over) return;
  over = on;
  window.agentOffice?.hit(on);
}
document.addEventListener("mousemove", (e) => {
  const r = hub.getBoundingClientRect();
  setOver(dragging || (e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom));
});
document.addEventListener("mouseleave", () => {
  if (!dragging) setOver(false);
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

// 창 크기를 판 + 쪽지 자리에 맞춘다(캐릭터 창과 같은 fit). 쪽지는 자리를 늘 차지해 끌기 시작으로는 안 바뀐다
let lastFit = "";
const sendFit = () => {
  const r = stack.getBoundingClientRect();
  const w = Math.ceil(r.width) + 12; // 그림자 여백(margin 6)
  const h = Math.ceil(r.height) + 12;
  const key = `${w}x${h}`;
  if (key === lastFit) return;
  lastFit = key;
  window.agentOffice?.fit(w, h, {});
};
new ResizeObserver(sendFit).observe(stack);
sendFit();
