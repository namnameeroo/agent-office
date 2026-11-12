// 화면 진입점: 1초마다 /api/state를 받아 화면을 맞춘다. 건물 움직임은 8fps로 canvas만 다시 칠한다
import { setText, setAttr } from "./dom.mjs";
import { hms } from "./common.mjs";
import { fetchState, requestFocus } from "./api.mjs";
import { renderTower, renderBasement, paintTower, knobsSvg } from "./tower.mjs";
import { renderSide, renderDetail } from "./panels.mjs";
import { tourState, startTour } from "./tour.mjs";

// /?tour = 튜토리얼(T48): 서버 대신 예시 사무실을 그리고, 실제 화면의 기억(저장)과 터미널은 건드리지 않는다.
// 끝내면 새로고침 없이 실제 사무실로 바뀐다(leaveTour, T51)
let touring = new URLSearchParams(location.search).has("tour");
let demo = touring ? tourState(Date.now()) : null; // 한 번만 만들어 시간이 흐르게 둔다

// area: "localStorage"(브라우저에 남음) 또는 "sessionStorage"(같은 탭의 새로고침에만 남음)
const load = (k, area = "localStorage") => {
  try {
    return window[area].getItem(`ao-${k}`);
  } catch {
    return null;
  }
};
const save = (k, v, area = "localStorage") => {
  if (touring) return;
  try {
    window[area].setItem(`ao-${k}`, v);
  } catch {
    // 저장소를 못 쓰면 이번 탭에서만 기억한다
  }
};
// 마지막으로 본 시점 = 탭이 가려진 순간. 새로고침해도 유지한다(ADR 0002 #14).
// 새로고침이면 sessionStorage에 넘긴 값, 탭을 새로 열었으면 닫은 시각(localStorage)
const loadSeenAt = () =>
  Number(load("seenAt", "sessionStorage")) ||
  Number(load("seenAt")) ||
  Date.now();

const state = {
  desks: [],
  gone: [],
  events: [],
  lastEventAt: null,
  sel: null,
  pick: null, // 펼친 집계 칸
  baseOpen: null, // null이면 자동: 건물에 일하는 팀이 없을 때만 펼친다
  folded: load("fold") === "1",
  night: load("night") === "1",
  seenAt: loadSeenAt(),
  offlineSince: null, // 마지막 요청이 실패한 뒤로 null이 아니다
  lastOk: null, // 마지막으로 받은 시각
};
let started = touring; // 튜토리얼은 단계마다 고를 팀을 정한다
let afterRender = null; // 튜토리얼 spotlight가 그릴 때마다 위치를 다시 잰다

const find = (pid) =>
  state.desks.find((d) => d.pid === pid) ??
  state.gone.find((d) => d.pid === pid);
const lastMove = (d) =>
  Math.max(d.since ?? 0, ...d.activity.map((a) => a.at || 0));

function render() {
  const now = Date.now();
  // 하단 접힘을 건물보다 먼저 반영한다. 건물은 남은 높이를 보고 배율을 고른다
  document.body.classList.toggle("fold", state.folded);
  document.body.dataset.palette = state.night ? "night" : "day";
  const nb = document.getElementById("night-btn");
  setAttr(nb, "aria-checked", String(state.night));
  setAttr(
    nb,
    "title",
    state.night ? "낮으로 바꾸기 (N 키)" : "밤으로 바꾸기 (N 키)",
  );
  const off = document.getElementById("offline");
  off.hidden = !state.offlineSince;
  if (state.offlineSince)
    setText(
      off,
      `연결 끊김 · 마지막 갱신 ${state.lastOk ? hms(state.lastOk) : "없음"}`,
    );
  const view = { ...state, now };
  renderBasement(document.getElementById("basement"), view);
  renderTower(document.getElementById("floors"), view);
  renderSide(document.getElementById("side"), view);
  renderDetail(document.getElementById("detail"), view);
  const w = state.desks.filter((d) => d.state === "waiting").length;
  document.title = `Agent Office${w ? ` [${w}]` : ""}`; // 기다리는 팀장 수는 뒤에 [N] [사용자 2026-11-10]
  afterRender?.();
}

async function poll() {
  try {
    const { desks, gone, events, lastEventAt } = demo ?? (await fetchState());
    Object.assign(state, { desks, gone, events, lastEventAt });
    state.offlineSince = null;
    state.lastOk = Date.now();
    // 처음 열 때는 가장 최근에 움직인 팀을 고른다. 그 뒤로는 누른 선택을 유지한다(§3.3)
    if (!started) {
      started = true;
      state.sel =
        [...desks].sort((a, b) => lastMove(b) - lastMove(a))[0]?.pid ?? null;
    }
    // 고른 팀이 퇴근했으면 gone에서 찾고, 거기에도 없으면 선택을 비운다
    if (state.sel != null && !find(state.sel)) state.sel = null;
  } catch {
    // 마지막 데이터를 그대로 두고 머리에 연결 끊김을 띄운다
    state.offlineSince ??= Date.now();
  }
  render();
  pollTimer = setTimeout(poll, 1000);
}
let pollTimer;

// 튜토리얼 끝(T51): 새로고침 없이 그 자리에서 실제 사무실로. 실제 화면의 기억을 다시 읽고,
// 예시 데이터를 비운 뒤 서버 데이터를 바로 받아 그린다(실패하면 연결 끊김 상태로)
async function leaveTour() {
  touring = false;
  demo = null;
  afterRender = null;
  started = false;
  history.replaceState(null, "", "/");
  Object.assign(state, {
    desks: [],
    gone: [],
    events: [],
    lastEventAt: null,
    sel: null,
    pick: null,
    baseOpen: null,
    folded: load("fold") === "1",
    night: load("night") === "1",
    seenAt: loadSeenAt(),
    offlineSince: null,
    lastOk: null,
  });
  clearTimeout(pollTimer);
  await poll();
}

// 칠판 → 그 세션의 터미널(ADR 0003). 되면 터미널이 앞으로 오니 따로 알리지 않고,
// 실패하거나 앱만 앞으로 가져왔을 때만 머리줄에 이유를 4초 띄운다
let msgTimer;
async function focusTerminal(pid) {
  if (touring) return; // 예시 사무실의 pid는 진짜 터미널이 아니다
  const msg = await requestFocus(pid);
  const m = document.getElementById("focus-msg");
  m.textContent = msg ?? "";
  m.hidden = !msg;
  clearTimeout(msgTimer);
  if (msg) msgTimer = setTimeout(() => (m.hidden = true), 4000);
}

function toggleNight() {
  state.night = !state.night;
  save("night", state.night ? "1" : "0");
  render();
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-action]");
  if (a) {
    const act = a.dataset.action;
    if (act === "focus") return void focusTerminal(Number(a.dataset.pid));
    if (act === "pick")
      state.pick = state.pick === a.dataset.state ? null : a.dataset.state;
    if (act === "base")
      state.baseOpen = !(
        state.baseOpen ?? !state.desks.some((d) => d.state !== "dormant")
      );
    if (act === "fold") {
      state.folded = !state.folded;
      save("fold", state.folded ? "1" : "0");
    }
    if (act === "night") return toggleNight();
    if (act === "mini") return void window.agentOffice?.openMini();
    return render();
  }
  const b = e.target.closest("[data-pid]");
  if (!b) return;
  const jump = !!b.closest("#log, #pick");
  state.sel = Number(b.dataset.pid);
  if (find(state.sel)?.state === "dormant") state.baseOpen = true;
  render();
  // 로그·목록에서 고르면 그 팀의 자리로 이동한다
  if (jump)
    document
      .querySelector(
        `#floors [data-key="room:${state.sel}"], #basement .brows > [data-key="${state.sel}"]`,
      )
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
});
document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, textarea, [contenteditable]")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key.toLowerCase() === "n") toggleNight();
});

// 탭이 가려지는 순간을 "여기까지 봄"으로 저장한다
let beforeHide = null; // 이번에 가려지기 직전의 seenAt
const markSeen = () => {
  if (touring) return; // 예시 사무실의 "여기까지 봄"은 고정이다
  beforeHide ??= state.seenAt;
  state.seenAt = Date.now();
  save("seenAt", String(state.seenAt));
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) markSeen();
  else {
    beforeHide = null;
    render();
  }
});
// 새로고침과 탭 닫기는 둘 다 pagehide라 구분할 수 없다. 닫기를 위해 지금 시각을 저장하되,
// 가려지기 직전 값을 같은 탭에만 남는 sessionStorage로 넘겨 새로고침이면 그 값을 쓴다
addEventListener("pagehide", () => {
  markSeen();
  save("seenAt", String(beforeHide), "sessionStorage");
});

// ponytail: rAF 대신 8fps 타이머. 탭이 가려지거나 움직임 줄이기 설정이면 쉰다
const still = matchMedia("(prefers-reduced-motion: reduce)");
setInterval(() => {
  if (!still.matches && !document.hidden) paintTower(performance.now());
}, 125);
addEventListener("resize", render);
// 낮·밤 스위치 손잡이(해·달 그림)는 한 번만 넣는다. 어느 쪽을 보일지는 CSS가 팔레트로 고른다
document.querySelector("#night-btn .knob").innerHTML = knobsSvg();
// 미니 모드 버튼은 데스크탑 앱(preload가 agentOffice를 노출)에서만 보인다
document.getElementById("mini-btn").hidden = !window.agentOffice;
if (touring) afterRender = startTour(state, render, leaveTour);
poll();
