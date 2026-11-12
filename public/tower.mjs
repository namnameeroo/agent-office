// 건물(시안 F, 스펙 §12): 층 = 폴더, 방 한 칸 = 팀 하나(자리 고정). 건물은 canvas에 칠하고 글자·버튼은 DOM이다.
// DOM은 key로 노드를 재사용하는 sync로만 맞춘다(§5). 그림 엔진은 wireframes/office-v2.html의 F에서 그대로 옮겼다
import { el, setText, setAttr, setClass, sync } from "./dom.mjs";
import {
  NAME,
  FRESH_MS,
  boardNote,
  linkEl,
  layoutLinks,
  firstLine,
  pickScale,
  overlay,
} from "./common.mjs";

// 대기 신호 단계: 1 = 0–5분, 2 = 5–15분, 3 = 15분+ 맥박
const waitLevel = (ms) => (ms < 5 * 60e3 ? 1 : ms < 15 * 60e3 ? 2 : 3);
// 글자 격자 → SVG. 글자 하나 = 픽셀 하나, 색이 없는 글자('.')는 비운다
// extra = 그림 위에 덧그리는 같은 칸 좌표의 SVG 조각(초상화 반짝이), box = 칸 단위 viewBox [x, y, 폭, 높이].
// 픽셀 크기는 그림 줄 수로 정해서 box를 넓혀도 그림이 작아지지 않는다
function gridSvg(
  rows,
  color,
  size,
  extra = "",
  box = [0, 0, rows[0].length, rows.length],
) {
  const s = Math.max(1, Math.floor(size / rows.length)); // 픽셀 크기는 정수배로
  let px = "";
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (color[c])
        px += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color[c]}"/>`;
    }),
  );
  const [bx, by, bw, bh] = box;
  return `<svg viewBox="${bx} ${by} ${bw} ${bh}" width="${bw * s}" height="${bh * s}" shape-rendering="crispEdges" aria-hidden="true">${px}${extra}</svg>`;
}

// ── F 픽셀 오피스: 사용자 Design 캔버스 "Pixel Office Tower v1"(.dc.html)의 도트 엔진을 canvas로 옮겼다 ──
// 스펙 §12. 좌표는 전부 art px 정수(1 art px = S css px). DESIGN.md §6.3의 장식(화분·책장·시계·머그 등)은 뺐다
// 층 = 폴더, 방 한 칸 = 팀 하나(자리 고정). 상태가 바뀌면 방은 그대로 두고 팀장 자세·오리 눈·방의 빛을 바꾼다
const F_OUT = "#2a1d1a";
const F_SIT = [
  "..OOOOO...",
  ".OHHHHHO..",
  "OHHHHHHHO.",
  "OHHHHSSSO.",
  "OHHSSSESO.",
  "OHHSSBSSO.",
  ".OHSSSSO..",
  "...OCCO...",
  "..OCCCCCS.",
  "..OCCCCO..",
  "..OCCCCO..",
  "..OPPPPPPO",
  "..OOOOOPPO",
  ".......OPO",
  ".......OKK",
];
// 타이핑 둘째 프레임: 손이 1px 들린다
const F_SIT2 = [
  ...F_SIT.slice(0, 7),
  "...OCCO.S.",
  "..OCCCCC..",
  ...F_SIT.slice(9),
];
const F_FRONT = [
  "..OOOOOO..",
  ".OHHHHHHO.",
  "OHHHHHHHHO",
  "OHSSSSSSHO",
  "OSSESSESSO",
  "OSBSSSSBSO",
  ".OSSSSSSO.",
  "..OOOOOO..",
  "..OCCCCO..",
  ".OSCCCCSO.",
  ".OSCCCCSO.",
  "..OPPPPO..",
  "..OPOOPO..",
  "..OK..KO..",
];
const F_SITF = [...F_FRONT.slice(0, 11), "..OPPPPO..", "..OKOOKO.."];
// 휴식·휴면: 눈을 감는다. 뜬 눈은 1px 점, 감은 눈은 가로 2px (오리와 같은 규칙)
const fShut = (rows) => rows.map((r, y) => (y === 4 ? "OSEESSEESO" : r));
const F_SITF_SHUT = fShut(F_SITF);
// 나를 기다림: 서서 오른손을 든다. FRONT에 팔을 붙였다 (12×14)
const F_RAISE = [
  "..OOOOOO....",
  ".OHHHHHHO.O.",
  "OHHHHHHHHOSO",
  "OHSSSSSSHOSO",
  "OSSESSESSOCO",
  "OSBSSSSBSOCO",
  ".OSSSSSSOOCO",
  "..OOOOOO.OCO",
  "..OCCCCOOCO.",
  ".OSCCCCCO...",
  ".OSCCCCO....",
  "..OPPPPO....",
  "..OPOOPO....",
  "..OK..KO....",
];
// 팀원 = 오리. 뜬 눈은 세로 2px, 감은 눈(퇴근)은 가로 2px
const F_DUCK = [
  "...OOOO...",
  "..OYYYYO..",
  "..OYYEYOBB",
  "..OYYEYOB.",
  ".OOYYYYO..",
  "OYYYYYYYO.",
  "OYyyyYYYO.",
  ".OYYYYYO..",
  "..OOOOO...",
  "...B..B...",
];
const F_DUCK_OFF = [
  ...F_DUCK.slice(0, 2),
  "..OYYYYOBB",
  "..OYEEYOB.",
  ...F_DUCK.slice(4),
];
const F_DUCK_COLOR = {
  O: F_OUT,
  E: F_OUT,
  Y: "#ffd23f",
  y: "#e8b62c",
  B: "#f08a24",
};
// 기다림 말풍선
// 기다림 "!" 말풍선: 손 든 팀장 얼굴 옆에 <[!] 모양. 왼쪽 꼬리 끝(0,3)이 눈높이에서 얼굴을 가리킨다
const F_BANG = [
  "...OOOOO.",
  "..OWWAWWO",
  ".OOWWAWWO",
  "OWWWWAWWO",
  ".OOWWWWWO",
  "..OWWAWWO",
  "...OOOOO.",
];
// Fable 팀장 반짝이(T42): 사용자 레퍼런스 Accessories.dc.html 값 그대로. w = 흰 빛, Y = 따뜻한 심
const F_SPARK = {
  big: ["..w..", "..w..", "wwYww", "..w..", "..w.."],
  small: [".w.", "wYw", ".w."],
  dot: ["w"],
};
// [모양, 사람 그림 원점 기준 x, y, b조인가]. a조와 b조가 번갈아 깜빡인다
const F_SPARK_POS = {
  front: [
    ["big", -6, -3, false],
    ["small", 11, 4, true],
    ["dot", 12, -1, false],
  ],
  side: [
    ["big", -6, -3, false],
    ["small", 10, 4, true],
    ["dot", 11, 0, false],
  ],
};
const F_SPARK_COLOR = { w: "#fff6c8", Y: "#ffd75e" };
// 팀장(책상)·팀원(오리) 모두 같은 규칙: 그 세션 자신의 모델이 Fable
export const isFable = (d) => d.model?.includes("fable") ?? false;
// 레퍼런스 CSS(1.2초 steps(2), b조 0.6초 늦게)와 같은 깜빡임: a조는 주기의 0~0.3초·0.9~1.2초에 밝고 b조는 그 반대,
// 흐릴 때 불투명도 0.15(#..26). 움직임 줄이기면 둘 다 밝게 멈춘다
function fSparkle(p, side, ox, oy, t) {
  const a = (t + 300) % 1200 < 600;
  const dim = { w: `${F_SPARK_COLOR.w}26`, Y: `${F_SPARK_COLOR.Y}26` };
  for (const [k, dx, dy, b] of F_SPARK_POS[side ? "side" : "front"])
    p.s(
      F_SPARK[k],
      still.matches || a !== b ? F_SPARK_COLOR : dim,
      ox + dx,
      oy + dy,
    );
}
// 초상화(SVG)용 정면 반짝이 조각. 깜빡임은 style.css .spk(레퍼런스 CSS 그대로)가 맡는다
const F_SPARK_BOX = [-6, -3, 20, 17]; // 큰 별(-6, -3)부터 점·작은 별(x 13)까지 담는 칸 범위
function sparkSvg(sx = 0, sy = 0) {
  let s = "";
  for (const [k, dx, dy, b] of F_SPARK_POS.front)
    F_SPARK[k].forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== ".")
          s += `<rect class="spk${b ? " b" : ""}" x="${sx + dx + x}" y="${sy + dy + y}" width="1" height="1" fill="${F_SPARK_COLOR[c]}"/>`;
      }),
    );
  return s;
}
const F_CAT = [
  "k...k...",
  "kk.kk...",
  "kkkkk...",
  "kekekk.k",
  "kkkkkkkk",
  "kkkkkkk.",
];
// 사람마다 머리·피부·옷·바지 색 (pid로 고른다). 상태를 뜻하지 않는다. 뒤 두 칸(있으면) = 머리 그늘색·머리 모양(T41)
export const F_PEOPLE = [
  ["#3b2a24", "#f6c9a4", "#e07a4f", "#3d4a6b"],
  ["#c9763c", "#f3c19c", "#6aa37a", "#4a3b55"],
  ["#1f1f2e", "#d9a07a", "#f2d36b", "#355070"],
  ["#8a5a9e", "#f6d1b3", "#5d8fc9", "#2f3b4f"],
  ["#e8c06a", "#f6c9a4", "#d95d6a", "#3a3a48"],
  ["#5a3a2a", "#b9805c", "#f0ece0", "#5b6b46"],
  ["#d9d4cc", "#f0c7a6", "#8e5a9b", "#3a3a48"],
  ["#4a2e2a", "#f6d1b3", "#e9a3b8", "#3a3a48", "#36201d", "long"],
  ["#2b2b3a", "#f3c19c", "#7fc4c9", "#4a3b55", "#1c1c28", "twin"],
  ["#a8653a", "#f0c7a6", "#9bb86a", "#3d4a6b", "#7e4a2a", "perm"],
  ["#7a6a5a", "#f6d1b3", "#a895d6", "#3a3a48", "#5e5044", "bob"],
];
// 머리 모양 덮개: 사용자 에셋 시트 Characters.dc.html 값 그대로(T41 long · T45 bob · T47 twin·perm), 번호 = 시트 번호.
// [x, y(사람 그림 원점 기준, 덮개 왼쪽 위 칸), 줄들]. h = 머리 그늘, T = 머리끈, 빈 줄 = 그 줄은 몸 그림 그대로
const F_HAIR = {
  long: {
    front: [
      0,
      3,
      [
        "OH......HO",
        "OH......HO",
        "OH......HO",
        "OHO....OHO",
        "OHO....OHO",
        "OHO....OHO",
        "OHO....OHO",
        ".OO....OO.",
      ],
    ],
    side: [0, 5, ["OHH", "OHH", "OHHO", "OHO", "OhO", ".O"]],
  },
  // 양갈래: 머리 양옆으로 3칸씩 나가 몸 그림보다 넓다
  twin: {
    front: [
      -3,
      2,
      [
        "..TT........TT..",
        "OHHO........OHHO",
        "OHHO........OHHO",
        "OHhO........OhHO",
        "OHhO........OhHO",
        ".OHHO......OHHO.",
        "..OO........OO..",
      ],
    ],
    side: [-2, 2, [".TT", "OHO", "OHO", "OhO", "OhO", ".OHO", "..O"]],
  },
  // 파마: 양옆 1칸, 위로 1칸 부푼다
  perm: {
    front: [
      -1,
      -1,
      [
        "..O.OO.O.O..",
        ".OHOHHOHOHO.",
        "OHhHHhHHhHHO",
        "OHHhHHHHhHhO",
        "OhH......HhO",
        "OHh......hHO",
        "OhH......HhO",
        ".OHO....OHO.",
        "..O......O..",
      ],
    ],
    side: [
      -1,
      -1,
      [
        "..O.OO.O",
        ".OHOHHOHO",
        "OHhHHhHHhO",
        "OHHhHHHHhHO",
        "OhHhH",
        "OHhH",
        "OhHO",
        ".OO",
      ],
    ],
  },
  // 중단발: 이마를 덮는 앞머리, 턱선에서 끝난다
  bob: {
    front: [
      0,
      3,
      ["OHHhHHhHHO", "OH......HO", "OH......HO", "OHO....OHO", ".OO....OO."],
    ],
    side: [0, 3, [".....HH", "", "OHH", "OHH", ".OO"]],
  },
};
// 든 팔 = 손 든 자세에서 정면과 다른 칸. 머리 덮개 위에 다시 그려 팔이 머리카락을 가린다(T47 결정 ①: 기다림 신호가 먼저)
const F_RAISE_ARM = F_RAISE.map((r, y) =>
  [...r].map((c, x) => (c === (F_FRONT[y][x] ?? ".") ? "." : c)).join(""),
);
export function fPerson(i) {
  const [H, S, C, P, h = H] = F_PEOPLE[i % F_PEOPLE.length];
  return {
    O: F_OUT,
    H,
    h,
    S,
    E: F_OUT,
    B: "#ee8f80",
    C,
    P,
    K: "#2a2230",
    T: "#e05a6a",
  };
}
// 사람 i의 그림 [줄들, dx, dy]: 머리 모양이 있으면 덮개를 겹친다(옆모습 = 앉아 타이핑 → side, 나머지 자세 → front).
// 덮개가 몸 그림 왼쪽·위로 나가면 그림이 넓어지므로 그리는 곳은 원점에 dx·dy(≤ 0)를 더한다
function fFig(rows, i) {
  const hair = F_HAIR[F_PEOPLE[i % F_PEOPLE.length][5]];
  if (!hair) return [rows, 0, 0];
  const [dx, dy, top] =
    hair[rows === F_SIT || rows === F_SIT2 ? "side" : "front"];
  const L = Math.max(0, -dx);
  const T = Math.max(0, -dy);
  let fig = overlay(rows, dy, top, dx);
  if (rows === F_RAISE) fig = overlay(fig, T, F_RAISE_ARM, L);
  return [fig, -L, -T];
}
// 캔버스: 사람 i를 원점 (ox, oy)에 그린다
function fDrawFig(p, rows, i, ox, oy, put) {
  const [fig, dx, dy] = fFig(rows, i);
  p.s(fig, fPerson(i), ox + dx, oy + dy, put);
}
// 지하층 목록·하단 초상화용 (같은 그림을 SVG로)
export function pixelFigF(kind, state, size, seed, fable = false) {
  if (kind === "팀원")
    return gridSvg(state === "off" ? F_DUCK_OFF : F_DUCK, F_DUCK_COLOR, size);
  // 초상화는 의자 없이 그리므로 앉은 자세 대신 정면으로 선다. 넓은 머리는 초상화 칸이 넓어진다(T47 결정 ③)
  const [fig, dx, dy] = fFig(
    state === "waiting"
      ? F_RAISE
      : state === "resting" || state === "dormant"
        ? fShut(F_FRONT)
        : F_FRONT,
    seed,
  );
  if (!fable) return gridSvg(fig, fPerson(seed), size);
  // Fable(T46)이면 반짝이 자리까지 칸을 넓힌다(사람 크기는 그대로). 반짝이 자리는 원래 원점 기준이라 넓어진 그림 좌표로 옮긴다
  const [bx, by, bw, bh] = F_SPARK_BOX;
  const x0 = Math.min(0, bx - dx);
  const y0 = Math.min(0, by - dy);
  const x1 = Math.max(fig[0].length, bx - dx + bw);
  const y1 = Math.max(fig.length, by - dy + bh);
  return gridSvg(fig, fPerson(seed), size, sparkSvg(-dx, -dy), [
    x0,
    y0,
    x1 - x0,
    y1 - y0,
  ]);
}

// 팔레트: 낮 = C Underground HQ의 낮 하늘(기본), 밤 = B Late Night. 값은 원본의 BASE에 시안 C·B의 T를 덮었다
const F_DAY = {
  light: "255,206,140",
  coneA: 0.13,
  bulb: "#fff1c1",
  shade: "#c8553d",
  cord: "#3a2a26",
  ceil: "#efe2cc",
  trim: "#7a4a32",
  wains: "#a86b45",
  floor: "#8a5432",
  floorTop: "#b07444",
  floorLine: "#6a3e26",
  slab: "#2e2826",
  slabTop: "#4a423e",
  slabDark: "#1e1a18",
  facade: "#7a736c",
  mortar: "#6a635c",
  cap: "#b5ada3",
  wood: "#a8683e",
  woodLight: "#c98a55",
  woodDark: "#6e4128",
  metal: "#b9b2a8",
  metalDark: "#5a5350",
  monFrame: "#2e2a33",
  screen: "#2f5476",
  code1: "#8fd0a8",
  code2: "#f2c86b",
  screenGlow: "120,190,255",
  chair: "#4a5873",
  chairLight: "#6a7a98",
  frame: "#6e4128",
  curtain: "#e0a458",
  win: ["#8acbe6", "#a8dbef", "#cdeaf5"],
  winDots: null,
  shaft: "#26221f",
  rail: "#4a4440",
  cable: "#1a1416",
  car: "#9ab0a0",
  carIn: "#dfe8d8",
  carDark: "#5a6e60",
  callBtn: "#f2c14e",
  cat: "#e39a4f",
  bulbs: ["#f2c14e", "#e07a5f", "#8fd0a8", "#f7e3a1"],
  dim: null,
  sign: ["#3a4a34", "#4e6446", "#fff6c8"],
  edge: null,
  // 층마다 벽·줄무늬 색 (DESIGN.md §3.3). 같은 층(폴더)의 방은 같은 벽
  walls: [
    ["#ecdcc0", "#e2cfae"],
    ["#d7dfcb", "#cbd4bd"],
    ["#f0dbbd", "#e6ceab"],
    ["#ddd0e2", "#d2c3d8"],
    ["#ebcfa6", "#e0c194"],
  ],
};
const F_NIGHT = {
  light: "255,178,96",
  coneA: 0.2,
  shade: "#e0a050",
  cord: "#2a2226",
  ceil: "#6a5658",
  trim: "#4a3034",
  wains: "#6e4a3e",
  floor: "#5a3a2e",
  floorTop: "#7a5038",
  floorLine: "#3e281f",
  slab: "#1b1f2c",
  slabTop: "#323a4c",
  slabDark: "#10131c",
  facade: "#3b4656",
  mortar: "#323b4a",
  cap: "#8090a6",
  win: ["#0f1228", "#161b38", "#1d2449"],
  winDots: [
    [3, 2, 1, "#fff6d8"],
    [12, 4, 1, "#ffffff"],
    [17, 1, 1, "#fff6d8"],
    [7, 8, 1, "#f2c14e"],
    [14, 9, 2, "#f2c14e"],
  ],
  curtain: "#8a5a9c",
  frame: "#3a2a2e",
  dim: "rgba(16,14,44,0.34)",
  shaft: "#151820",
  rail: "#2a3040",
  car: "#b0a090",
  carIn: "#e8d8b0",
  carDark: "#6a5a4a",
  bulbs: ["#ffd27a", "#ff9a6a", "#ffe9a8", "#ff7aa8"],
  sign: ["#1a1d2e", "#232842", "#ff6fa5"],
  edge: "rgba(170,190,255,0.25)",
  walls: [
    ["#9b7f9e", "#907494"],
    ["#7f9c94", "#759189"],
    ["#c9946a", "#bd895f"],
    ["#a98a74", "#9e7f69"],
    ["#8f8070", "#857666"],
  ],
};

// 엔진: 사각형 목록을 쌓고 마지막에 한 번에 칠한다. g()는 빛나는 것(모니터·칠판)이라 밤의 dim 위에 다시 그린다
function fMk() {
  const R = [];
  const G = [];
  const F = [];
  const p = {
    R,
    F,
    r(x, y, w, h, c) {
      if (w > 0 && h > 0 && c) R.push([x, y, w, h, c]);
    },
    g(x, y, w, h, c) {
      G.push([x, y, w, h, c]);
    },
    // 불 켜진 방의 캐릭터: 빛 원뿔·덧칠까지 그린 뒤 맨 위에 원래 색으로 그린다
    f(x, y, w, h, c) {
      F.push([x, y, w, h, c]);
    },
    flush(L = G) {
      for (const a of L) p.r(...a);
      L.length = 0;
    },
    // 글자 격자 스프라이트. 같은 색이 이어지면 사각형 하나로 합친다. put = 그릴 목록
    s(rows, pal, ox, oy, put = p.r) {
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length;) {
          const ch = row[x];
          let e = x + 1;
          while (row[e] === ch) e++;
          if (ch !== ".") put(ox + x, oy + y, e - x, 1, pal[ch]);
          x = e;
        }
      });
    },
  };
  return p;
}
const fRgba = (rgb, a) =>
  `rgba(${rgb},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
function fRng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
function fDisk(p, cx, cy, r, c) {
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy) + 0.3);
    p.r(cx - hw, cy + dy, hw * 2 + 1, 1, c);
  }
}
function fCloud(p, x, y, c) {
  p.r(x + 3, y, 6, 1, c);
  p.r(x + 1, y + 1, 12, 1, c);
  p.r(x, y + 2, 16, 2, c);
  p.r(x + 2, y + 4, 10, 1, c);
}
// 건물 좌우 여백의 먼 빌딩들: [x, 폭, 높이]
function fSkyline(p, B, G, body, lit, off, seed) {
  const r = fRng(seed);
  for (const [x, w, h] of B) {
    const top = Math.max(4, G - h);
    p.r(x, top, w, G - top, body);
    for (let yy = top + 3; yy < G - 4; yy += 4)
      for (let xx = x + 1; xx < x + w - 1; xx += 3)
        p.r(xx, yy, 1, 2, r() < 0.35 ? lit : off);
  }
}
function fGround(p, W, G, c) {
  p.r(0, G, W, 10, c[0]);
  p.r(0, G, W, 4, c[1]);
  p.r(0, G, W, 1, c[2]);
  p.r(0, G + 4, W, 1, c[3]);
  for (let x = 0; x < W; x += 8) p.r(x, G + 1, 1, 3, c[4]);
  for (let x = 2; x < W; x += 14) p.r(x, G + 7, 7, 1, c[5]);
}
function fStreetLamp(p, T, x, a, G) {
  for (let i = 0; i < 12; i++)
    p.r(
      x - 1 - i,
      G - 37 + i * 3,
      4 + i * 2,
      3,
      fRgba(T.light, a * (1 - i / 12)),
    );
  p.r(x, G - 38, 1, 38, "#2e2a33");
  p.r(x - 2, G - 40, 6, 2, "#2e2a33");
  p.r(x - 1, G - 38, 4, 1, "#fff1c1");
  p.r(x - 1, G - 1, 3, 1, "#2e2a33");
}
// 낮: 시안 C의 하늘(파란 4단·해·흰 구름), 언덕, 잔디와 흙. 건물은 땅 위에 둔다(땅 아래 = 휴면 지하층)
function fBgDay(p, T, W, G) {
  const sky = ["#78c3e2", "#8acbe6", "#9dd4eb", "#b2ddef"];
  const bh = Math.ceil(G / sky.length);
  sky.forEach((c, i) => p.r(0, i * bh, W, bh, c));
  fDisk(p, W - 24, 14, 11, "rgba(255,246,200,0.35)");
  fDisk(p, W - 24, 14, 8, "#fff6c8");
  fDisk(p, W - 24, 14, 6, "#ffe98a");
  fCloud(p, Math.round(W * 0.27), 6, "#ffffff");
  fCloud(p, Math.round(W * 0.63), 2, "#f4fbff");
  fCloud(p, 2, 34, "#ffffff");
  fCloud(p, W - 18, 40, "#ffffff");
  fDisk(p, Math.round(W * 0.17), G + 12, 18, "#a6d38e");
  fDisk(p, Math.round(W * 0.88), G + 14, 20, "#9ccb85");
  p.r(0, G, W, 2, "#8fd16e");
  p.r(0, G + 2, W, 3, "#6dbb58");
  p.r(0, G + 5, W, 5, "#8a5a3c");
  for (let x = 1; x < W; x += 3) p.r(x, G - 1, 1, 1, "#a6de84");
  const r = fRng(11);
  for (let i = 0; i < W / 4; i++)
    p.r(
      Math.floor(r() * W),
      G + 5 + Math.floor(r() * 5),
      1 + Math.floor(r() * 2),
      1,
      r() < 0.5 ? "rgba(255,220,180,0.2)" : "rgba(0,0,0,0.22)",
    );
}
function fBgNight(p, T, W, G) {
  const sky = [
    "#0b0d1e",
    "#0f1228",
    "#131733",
    "#181d3e",
    "#1d2449",
    "#222b53",
    "#28325c",
    "#2e3964",
    "#35406b",
  ];
  const bh = Math.ceil(G / sky.length);
  sky.forEach((c, i) => p.r(0, i * bh, W, bh, c));
  const r = fRng(7);
  for (let i = 0; i < Math.round((110 * W) / 200); i++) {
    const sx = Math.floor(r() * W);
    const sy = Math.floor(r() * G);
    p.r(sx, sy, 1, 1, r() < 0.2 ? "#fff6d8" : "rgba(255,255,255,0.5)");
  }
  for (const [x, y] of [
    [60, 10],
    [110, 6],
  ]) {
    p.r(x, y, 1, 3, "#fff6d8");
    p.r(x - 1, y + 1, 3, 1, "#fff6d8");
  }
  fDisk(p, W - 28, 14, 12, "rgba(244,236,208,0.07)");
  fDisk(p, W - 28, 14, 8, "#f4ecd0");
  fDisk(p, W - 24, 11, 7, "#0b0d1e");
  fSkyline(
    p,
    [
      [0, 10, 152],
      [9, 8, 126],
      [W - 16, 9, 160],
      [W - 8, 8, 134],
    ],
    G,
    "#161a30",
    "#f2c14e",
    "#20253f",
    5,
  );
  fGround(p, W, G, [
    "#1a1a26",
    "#4a4a5a",
    "#5e5e70",
    "#2a2a36",
    "#3a3a48",
    "#b89a4a",
  ]);
}

const F_BX = 16; // 건물 왼쪽 x
const F_RW = 220; // 방 안쪽 폭. DESIGN.md §2.1의 146보다 넓혀 오리 사이에 말풍선 자리를 둔다
const F_COLS = 2; // 한 단(줄)의 방 수. 팀이 더 많은 층(폴더)은 여러 단을 쓴다
const F_PITCH = F_RW + 2; // 방 + 방 사이 벽
// 방 안 가로 좌표(방 왼쪽 기준). 칠판(x+3) → 팀장 자리 → 오리 3자리. 그림과 HTML 오버레이가 같이 쓴다
const F_BW = 78; // 칠판 폭. 62에서 넓혀 오른쪽 빈칸을 쓴다(T21)
const F_OX = 3 + F_BW + 4; // 팀장 x = 칠판 틀 끝 + 4
// 첫 오리 x. 책상 끝(F_OX + 25)에서 8 띄운다
const F_DX = 118;
// 오리 간격. 38에서 줄였다: 셋째 오리 말풍선(x + F_DX + 1 + 2 × 간격, 폭 간격 - 2)이 벽(220) 안에서 끝나야 한다.
// style.css .tw-bub의 최대 폭(간격 - 4)과 짝이다
const F_DP = 34;
const F_TOP = 30; // 맨 위 슬래브 y. 원본(48)에서 옥상 장식을 빼고 하늘을 줄였다
// 층 사이 슬래브 높이(T37: 4 → 9). 층 이름표(Silkscreen 대문자 5칸)가 위아래 선과 1칸씩 띄어 들어간다.
// style.css .tw-tag의 줄 높이(8)·최대 폭(100 = F_RW / 2 - 10, 첫 방 ▼ 앞 4칸)과 짝이다
const F_SLAB = 9;
const fFT = (i) => F_TOP + i * (F_SLAB + 36); // 위에서 i번째 층의 위 슬래브 y
function fRoomBase(p, T, wall, x, y) {
  const w = F_RW;
  p.r(x, y, w, 36, wall[0]);
  for (let i = x + 3; i < x + w; i += 6) p.r(i, y + 2, 2, 23, wall[1]);
  p.r(x, y, w, 2, T.ceil);
  p.r(x, y + 2, w, 1, "rgba(0,0,0,0.08)");
  p.r(x, y + 24, w, 1, T.trim);
  p.r(x, y + 25, w, 8, T.wains);
  for (let j = x + 5; j < x + w; j += 10)
    p.r(j, y + 26, 1, 6, "rgba(0,0,0,0.12)");
  p.r(x, y + 33, w, 3, T.floor);
  p.r(x, y + 33, w, 1, T.floorTop);
  for (let q = x + 4; q < x + w; q += 9) p.r(q, y + 34, 1, 2, T.floorLine);
}
// 창밖 색 = 시간대(팔레트)
function fWin(p, T, x, y, w, h) {
  p.r(x - 3, y - 3, w + 6, 1, T.woodDark);
  p.r(x - 1, y - 1, w + 2, h + 2, T.frame);
  const bh = Math.ceil(h / T.win.length);
  T.win.forEach((c, i) => p.r(x, y + i * bh, w, Math.min(bh, h - i * bh), c));
  for (const [dx, dy, dw, c] of T.winDots ?? [])
    p.r(x + (dx % w), y + (dy % h), dw, 1, c);
  p.r(x + Math.floor(w / 2), y, 1, h, T.frame);
  p.r(x, y + Math.floor(h / 2), w, 1, T.frame);
  p.r(x + 1, y + 1, 1, 3, "rgba(255,255,255,0.35)");
  p.r(x - 2, y + h + 1, w + 4, 1, T.trim);
  p.r(x - 3, y - 2, 2, h + 4, T.curtain);
  p.r(x + w + 1, y - 2, 2, h + 4, T.curtain);
}
function fLamp(p, T, lx, y) {
  p.r(lx, y + 2, 1, 3, T.cord);
  p.r(lx - 2, y + 5, 5, 2, T.shade);
  p.r(lx - 1, y + 7, 3, 1, T.bulb);
}
// 빛 원뿔: 3px 띠마다 폭 +4, 아래로 갈수록 옅어진다. 방(rx~rx+RW) 밖으로는 안 나간다
function fCone(p, T, lx, y, fy, rx) {
  const clip = (x, yy, w, h, c) => {
    const a = Math.max(x, rx);
    p.r(a, yy, Math.min(x + w, rx + F_RW) - a, h, c);
  };
  let i = 0;
  for (let yy = y + 8; yy < fy; yy += 3, i++) {
    const hw = 2 + i * 2;
    clip(
      lx - hw,
      yy,
      hw * 2 + 1,
      Math.min(3, fy - yy),
      fRgba(T.light, T.k * Math.max(0.02, T.coneA - i * 0.011)),
    );
  }
  const hw = 2 + i * 2;
  clip(lx - hw, fy, hw * 2 + 1, 1, fRgba(T.light, T.k * T.coneA * 1.4));
}
// 전구 줄 = 방금 끝남
function fBulbs(p, T, x, y, w) {
  for (let i = 0; i < w; i++)
    p.r(
      x + i,
      y + 3 + Math.round(2 * Math.sin(((i % 24) / 24) * Math.PI)),
      1,
      1,
      T.cord,
    );
  for (let j = 4, n = 0; j < w - 1; j += 6, n++) {
    const sg = y + 4 + Math.round(2 * Math.sin(((j % 24) / 24) * Math.PI));
    p.r(x + j - 1, sg - 1, 3, 4, fRgba(T.light, 0.2 * T.k));
    p.r(x + j, sg, 1, 2, T.bulbs[n % T.bulbs.length]);
  }
}
// 칠판 = 상태판. 글자는 DOM으로 얹는다(renderTower)
// 칠판: 위·옆 틀 + 글 자리 18행(y+1~18) + 아래는 틀 대신 양옆으로 1칸 튀어나온 선반 선(y+19).
// 선반 밑에 벽 1행을 남겨 몰딩과 붙지 않게 한다. 붙으면 몰딩의 일부처럼 보인다(T26)
function fBoard(p, T, x, y) {
  p.g(x, y, F_BW, 19, T.metal);
  p.g(x + 1, y + 1, F_BW - 2, 18, "#f6f3ec");
  p.g(x - 1, y + 19, F_BW + 2, 1, T.metalDark);
}
function fSideChair(p, T, ox, fy) {
  p.r(ox, fy - 12, 2, 8, T.chair);
  p.r(ox + 1, fy - 2, 7, 1, T.chair);
  for (const dx of [2, 4, 6]) p.r(ox + dx, fy - 1, 1, 1, T.metalDark);
}
function fFrontChair(p, T, ox, fy) {
  p.r(ox + 1, fy - 15, 8, 9, T.chair);
  p.r(ox + 1, fy - 15, 8, 1, T.chairLight);
  p.r(ox, fy - 6, 10, 2, T.chair);
  p.r(ox + 1, fy - 4, 1, 4, T.metalDark);
  p.r(ox + 8, fy - 4, 1, 4, T.metalDark);
}
// 책상과 모니터. mon: on = 작업 중(코드 줄이 바뀜) · idle = 켜져 있음 · off = 꺼짐
function fDesk(p, T, dx, fy, mon, typing) {
  const mx = dx + 7;
  p.r(dx, fy - 8, 16, 2, T.wood);
  p.r(dx, fy - 8, 16, 1, T.woodLight);
  p.r(dx + 1, fy - 6, 1, 6, T.woodDark);
  p.r(dx + 14, fy - 6, 1, 6, T.woodDark);
  p.r(dx + 9, fy - 6, 5, 5, T.woodDark);
  p.r(dx + 10, fy - 5, 3, 1, T.wood);
  p.r(dx + 10, fy - 3, 3, 1, T.wood);
  p.r(dx, fy - 9, 4, 1, T.metal);
  p.r(mx + 1, fy - 9, 5, 1, T.metalDark);
  p.r(mx + 3, fy - 11, 1, 2, T.metalDark);
  p.r(mx, fy - 18, 8, 7, T.monFrame);
  if (mon === "off") return p.r(mx + 1, fy - 17, 6, 5, "#1b1924");
  p.g(mx - 3, fy - 20, 14, 12, fRgba(T.screenGlow, 0.12 * T.k));
  p.g(mx + 1, fy - 17, 6, 5, T.screen);
  const w = mon === "on" && typing ? [2, 3, 3] : [3, 3, 2];
  p.g(mx + 2, fy - 16, w[0], 1, T.code1);
  p.g(mx + 3, fy - 15, w[1], 1, T.code2);
  p.g(mx + 2, fy - 14, w[2], 1, T.code1);
}
// 오리. 일하는 오리는 노트북(뒷면과 새는 빛) 앞에서 들썩이고, 퇴근한 오리는 눈을 감는다
function fDuck(p, T, x, fy, working, hop, put) {
  p.s(
    working ? F_DUCK : F_DUCK_OFF,
    F_DUCK_COLOR,
    x,
    fy - 10 - (working ? hop : 0),
    put,
  );
  if (!working) return;
  p.g(x + 9, fy - 8, 7, 7, fRgba(T.screenGlow, 0.1 * T.k));
  p.r(x + 11, fy - 6, 3, 4, T.monFrame);
  p.r(x + 10, fy - 2, 5, 1, T.metal);
}
// 방 한 칸 = 팀 하나. 왼쪽부터 칠판 · 팀장 자리 · 오리 3자리(위에 창). 렌더 순서는 DESIGN.md §7
// 방금 끝남: 오른손의 커피 머그. 3초마다 한 번 입으로 가져가 마시고, 내려놓은 동안 김이 오른다
const F_MUG = ["ccc.", "mmmm", "mmm."];
function fCoffee(p, ox, fy, t, put) {
  const sip = t % 3000 > 2250; // t = 0(움직임 줄이기)이면 내려놓은 모습
  const mx = ox + (sip ? 3 : 6);
  const my = fy - (sip ? 11 : 8);
  p.s(F_MUG, { c: "#6b3e26", m: "#f0ece0" }, mx, my, put);
  if (sip) return;
  const k = Math.floor(t / 250) % 3;
  p.r(mx + 1 + (k % 2), my - 2 - k, 1, 1, "rgba(255,255,255,0.75)");
  p.r(mx + 2 - (k % 2), my - 4 - k, 1, 1, "rgba(255,255,255,0.5)");
}
// 휴식: 머리 위로 작은 z(3×3)가 0.5초마다 하나씩 떠오른다(1.5초 주기). 눈에 띄지 않게 옅게
const F_Z = ["zzz", ".z.", "zzz"];
function fZzz(p, ox, fy, t) {
  const n = Math.floor(t / 500) % 3;
  // 머리 오른쪽 위로 비스듬히. 첫 램프(ox+13~17, y+2~7)와 모니터(ox+16~, y+15~)를 피한다
  [
    [ox + 10, fy - 18],
    [ox + 13, fy - 21],
    [ox + 16, fy - 24],
  ]
    .slice(0, n + 1)
    .forEach(([zx, zy], i) =>
      p.s(
        F_Z,
        { z: i === n ? "rgba(230,236,255,0.45)" : "rgba(230,236,255,0.25)" },
        zx,
        zy,
      ),
    );
}

// 천장 램프(T27): 작업자 자리 기준이라 모든 방에서 같다. 첫째·둘째 오리 사이(F_DX + 16)부터 오리 간격(F_DP)마다:
// 팀장 책상 위(100) · 오리 사이(134 · 168) · 셋째 오리 뒤(202). 갓은 lx-2 ~ lx+2
const F_LAMPS = [-1, 0, 1, 2].map((k) => F_DX + 16 + k * F_DP);
// 방 변주(T25): 창만 바꾼다(참고 시안처럼 방마다 조금씩, 정보는 가리지 않게). 창 = [x, 폭].
// 램프 사이 칸(102~132 · 136~166 · 170~200)에 커튼까지(x-3 ~ x+폭+2) 들어간다. 첫 칸은 팀장 모니터(x+101~109, y+15~)와 겹쳐 쓰지 않는다.
// 줄전구는 "방금 끝남" 표시라 장식으로 쓰지 않는다
const F_ROOM_WINDOWS = [
  [[F_DX + 22, 22]], // 가운데 창 하나
  [], // 창 없음
  [
    [F_DX + 24, 18],
    [F_DX + 58, 18],
  ], // 작은 창 둘
  [[F_DX + 56, 22]], // 오른쪽 창 하나
];
// kind = 자리마다 고정한 F_ROOM_WINDOWS 번호(창은 건물 구조라 세입자 팀이 바뀌어도 그대로)
function fRoom(p, T, wall, d, x, y, t, now, kind = 0) {
  const fy = y + 33; // 발 기준선
  const lamps = F_LAMPS;
  fRoomBase(p, T, wall, x, y);
  if (!d) {
    // 빈 자리: 불 꺼진 방
    for (const lx of lamps) fLamp(p, T, x + lx, y);
    return p.r(x, y, F_RW, 36, "rgba(20,12,24,0.55)");
  }
  const fresh = d.state === "resting" && now - d.since < FRESH_MS;
  const lvl = d.state === "waiting" ? waitLevel(now - d.since) : 0;
  // 15분+ 맥박(1.6초 주기). 시계(t)에 맞춘 위상이라 다시 그려도 끊기지 않는다
  const beat = lvl === 3 ? 0.5 + 0.5 * Math.sin((t / 1600) * 2 * Math.PI) : 0;
  // 빛 세기 k: 작업 중 1 · 방금 끝남 1.2 · 휴식 0.3. 기다림은 주황 빛이 대기 단계마다 세진다
  const R = {
    ...T,
    k:
      d.state === "working"
        ? 1
        : lvl
          ? [0, 1, 1.3, 1 + 0.6 * beat][lvl]
          : fresh
            ? 1.2
            : 0.3,
    ...(lvl ? { light: "255,138,61", coneA: 0.24 } : {}),
  };
  const typing = Math.floor(t / 250) % 2;
  for (const [wx, ww] of F_ROOM_WINDOWS[kind % F_ROOM_WINDOWS.length])
    fWin(p, R, x + wx, y + 6, ww, 12);
  fBoard(p, R, x + 3, y + 3);
  // 팀장(칠판 옆): 작업 중 = 옆을 보고 앉아 타이핑, 기다림 = 일어나 손 듦, 휴식 = 앞을 보고 앉음
  const ox = x + F_OX;
  // 불 켜진 방(휴식 말고 전부)의 캐릭터는 맨 위에, 불 낮춘 방의 캐릭터는 어둠 아래에 그린다
  const put = d.state === "resting" && !fresh ? p.r : p.f;
  // 책상을 사람보다 먼저: 양갈래 끝이 책상 모서리와 겹치면 머리가 위(T47 결정 ②). 불 켜진 방은 사람이 어차피 맨 위
  fDesk(
    p,
    R,
    ox + 9,
    fy,
    d.state === "working" ? "on" : lvl ? "idle" : "off",
    typing,
  );
  if (d.state === "working") {
    fSideChair(p, R, ox, fy);
    fDrawFig(p, typing ? F_SIT2 : F_SIT, d.pid, ox, fy - 15, put);
  } else if (lvl) fSideChair(p, R, ox, fy);
  else {
    // 방금 끝남 = 눈 뜨고 커피, 휴식 = 눈 감고 졸기(zzz는 아래에서 어둠 위에 그린다)
    fFrontChair(p, R, ox, fy);
    fDrawFig(p, fresh ? F_SITF : F_SITF_SHUT, d.pid, ox, fy - 16, put);
    if (fresh) fCoffee(p, ox, fy, t, put);
  }
  if (lvl) fDrawFig(p, F_RAISE, d.pid, ox - 1, fy - 14, put);
  // ponytail: 방에는 오리 3자리뿐이라 4명부터 3명 + "+N" (W는 5명부터 줄인다)
  const hop = (j) => Math.floor(t / 500 + j) % 2; // 일하는 오리가 번갈아 뛴다(반짝이도 따라간다)
  d.team.slice(0, 3).forEach((m, j) =>
    fDuck(
      p,
      R,
      x + F_DX + j * F_DP, // 오리 사이 간격 = 나중에 말풍선 자리
      fy,
      m.working,
      hop(j),
      put,
    ),
  );
  if (d.state === "resting" && !fresh)
    p.r(x, y, F_RW, 36, "rgba(30,18,40,0.22)"); // 휴식: 불을 낮춘다
  if (T.dim) p.r(x, y, F_RW, 36, T.dim);
  p.flush();
  for (const lx of lamps) fLamp(p, R, x + lx, y);
  for (const lx of lamps) fCone(p, R, x + lx, y, fy, x);
  if (d.state === "resting" && !fresh) fZzz(p, ox, fy, t);
  if (fresh) fBulbs(p, R, x + F_OX - 3, y, F_RW - F_OX + 3);
  if (lvl) {
    p.r(
      x,
      y,
      F_RW,
      36,
      // 방 전체 주황 덧칠: 0–5분 옅게 · 5–15분 짙게 · 15분+ 맥박
      fRgba("255,120,40", [0, 0.07, 0.14, 0.08 + 0.14 * beat][lvl]),
    );
  }
  p.flush(p.F);
  // Fable 반짝이: 팀장 자세별 그림 원점(위 p.s와 같은 자리). 기다림의 <[!]보다 먼저 그려 말풍선이 위에 온다
  if (isFable(d)) {
    if (d.state === "working") fSparkle(p, true, ox, fy - 15, t);
    else if (lvl) fSparkle(p, false, ox - 1, fy - 14, t);
    else fSparkle(p, false, ox, fy - 16, t);
  }
  // Fable 팀원(오리, T46): 오른쪽을 보는 옆모습이라 side 자리. 원점 = fDuck이 그린 오리 그림 원점
  d.team.slice(0, 3).forEach((m, j) => {
    if (m.working && isFable(m))
      fSparkle(p, true, x + F_DX + j * F_DP, fy - 10 - hop(j), t);
  });
  if (lvl) {
    // 올린 팔(ox+8~10) 바로 바깥, 얼굴 높이에 <[!]. 머리 위는 글 말풍선 자리다
    p.s(F_BANG, F_BANG_COLOR, ox + 11, fy - 13);
    // 나를 기다림 = 방 테두리 전체 빨강(선택은 슬래브 위 ▼라 겹치지 않는다).
    // 0–5분 1px · 5–15분 2px · 15분+ 2px 맥박
    const th = lvl === 1 ? 1 : 2;
    const c = fRgba("232,87,42", lvl === 3 ? 0.4 + 0.6 * beat : 1);
    p.r(x, y, F_RW, th, c);
    p.r(x, y + 36 - th, F_RW, th, c);
    p.r(x, y + th, th, 36 - 2 * th, c);
    p.r(x + F_RW - th, y + th, th, 36 - 2 * th, c);
  }
}
// 엘리베이터: 마지막으로 상태가 바뀐 팀의 층(cf)에 서 있다
function fShaft(p, T, EX, nF, cf) {
  const top = F_TOP;
  const bot = fFT(nF);
  p.r(EX, top, 14, bot - top, T.shaft);
  p.r(EX + 1, top, 1, bot - top, T.rail);
  p.r(EX + 12, top, 1, bot - top, T.rail);
  for (let yy = top + 2; yy < bot; yy += 8) {
    p.r(EX + 1, yy, 1, 1, T.cable);
    p.r(EX + 12, yy, 1, 1, T.cable);
  }
  for (let i = 1; i < nF; i++) p.r(EX, fFT(i), 14, 1, T.slabTop);
  const cy = fFT(cf) + F_SLAB;
  p.r(EX + 6, top, 2, cy - top, T.cable);
  p.r(EX + 1, cy, 12, 36, T.carDark);
  p.r(EX + 2, cy + 1, 10, 31, T.carIn);
  p.r(EX + 2, cy + 1, 10, 1, T.bulb);
  p.r(EX + 2, cy + 32, 10, 1, T.car);
  p.r(EX + 1, cy + 33, 12, 3, T.carDark);
  p.g(EX + 2, cy + 2, 10, 30, fRgba(T.light, 0.12 * T.k));
}
// 옥상 간판 (글자 OFFICE는 DOM)
function fSign(p, T, sx) {
  const sy = F_TOP - 24;
  const [dark, face, dot] = T.sign;
  p.r(sx - 2, sy - 2, 84, 20, fRgba(T.light, 0.12));
  p.r(sx + 6, sy + 16, 2, 3, dark);
  p.r(sx + 72, sy + 16, 2, 3, dark);
  p.r(sx, sy, 80, 16, dark);
  p.r(sx + 1, sy + 1, 78, 14, face);
  for (let x = sx + 2; x < sx + 79; x += 4) {
    p.r(x, sy + 2, 1, 1, dot);
    p.r(x, sy + 13, 1, 1, dot);
  }
}
function fTowerRects(tw, t, now) {
  const T = { ...F_DAY, ...(tw.night ? F_NIGHT : {}), k: 1 };
  const p = fMk();
  const { n, nF, W, G } = tw;
  const BW = 20 + F_PITCH * n;
  const EX = F_BX + 3 + F_PITCH * n;
  (tw.night ? fBgNight : fBgDay)(p, T, W, G);
  // 외벽(벽돌 줄눈)과 파라펫
  p.r(F_BX, F_TOP - 4, 3, G - F_TOP + 4, T.facade);
  p.r(F_BX + BW - 3, F_TOP - 4, 3, G - F_TOP + 4, T.facade);
  p.r(F_BX, F_TOP - 4, BW, 4, T.facade);
  for (let yy = F_TOP - 3; yy < G; yy += 3) {
    p.r(F_BX, yy, 3, 1, T.mortar);
    p.r(F_BX + BW - 3, yy, 3, 1, T.mortar);
  }
  p.r(F_BX, F_TOP - 2, BW, 1, T.mortar);
  p.r(F_BX - 1, F_TOP - 5, BW + 2, 1, T.cap);
  tw.stories.forEach(({ teams, f }, i) => {
    const y = fFT(i) + F_SLAB;
    for (let c = 0; c < n; c++) {
      const x = F_BX + 3 + c * F_PITCH;
      // 같은 층(폴더)의 단은 같은 벽 색
      // 변주 번호 (층 + 2 × 칸) mod 4: 옆방·위아래 방이 늘 다른 모양
      fRoom(
        p,
        T,
        T.walls[f % T.walls.length],
        teams[c],
        x,
        y,
        t,
        now,
        i + 2 * c,
      );
      p.r(x + F_RW, y, 2, 36, T.facade); // 방 사이 벽
    }
    p.r(EX - 2, y + 20, 2, 2, T.callBtn);
  });
  for (let i = 0; i <= nF; i++) {
    p.r(F_BX, fFT(i), BW, F_SLAB, T.slab);
    p.r(F_BX, fFT(i), BW, 1, T.slabTop);
    p.r(F_BX, fFT(i) + F_SLAB - 1, BW, 1, T.slabDark);
  }
  fShaft(p, T, EX, nF, tw.car);
  p.flush();
  fSign(p, T, tw.signX);
  p.s(F_CAT, { k: T.cat, e: F_OUT }, F_BX + 8, F_TOP - 11); // 마스코트(DESIGN.md §1 예외)
  p.r(F_BX, F_TOP - 4, 1, G - F_TOP + 4, T.edge); // 밤: 외벽 가장자리 달빛
  if (tw.night) fStreetLamp(p, T, W - 8, 0.22, G);
  return p.R;
}
// 링크 오브젝트(.tw-obj.tw-chip, 배율과 무관한 px 크기). artifact = 노란 키캡 [A](6×6, 1칸 = 2px).
// PR·Jira = 번호 칩: 판 위에 도트 심볼(5행, 1칸 = 2px)과 글자 번호
// PR 심볼 = 초록 Y(사용자 그림: 가지 둘 + 줄기), Jira 심볼 = 사용자 티켓(4×3칸)을 한 칸 1 art px로 줄인 것: 가운데 줄 양 끝이 홈, 셋째 칸 위아래가 흰 사각형
const F_LINK = {
  PR: ["g.g", "g.g", ".g.", ".g.", ".g."],
  Jira: ["bbwb", "bbwb", "pbbp", "bbwb", "bbwb"],
  // 테두리 없이 노란 키 위에 A를 그린다(6폭에 테두리를 두르면 A의 다리가 테두리에 붙어 안 읽힌다). 맨 아래 줄은 키 그림자
  artifact: ["yyyyyy", "yyaayy", "yayyay", "yaaaay", "yayyay", "dddddd"],
};
const F_LINK_COLOR = {
  PR: { g: "#5fc97e" },
  Jira: { p: "#f4f1ea", b: "#3e7bd6", w: "#ffffff" }, // p = 홈 = 칩 판 색
  artifact: { y: "#f2c14e", a: F_OUT, d: "#b8862a" },
};
// 칩 번호: PR은 라벨("PR #317")의 #번호, Jira는 키(PROJ-311) 그대로. short(줄이 모자람)면 Jira는 번호만(311)
const chipText = (l, short) =>
  (l.kind === "PR"
    ? (l.label.match(/#\d+/)?.[0] ?? "#")
    : short
      ? l.label.split("-").pop()
      : l.label
  ).toUpperCase();
// 낮·밤 스위치 손잡이(T30): 해 = 노란 네모 해와 빛살 8줄기, 밤 = 부엉이(T32: 달은 건물 하늘의 달과 겹친다). 8×8, 1칸 = 2px(16px)
const F_SUN = [
  "...rr...",
  ".r....r.",
  "..yyyy..",
  "r.yyyy.r",
  "r.yyyy.r",
  "..yyyy..",
  ".r....r.",
  "...rr...",
];
// 부엉이: 귀깃 · 흰 눈과 검은 눈동자 · 노란 부리 · 밝은 배 · 발
const F_OWL = [
  "b......b",
  "bbbbbbbb",
  "bwwbbwwb",
  "bwkbbkwb",
  "bbbyybbb",
  ".bccccb.",
  ".bccccb.",
  "..y..y..",
];
export const knobsSvg = () =>
  `<span class="sun">${gridSvg(F_SUN, { y: "#ffd23f", r: "#f2a516" }, 16)}</span>` +
  `<span class="owl">${gridSvg(F_OWL, { b: "#9a7550", w: "#fffaf0", k: "#2a1d1a", y: "#f2c14e", c: "#c9a77a" }, 16)}</span>`;

// 칩 글자 폭을 재는 캔버스(그리지 않는다)
const chipCtx = document.createElement("canvas").getContext("2d");

const F_BANG_COLOR = { O: F_OUT, W: "#fffaf0", A: "#e8572a" };

// 펼친 팀장 말풍선 2줄: ① 방금 한 말 ② 지금 동작(bubble: 작업 중 = 도구 설명, 기다림 = 무엇을 기다리는지).
// 명령 원문(최근 활동)은 읽기 어려워 쓰지 않는다. 방금 끝남은 결과 한 줄뿐이다. 같은 줄은 한 번만
function leadLines(d) {
  const act = d.state === "resting" ? null : d.bubble;
  const lines = [...new Set([d.said ?? d.bubble, act].filter(Boolean))];
  return lines.length ? lines : [d.doing];
}

// 캐릭터 그림(지하층 목록·하단 초상화). 미리 정해 둔 그림 문자열만 넣는다(세션 데이터는 섞지 않는다)
export function ph(size, kind, state = "working", seed = 0, fable = false) {
  const s = el("span", `fig ${kind === "팀원" ? "chick" : "person"} ${state}`);
  s.innerHTML = pixelFigF(kind, state, size, seed, fable);
  return s;
}

// 값이 같으면 쓰지 않는다(setAttr·setClass와 같은 이유)
const setStyle = (e, k, v) => {
  if (e.style[k] !== v) e.style[k] = v;
};

// 층 = 폴더(이름순), 층 안의 팀 = 처음 나타난 순서(pid). 위치가 바뀌는 건 휴면 ↔ 활성 이동뿐
const floorGroups = (active) =>
  [...Map.groupBy(active, (d) => d.zone)]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([zone, ds]) => [zone, ds.sort((a, b) => a.pid - b.pid)]);
const lastMove = (d) =>
  Math.max(d.since ?? 0, ...d.activity.map((a) => a.at || 0));

const still = matchMedia("(prefers-reduced-motion: reduce)");
let canvas = null; // 내용은 방 버튼의 aria-label과 칠판 글자로 읽힌다
let towerF = null; // renderTower가 정한 배치. 움직임은 paintTower가 canvas만 다시 칠한다

export function paintTower(t) {
  if (!towerF) return;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(towerF.px, 0, 0, towerF.px, 0, 0);
  for (const [x, y, w, h, c] of fTowerRects(towerF, t, Date.now())) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  }
}

// root = #floors. view = { desks, events, sel, night, now }
export function renderTower(root, { desks, events, sel, pick, night, now }) {
  const groups = floorGroups(desks.filter((d) => d.state !== "dormant"));
  if (!groups.length) {
    towerF = null;
    // 터미널이 하나도 없으면 지하층도 비어 있어 "모두 지하층"이 틀린 말이 된다(T53)
    const msg = desks.length
      ? "일하는 팀 없음 · 모두 지하층(휴면)에 있다"
      : "일하는 팀 없음 · 떠 있는 Claude Code 터미널이 없다";
    return sync(
      root,
      ["empty"],
      (k) => k,
      () => el("p", "empty pad"),
      (p) => setText(p, msg),
    );
  }
  // 층 = 폴더. 한 단에 방 F_COLS개까지, 팀이 더 많은 폴더는 여러 단을 쓴다. 층 라벨은 첫 단에만
  const stories = groups.flatMap(([zone, ds], f) =>
    Array.from({ length: Math.ceil(ds.length / F_COLS) }, (_, r) => ({
      zone,
      f,
      no: groups.length - f,
      first: r === 0,
      teams: ds.slice(r * F_COLS, (r + 1) * F_COLS),
    })),
  );
  const n = Math.min(F_COLS, Math.max(...groups.map(([, ds]) => ds.length))); // 칸 수
  const nF = stories.length; // 단 수
  const W = 52 + F_PITCH * n;
  const G = fFT(nF) + F_SLAB; // 땅 y
  const H = G + 10;
  // 배율은 남는 공간을 실제로 재서 고른다. 폭 = 좌우 padding을 뺀 것,
  // 높이 = 건물 위쪽(머리) 위치·지하층 머리·아래 padding을 뺀 것. 그래서 건물 아래가 비지 않는다
  const office = root.closest("#office");
  const cs = getComputedStyle(office);
  const top =
    root.getBoundingClientRect().top -
    office.getBoundingClientRect().top +
    office.scrollTop;
  const bhead = office.querySelector("#basement .bhead")?.offsetHeight ?? 0;
  const S = pickScale({
    availW:
      office.clientWidth -
      parseFloat(cs.paddingLeft) -
      parseFloat(cs.paddingRight),
    availH: office.clientHeight - top - bhead - parseFloat(cs.paddingBottom),
    W,
    H,
    dpr: devicePixelRatio,
  });
  const dpr = Math.max(1, Math.round(devicePixelRatio));
  // 칩 폭(art px) = 글자 폭을 재서 css px로 더한 뒤 S로 나눈다. 여백·간격·심볼 크기는 style.css .tw-obj.tw-chip과 같은 값.
  // 글꼴이 늦게 오면(font-display: swap) 다음 폴링(1초)에 다시 재서 맞춰진다
  const bs = getComputedStyle(document.body);
  chipCtx.font = `700 ${bs.getPropertyValue("--fs-ui-sm")} ${bs.getPropertyValue("--font-ui-sm")}`;
  const linkW = (l, short) =>
    l.kind === "artifact"
      ? Math.ceil(12 / S) // 키캡 6×6을 1칸 = 2px로(칩과 같은 크기)
      : Math.ceil(
          (3 +
            F_LINK[l.kind][0].length * 2 +
            3 +
            chipCtx.measureText(chipText(l, short)).width +
            3) /
            S,
        );
  const floorOf = (pid) =>
    stories.findIndex((s) => s.teams.some((d) => d.pid === pid));
  const last = events
    .filter((e) => floorOf(e.pid) >= 0)
    .sort((a, b) => b.at - a.at)[0];
  const signX = F_BX + Math.floor((20 + F_PITCH * n) / 2) - 40;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
  }
  towerF = {
    stories,
    n,
    nF,
    W,
    G,
    signX,
    night,
    px: S * dpr,
    car: last ? floorOf(last.pid) : 0,
  };
  if (canvas.width !== W * S * dpr || canvas.height !== H * S * dpr) {
    canvas.width = W * S * dpr;
    canvas.height = H * S * dpr;
  }
  setStyle(canvas, "width", `${W * S}px`);
  setStyle(canvas, "height", `${H * S}px`);

  let box;
  sync(
    root,
    ["tw"],
    (k) => k,
    () => {
      const b = el("div", "tw");
      b.append(canvas); // key 없는 자식이라 sync가 맨 앞에 그대로 둔다
      return b;
    },
    (b) => {
      box = b;
    },
  );
  if (box.dataset.s !== String(S)) {
    box.dataset.s = S;
    box.style.setProperty("--s", S);
  }
  const at = (e, x, y, w, h) => {
    setStyle(e, "left", `${x * S}px`);
    setStyle(e, "top", `${y * S}px`);
    if (w) {
      setStyle(e, "width", `${w * S}px`);
      setStyle(e, "height", `${h * S}px`);
    }
  };

  const items = [
    {
      key: "sign",
      make: () => el("span", "tw-sign", "OFFICE"),
      update: (e) => at(e, signX, F_TOP - 24, 80, 16),
    },
  ];
  stories.forEach(({ zone, no, first, teams }, i) => {
    if (first)
      items.push({
        key: `tag:${zone}:${no}`,
        make: () => el("span", "tw-tag"),
        update: (e) => {
          setText(e, `${no}F · ${zone}`);
          at(e, F_BX + 5, fFT(i));
        },
      });
    teams.forEach((d, c) => {
      const x = F_BX + 3 + c * F_PITCH;
      const y = fFT(i) + F_SLAB;
      const fresh = d.state === "resting" && now - d.since < FRESH_MS;
      const note = fresh ? "방금 끝남" : boardNote(d, now);
      items.push({
        key: `room:${d.pid}`,
        make: () => {
          const b = el("button", "tw-room");
          b.type = "button";
          b.dataset.pid = d.pid;
          return b;
        },
        update: (b) => {
          setAttr(b, "aria-pressed", String(d.pid === sel));
          // 펼친 집계 칸(pick)과 같은 상태인 방은 흰 점선(T49)
          setClass(b, `tw-room${d.state === pick ? " picked" : ""}`);
          setAttr(
            b,
            "aria-label",
            `${d.title} · ${fresh ? note : `${NAME[d.state]} · ${note}`}${isFable(d) ? " · Fable" : ""}`,
          );
          at(b, x, y, F_RW, 36);
        },
      });
      // 칠판 = 상태판: 팀 이름 · 상태와 경과 · 현재 활동 · 링크 칩과 branch
      items.push({
        key: `board:${d.pid}`,
        // 팀 이름 · 상태와 경과 · 내가 방금 보낸 요청 첫 줄. 지금 하는 일은 팀장 말풍선, 링크는 칠판 아래, branch는 하단 상세
        // 누르면 그 세션이 도는 터미널을 앞으로 가져온다(ADR 0003, app.mjs focus). 방 선택은 칠판 밖을 누른다
        make: () => {
          const b = el("button");
          b.type = "button";
          b.dataset.action = "focus";
          b.dataset.pid = d.pid;
          b.append(el("b"), el("span", "st"), el("span", "q"));
          return b;
        },
        update: (b) => {
          setClass(b, `tw-board ${d.state}`);
          setAttr(b, "aria-label", `${d.title} · 터미널로 이동`);
          const [t, st, q] = b.children;
          setText(t, d.title);
          setText(st, note);
          setText(q, d.lastPrompt ? firstLine(d.lastPrompt) : "");
          at(b, x + 4, y + 4, F_BW - 2, 18);
        },
      });
      // 칠판 아래 벽의 링크 오브젝트: PR·Jira = 번호 칩(y+25~31), artifact = [A](y+26~31).
      // 위치는 layoutLinks가 정한다. 줄은 LINK_ROW_MAX(80) 안이라 팀장 의자(x+F_OX) 앞에서 끝나고, 넘치는 칩은 종류별 +N
      for (const c of layoutLinks(d.links ?? [], linkW)) {
        const sx = x + 3 + c.x;
        if (c.more) {
          items.push({
            key: `objmore:${d.pid}:${c.kind}`,
            make: () => el("span", "tw-objmore"),
            update: (e) => {
              setText(e, `+${c.more}`);
              at(e, sx, y + 26, c.w, 6);
            },
          });
          continue;
        }
        const l = c.link;
        const live = /^https?:\/\//.test(l.url ?? "");
        items.push({
          key: `obj:${d.pid}:${c.kind}:${l.label}:${live ? 1 : 0}:${c.short ? 1 : 0}`,
          make: () => {
            const chip = c.kind !== "artifact";
            const a = linkEl(l, `tw-obj tw-chip ${c.kind}`);
            a.innerHTML = gridSvg(
              F_LINK[c.kind],
              F_LINK_COLOR[c.kind],
              chip ? 10 : 12,
            );
            if (chip) a.append(el("span", "", chipText(l, c.short)));
            return a;
          },
          update: (a) => {
            setAttr(a, "title", l.label);
            setAttr(a, "aria-label", l.label);
            // 칩·키캡은 화면 px 크기라 폭·높이를 주지 않고 오브젝트 줄(y+25~32) 가운데에 세로 중앙을 맞춘다
            at(a, sx, y + 28.5);
          },
        });
      }
      if (d.team.length > 3)
        items.push({
          key: `more:${d.pid}`,
          make: () => el("span", "tw-more"),
          update: (e) => {
            setText(e, `+${d.team.length - 3}`);
            at(e, x + F_DX + 2 * F_DP + 18, y + 25); // 셋째 오리 노트북(+15) 바로 뒤
          },
        });
      // 오리 말풍선: 일하는 오리 머리 위. 원본처럼 머리(오리 x + 4, 위 끝 y + 23)보다 3 art px 왼쪽·4 art px 위가 말풍선 왼쪽 아래다.
      // 퇴근한 오리는 눈 감은 모습으로 충분해서 붙이지 않는다
      d.team.slice(0, 3).forEach((m, j) => {
        if (!m.working || !m.doing) return;
        items.push({
          key: `bub:${d.pid}:${j}`,
          make: () => {
            const s = el("span", "tw-bub");
            s.append(el("span"));
            return s;
          },
          update: (s) => {
            setText(s.firstChild, m.doing);
            at(s, x + F_DX + 1 + j * F_DP, y + 19);
            // 접힌 팀장 말풍선(z 1)과 맞닿을 때 더 최근에 말한 쪽이 위(T44)
            const newer = (m.lastEventAt ?? 0) > (d.lastEventAt ?? 0);
            setStyle(s, "zIndex", newer ? "2" : "");
          },
        });
      });
      // 팀장 말풍선 = 세션 본류 엿보기. 접힘은 지금 동작 1줄(T44: 10자 doing 대신 긴 bubble, 없으면 doing),
      // 방을 누르면 방금 한 말과 지금 동작 2줄로 펼친다. 휴식·휴면(doing 없음)은 말풍선 없이 모션만
      if (d.doing) {
        const open = d.pid === sel;
        const lines = open ? leadLines(d) : [d.bubble ?? d.doing];
        items.push({
          key: `lead:${d.pid}`,
          make: () => {
            const box = el("div", "tw-lead");
            const bub = el("span", "tw-bub lead");
            bub.append(el("span"), el("span"));
            box.append(bub);
            return box;
          },
          update: (box) => {
            setClass(box, `tw-lead${open ? " open" : ""}`);
            setStyle(box, "zIndex", open ? "3" : "1"); // 펼침은 늘 맨 위
            const [l1, l2] = box.firstChild.children;
            setText(l1, lines[0]);
            setText(l2, lines[1] ?? "");
            l2.hidden = !lines[1];
            // 왼쪽 = 머리 왼쪽 끝(ox = x+F_OX), 칠판 틀 끝(x+3+F_BW)과 띄운다. 접힘: 아래 끝 y+11은 오리 말풍선 줄(y+12~) 위라 겹치지 않는다.
            // 펼침: 글자(9px)는 배율과 무관해 두 줄 높이가 S=2에서 12 art px까지 커진다. 아래 끝을 고정하면 천장(y+0~2)을 뚫으므로
            // 위 끝을 천장 아래 y+4(외곽선 y+3)에 고정하고 아래로 자란다
            at(box, x + F_OX, open ? y + 4 : y + 11);
          },
        });
      }
    });
  });
  sync(
    box,
    items,
    (it) => it.key,
    (it) => it.make(),
    (node, it) => it.update(node),
  );
  paintTower(still.matches ? 0 : performance.now());
}

// root = #basement. 지하층 = 휴면만 모은 곳. 기본 접힘. 답 대기(24시간 넘은 질문)는 접혀 있어도 머리에서 따로 센다
export function renderBasement(root, { desks, sel, pick, baseOpen, now }) {
  const sleeping = desks
    .filter((d) => d.state === "dormant")
    .sort((a, b) => lastMove(b) - lastMove(a));
  const open = baseOpen ?? !desks.some((d) => d.state !== "dormant");
  const waitN = sleeping.filter((d) => d.staleDays).length;
  const items = [
    {
      key: "bhead",
      make: () => {
        const h = el("button", "bhead");
        h.type = "button";
        h.dataset.action = "base";
        h.append(el("span"), el("span", "bwait"));
        return h;
      },
      update: (h) => {
        // 휴면은 건물에 방이 없어 지하층 머리에 흰 점선(T49)
        setClass(h, `bhead${pick === "dormant" ? " picked" : ""}`);
        setAttr(h, "aria-expanded", String(open));
        setText(
          h.children[0],
          `${open ? "▾" : "▸"} 지하층 · 휴면 ${sleeping.length}`,
        );
        setText(h.children[1], waitN ? `그중 답 대기 ${waitN}` : "");
      },
    },
  ];
  if (open)
    items.push({
      key: "brows",
      make: () => el("div", "brows"),
      update: (list) =>
        sync(
          list,
          sleeping,
          (d) => d.pid,
          (d) => {
            const b = el("button");
            b.type = "button";
            b.dataset.pid = d.pid;
            const who = el("span", "who");
            who.append(el("b"), el("span"));
            b.append(
              ph(28, "팀장", "dormant"),
              who,
              el("span"),
              el("span", "blast"),
            );
            return b;
          },
          (b, d) => {
            setClass(b, `brow${d.pid === sel ? " sel" : ""}`);
            const [, who, age, blast] = b.children;
            setText(who.children[0], d.title);
            setText(who.children[1], d.zone);
            setClass(age, d.staleDays ? "bage hot" : "bage");
            setText(age, boardNote(d, now));
            setText(
              blast,
              d.lastPrompt ? firstLine(d.lastPrompt) : "마지막 요청 없음",
            );
          },
        ),
    });
  sync(
    root,
    items,
    (it) => it.key,
    (it) => it.make(),
    (node, it) => it.update(node),
  );
}
