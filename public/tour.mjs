// 튜토리얼(T48, 스펙 docs/superpowers/specs/2026-10-29-tutorial.md): /?tour로 열면 예시 사무실을 실제 렌더러로 그리고
// spotlight로 7단계를 짚는다. 예시 데이터(tourState)는 node 테스트가 불러가므로 이 파일은 불러올 때 DOM을 만지지 않는다
import { el } from "./dom.mjs";

const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const FABLE = "claude-fable-5-1";
const OPUS = "claude-opus-5-5";

export const TOUR_PID = { lead: 41001, wait: 41002, fresh: 41003, api: 41004 };
// 이 시각 뒤의 로그가 "여기까지 봄" 아래(새 로그)로 보인다
export const TOUR_SEEN_MS = 30 * MIN;
// 끝내기 소등(T51): 어두워지고 밝아지는 시간(style.css .tour-curtain transition과 같다),
// 이동 문구를 적어도 보이는 시간, 실제 데이터 배지를 남기는 시간
const FADE_MS = 150;
const HOLD_MS = 500;
const LIVE_MS = 4000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 튜토리얼을 끝내고 실제 사무실에 왔을 때 배지. 예시는 꽉 차 있어도 실제는 비어 있을 수 있어 실제 터미널 수를 말한다
export function liveBadge({ desks, offlineSince }) {
  if (offlineSince) return "● 실제 화면 · 서버에 닿지 못했다";
  if (!desks.length)
    return "● 실제 데이터 · 아직 떠 있는 터미널 없음 — claude를 실행하면 방이 생긴다";
  return `● 실제 데이터 · 터미널 ${desks.length}개`;
}

// 예시 사무실 = /api/state와 같은 모양(test/tour.test.mjs가 실제 수집 경로로 만든 모양과 비교한다).
// 시각은 now 기준 상대값이라 언제 열어도 경과가 맞다
export function tourState(now) {
  const ago = (ms) => now - ms;
  const desk = (o) => ({
    pid: o.pid,
    sessionId: `tour-${o.pid}`,
    cwd: `/Users/me/code/${o.zone}`,
    zone: o.zone,
    worktree: null,
    title: o.title,
    branch: o.branch ?? "main",
    state: o.state,
    reason: o.reason ?? null,
    rawStatus: null,
    background: false,
    since: ago(o.since),
    staleDays: o.staleDays ?? null,
    bubble: o.bubble ?? null,
    doing: o.doing ?? null,
    said: o.said ?? null,
    full: o.full ?? null,
    model: o.model ?? OPUS,
    lastEventAt: ago(o.last ?? o.since),
    talk: (o.talk ?? []).map(([ms, text]) => ({ at: ago(ms), text })),
    lastPrompt: o.lastPrompt ?? null,
    sessionStart: ago(o.started ?? 3 * HOUR),
    activity: (o.activity ?? []).map(([ms, verb, detail]) => ({
      at: ago(ms),
      verb,
      detail,
      failed: false,
    })),
    team: o.team ?? [],
    links: o.links ?? [],
  });
  const duck = (name, bubble, doing, last, model) => ({
    name,
    agentType: "general-purpose",
    working: true,
    bubble,
    doing,
    endedAt: null,
    lastEventAt: ago(last),
    model,
  });

  const desks = [
    desk({
      pid: TOUR_PID.lead,
      zone: "shop-web",
      title: "쿠폰 중복 적용 버그",
      branch: "fix/SHOP-128-coupon",
      state: "working",
      since: 8 * MIN,
      last: 10e3,
      model: FABLE,
      bubble: "npm test -- coupon 실행 중",
      doing: "실행 npm t…",
      said: "원인을 찾았습니다. 할인 계산이 두 군데에서 돌고 있어 한 곳으로 모으겠습니다.",
      talk: [
        [
          MIN,
          "원인을 찾았습니다. 할인 계산이 두 군데에서 돌고 있어 한 곳으로 모으겠습니다.",
        ],
        [
          4 * MIN,
          "재현 테스트를 먼저 썼고, 지금 코드에서 실패하는 것을 확인했습니다.",
        ],
        [7 * MIN, "쿠폰 적용 경로를 팀원 둘에게 나눠 조사시키겠습니다."],
      ],
      lastPrompt: "쿠폰이 두 번 적용되는 버그 고쳐줘. 재현 테스트부터.",
      activity: [
        [10e3, "실행", "npm test -- coupon"],
        [50e3, "수정", "src/cart/discount.ts"],
        [2 * MIN, "생각", ""],
      ],
      team: [
        duck(
          "결제 호출 경로 조사",
          "checkout.ts 읽는 중",
          "읽기 check…",
          20e3,
          FABLE,
        ),
        duck(
          "쿠폰 경계값 테스트 작성",
          "만료 직전 쿠폰 테스트 추가",
          "수정 coupo…",
          40e3,
          "claude-haiku-5-5",
        ),
        {
          name: "기존 리뷰 의견 정리",
          agentType: "general-purpose",
          working: false,
          bubble: null,
          doing: null,
          endedAt: ago(3 * MIN),
        },
      ],
      links: [
        {
          kind: "PR",
          label: "PR #12",
          url: "https://github.com/example/shop-web/pull/12",
          at: ago(MIN),
        },
        {
          kind: "Jira",
          label: "SHOP-128",
          url: "https://example.atlassian.net/browse/SHOP-128",
          at: ago(8 * MIN),
        },
        {
          kind: "artifact",
          label: "artifact: 쿠폰 흐름도",
          url: "https://claude.ai/artifact/example",
          at: ago(5 * MIN),
        },
      ],
    }),
    desk({
      pid: TOUR_PID.wait,
      zone: "shop-web",
      title: "주문 내역 페이지 정리",
      state: "waiting",
      reason: "permission",
      since: 6 * MIN,
      bubble: "권한 승인 필요 · Bash: npm run build",
      doing: "실행 npm r…",
      said: "빌드해서 번들 크기가 줄었는지 확인하겠습니다.",
      talk: [[6 * MIN, "빌드해서 번들 크기가 줄었는지 확인하겠습니다."]],
      lastPrompt: "주문 내역 페이지에서 안 쓰는 컴포넌트 걷어내줘",
      activity: [[6 * MIN, "실행", "npm run build"]],
    }),
    desk({
      pid: TOUR_PID.fresh,
      zone: "shop-web",
      title: "검색 필터 버그",
      state: "resting",
      since: MIN,
      bubble: "필터를 고쳤고 테스트 12개가 통과했습니다",
      doing: "필터를 고쳤고…",
      said: "필터를 고쳤고 테스트 12개가 통과했습니다.",
      talk: [[MIN, "필터를 고쳤고 테스트 12개가 통과했습니다."]],
      lastPrompt: "가격 필터가 0원을 빼먹어. 고쳐줘",
      activity: [[MIN, "실행", "npm test -- search"]],
    }),
    desk({
      pid: TOUR_PID.api,
      zone: "shop-api",
      title: "주문 API 페이지네이션",
      state: "working",
      since: 12 * MIN,
      last: 5e3,
      bubble: "src/orders/list.ts 수정 중",
      doing: "수정 src/o…",
      said: "커서 방식으로 바꾸고 기존 offset 요청도 받게 두겠습니다.",
      talk: [
        [3 * MIN, "커서 방식으로 바꾸고 기존 offset 요청도 받게 두겠습니다."],
      ],
      lastPrompt: "주문 목록 API를 커서 페이지네이션으로",
      activity: [[5e3, "수정", "src/orders/list.ts"]],
    }),
    desk({
      pid: 41005,
      zone: "shop-api",
      title: "로그 포맷 통일",
      state: "resting",
      since: 95 * MIN,
      said: "로그를 JSON 한 줄 형식으로 맞췄습니다.",
      talk: [[95 * MIN, "로그를 JSON 한 줄 형식으로 맞췄습니다."]],
      lastPrompt: "서버 로그 형식 하나로 통일해줘",
    }),
    desk({
      pid: 41006,
      zone: "shop-web",
      title: "결제 SDK 업그레이드 조사",
      state: "dormant",
      reason: "question",
      since: 2 * DAY + 3 * HOUR,
      staleDays: 2,
      said: "v4와 v5 중 어느 쪽으로 갈까요?",
      lastPrompt: "결제 SDK 최신 버전으로 올릴 수 있는지 봐줘",
      started: 3 * DAY,
    }),
    desk({
      pid: 41007,
      zone: "shop-admin",
      title: "관리자 권한 표 정리",
      state: "dormant",
      since: 11 * HOUR,
      said: "권한 표를 문서로 정리했습니다.",
      lastPrompt: "관리자 권한 표 만들어줘",
      started: 12 * HOUR,
    }),
  ];

  const gone = [
    {
      ...desk({
        pid: 41008,
        zone: "shop-api",
        title: "배포 스크립트 점검",
        state: "resting",
        since: 40 * MIN,
        said: "배포 스크립트에 롤백 단계를 넣었습니다.",
        lastPrompt: "배포 스크립트 점검해줘",
      }),
      goneAt: ago(25 * MIN),
    },
  ];

  const ev = (min, d, from, to, note = null) => ({
    at: ago(min * MIN),
    pid: d.pid,
    title: d.title,
    zone: d.zone,
    from,
    to,
    reason: to === "waiting" ? d.reason : null,
    note,
  });
  const [lead, wait, fresh, api, log] = desks;
  const events = [
    ev(95, log, "working", "resting", "로그를 JSON 한 줄 형식으로 맞췄습니다"),
    ev(
      40,
      gone[0],
      "working",
      "resting",
      "배포 스크립트에 롤백 단계를 넣었습니다",
    ),
    ev(25, gone[0], "resting", "gone"),
    ev(12, api, "resting", "working"),
    ev(8, lead, "resting", "working"),
    ev(6, wait, "working", "waiting"),
    ev(
      1,
      fresh,
      "working",
      "resting",
      "필터를 고쳤고 테스트 12개가 통과했습니다",
    ),
  ].map((e, id) => ({ id, ...e }));

  const counts = { waiting: 0, working: 0, resting: 0, dormant: 0 };
  for (const d of desks) counts[d.state]++;
  return {
    generatedAt: now,
    counts,
    desks,
    gone,
    events,
    lastEventAt: Math.max(...events.map((e) => e.at)),
  };
}

// 단계마다 짚을 곳(선택자. down이 있으면 그 요소의 아래 끝까지 늘린다)과, 그 전에 맞출 화면 상태.
// 본문의 **…**는 그 단계의 가장 중요한 키워드라 굵게 그린다(T50)
const L = TOUR_PID.lead;
const STEPS = [
  {
    title: "사무실",
    text: "이 PC에서 돌아가는 Claude Code 터미널들의 사무실이다. **층 하나가 폴더(git 레포)**이고, 같은 레포의 worktree는 같은 층에 모인다.",
    targets: ["#floors"],
  },
  {
    title: "방 = 팀",
    text: "방 하나가 팀이다. 가운데 사람이 팀장, 곧 **Claude Code 터미널 하나**다. 머리 위 말풍선은 지금 하는 일이고, 방을 누르면 방금 한 말까지 펼친다. 반짝이는 팀장은 **Fable 모델**로 일하고 있다.",
    targets: [`.tw-room[data-pid="${L}"]`],
  },
  {
    title: "칠판",
    text: "팀 이름, 상태와 경과 시간, 내가 마지막으로 보낸 요청이 적혀 있다. 실제 화면에서 **누르면 그 터미널이 앞으로 온다**(Orca 탭 · Ghostty 창).",
    targets: [`[data-action="focus"][data-pid="${L}"]`],
  },
  {
    title: "나를 기다리는 방",
    text: "**빨간 테두리**는 내 **승인이나 답을 기다리는** 팀장이다. 얼굴 옆에 <[!]가 뜨고, 5분 · 15분이 지나면 테두리가 더 세진다. 탭 제목에도 (1)처럼 수가 붙는다.",
    targets: [`.tw-room[data-pid="${TOUR_PID.wait}"]`],
  },
  {
    title: "팀원과 링크",
    text: "병아리는 팀원, 곧 팀장이 띄운 **서브에이전트**다. 팀원도 자기 모델이 Fable이면 반짝인다. 칠판 아래 벽의 칩은 **이 세션이 만든 링크**다. '초록 Y #12'는 PR, '파란 티켓'은 Jira, '노란 [A]'는 artifact이고 누르면 새 탭으로 열린다.",
    // 팀장 방을 고르면 펼친 팀장 말풍선(z 3, T44)이 병아리 말풍선을 덮는다. 다른 방을 골라 접어 둔다
    sel: TOUR_PID.api,
    targets: [
      { sel: `[data-key^="bub:${L}:"]`, down: `.tw-room[data-pid="${L}"]` },
      `[data-key^="obj:${L}:"], [data-key^="objmore:${L}:"]`,
    ],
  },
  {
    title: "지하층",
    text: "**8시간 넘게 아무도 손대지 않은 팀**은 지하층으로 내려간다. 머리에는 답을 기다리다 잠든 팀이 따로 세어진다. 다시 일하면 위층으로 올라온다.",
    targets: ["#basement"],
    baseOpen: true,
  },
  {
    title: "집계 · 로그 · 상세",
    text: '오른쪽은 **상태별 집계**(누르면 그 상태의 팀 목록)와 **로그**(상태가 바뀐 순간, 최근 2시간)다. 탭을 가렸던 순간이 "여기까지 봄" 줄이다. 아래는 **고른 팀의 상세**(마지막 요청 · 팀장이 한 말 · 팀원)이고 접을 수 있다. 낮 · 밤은 N 키로 바꾼다.',
    targets: ["#side", "#detail"],
  },
];

const PAD = 6; // 구멍 여백(px)
const SVG = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

// 선택자에 걸리는 요소 전부를 감싼 사각형. 없으면 null
function box(sel) {
  const rs = [...document.querySelectorAll(sel)]
    .map((n) => n.getBoundingClientRect())
    .filter((r) => r.width || r.height);
  if (!rs.length) return null;
  const left = Math.min(...rs.map((r) => r.left));
  const top = Math.min(...rs.map((r) => r.top));
  return {
    left,
    top,
    right: Math.max(...rs.map((r) => r.right)),
    bottom: Math.max(...rs.map((r) => r.bottom)),
  };
}
function holeOf(t) {
  const r = box(t.sel ?? t);
  if (!r || !t.down) return r;
  const d = box(t.down);
  return d ? { ...r, bottom: Math.max(r.bottom, d.bottom) } : r;
}

// 오버레이를 붙이고 첫 단계를 연다. 돌려주는 함수를 app.mjs가 그릴 때마다 불러 구멍·카드 위치를 다시 잰다
// (배율이 창 크기에 따라 바뀌고 1초마다 다시 그리기 때문이다)
// leave = 새로고침 없이 실제 사무실로 바꾸는 함수(app.mjs). 끝내기 · Esc에서 어두운 동안 부른다
export function startTour(state, render, leave) {
  state.folded = false;
  state.seenAt = Date.now() - TOUR_SEEN_MS;
  // 덮는 층은 클릭만 막는다. Tab · Enter로 칠판(/api/focus)이나 칩 링크에 닿지 않게 뒤를 inert로
  for (const id of ["office", "side", "detail"])
    document.getElementById(id).inert = true;

  const holes = svg("g");
  const rings = svg("g", { class: "tour-rings" });
  const mask = svg("mask", { id: "tour-mask" });
  mask.append(
    svg("rect", { width: "100%", height: "100%", fill: "#fff" }),
    holes,
  );
  const dim = svg("svg", { class: "tour-dim", "aria-hidden": "true" });
  const defs = svg("defs");
  defs.append(mask);
  dim.append(
    defs,
    svg("rect", {
      class: "tour-shade",
      width: "100%",
      height: "100%",
      mask: "url(#tour-mask)",
    }),
    rings,
  );

  const no = el("p", "tour-no");
  const title = el("h2", null);
  title.id = "tour-title";
  const text = el("p", "tour-text");
  const prev = el("button", "tour-btn", "← 이전");
  const next = el("button", "tour-btn primary");
  prev.type = next.type = "button";
  const nav = el("div", "tour-nav");
  nav.append(prev, next);
  const card = el("section", "tour-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "tour-title");
  card.append(
    no,
    title,
    text,
    nav,
    el("p", "tour-hint", "← → 로 넘기고 Esc로 끝낸다"),
  );
  const badge = el("p", "tour-badge", "예시 화면 · 튜토리얼");
  badge.setAttribute("role", "status"); // 실제 데이터로 바뀌는 순간을 스크린리더도 읽는다
  const curtain = el("div", "tour-curtain");
  // "…" 한 글자는 도트 글꼴에서 대시처럼 뭉개져 마침표 셋으로 쓴다
  curtain.append(el("p", null, "내 사무실로 이동합니다..."));
  const root = el("div", "tour");
  root.append(dim, card, curtain, badge);
  document.body.append(root);

  let i = 0;
  let warned = -1;
  const ac = new AbortController(); // 끝나면 튜토리얼의 키 · 스크롤 처리를 뗀다
  let leaving = false;
  // 끝내기 · Esc(T51): 소등 → 어두운 동안 실제 사무실로 바꾸고 → 점등.
  // 노란 "예시 화면" 배지는 같은 자리에서 초록(실제 데이터)으로 바뀌어 4초 남는다
  const end = async () => {
    if (leaving) return;
    leaving = true;
    ac.abort();
    root.classList.add("leaving");
    await Promise.all([wait(HOLD_MS), leave()]);
    for (const id of ["office", "side", "detail"])
      document.getElementById(id).inert = false;
    // 카드를 떼기 전에 포커스를 실제 화면으로 옮긴다(떼면 body로 빠진다)
    const office = document.getElementById("office");
    office.tabIndex = -1;
    office.focus({ preventScroll: true });
    // 커튼은 떼었다 붙이면 transition 없이 바로 꺼진다. 덮개와 카드만 뗀다
    dim.remove();
    card.remove();
    badge.textContent = liveBadge(state);
    badge.classList.add("live");
    root.classList.add("lit");
    await wait(FADE_MS);
    curtain.remove();
    await wait(LIVE_MS);
    badge.classList.add("bye");
    await wait(300);
    root.remove();
  };
  const go = (n) => {
    if (n >= STEPS.length) return end();
    i = Math.max(0, n);
    const s = STEPS[i];
    state.sel = s.sel ?? L;
    state.pick = null;
    state.baseOpen = s.baseOpen ?? false;
    no.textContent = `${i + 1} / ${STEPS.length}`;
    title.textContent = s.title;
    // 고정 문구라도 innerHTML 대신 노드로: **…** 사이(홀수 조각)만 <strong>
    text.replaceChildren(
      ...s.text
        .split(/\*\*(.+?)\*\*/)
        .map((p, k) => (k % 2 ? el("strong", null, p) : p)),
    );
    prev.disabled = i === 0;
    next.textContent = i === STEPS.length - 1 ? "끝내기" : "다음 →";
    render();
    const first = s.targets[0];
    document
      .querySelector(first.sel ?? first)
      ?.scrollIntoView({ block: "nearest" });
    next.focus({ preventScroll: true });
  };
  prev.addEventListener("click", () => go(i - 1));
  next.addEventListener("click", () => go(i + 1));
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") end();
      else if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
    },
    { signal: ac.signal },
  );

  const place = () => {
    if (!state.desks.length) return; // 첫 그리기 전(예시 데이터를 아직 안 넣음)
    const rs = STEPS[i].targets.map(holeOf);
    if (rs.some((r) => !r) && warned !== i) {
      warned = i;
      console.warn(`튜토리얼 ${i + 1}단계: 짚을 요소가 없다`, STEPS[i].targets);
    }
    const shown = rs.filter(Boolean).map((r) => ({
      x: r.left - PAD,
      y: r.top - PAD,
      w: r.right - r.left + 2 * PAD,
      h: r.bottom - r.top + 2 * PAD,
    }));
    for (const g of [holes, rings]) {
      while (g.children.length > shown.length) g.lastChild.remove();
      while (g.children.length < shown.length) g.append(svg("rect"));
    }
    shown.forEach((r, k) => {
      for (const n of [holes.children[k], rings.children[k]])
        for (const [a, v] of Object.entries({
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
        }))
          n.setAttribute(a, v);
      holes.children[k].setAttribute("fill", "#000");
    });
    placeCard(card, shown[0], badge.getBoundingClientRect().bottom + 8);
  };
  addEventListener("scroll", place, { capture: true, signal: ac.signal });
  go(0);
  return place;
}

// 카드는 첫 구멍의 아래 → 위 → 오른쪽 → 왼쪽 중 화면에 들어오는 쪽, 다 안 되면 구멍 안쪽 위. 구멍이 없으면 가운데.
// top = 카드가 올라갈 수 있는 위 끝("예시 화면" 표시 아래)
function placeCard(card, r, top) {
  const m = 12;
  const vw = innerWidth;
  const vh = innerHeight;
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  let x = (vw - w) / 2;
  let y = (vh - h) / 2;
  if (r) {
    if (r.y + r.h + m + h <= vh - 8) [x, y] = [r.x, r.y + r.h + m];
    else if (r.y - m - h >= top) [x, y] = [r.x, r.y - m - h];
    else if (r.x + r.w + m + w <= vw - 8) [x, y] = [r.x + r.w + m, r.y];
    else if (r.x - m - w >= 8) [x, y] = [r.x - m - w, r.y];
    else [x, y] = [r.x + 16, r.y + 16];
  }
  card.style.left = `${Math.round(Math.min(Math.max(x, 8), vw - w - 8))}px`;
  card.style.top = `${Math.round(Math.min(Math.max(y, top), vh - h - 8))}px`;
}
