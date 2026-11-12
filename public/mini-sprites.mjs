// 미니 모드 아바타(시안 C · 둥둥 얼굴): wireframes/mini-mode-mock.dc.html의 픽셀 데이터를 옮겨 적었다.
// 큰 머리 14×12 + 표정, 머리 모양 덮개, 상태 소품(노트북·커피·손·깃발), 팀원 병아리. 색은 큰 창과 같은 fPerson(pid).
// 좌표는 전부 art px(1 art px = 2 css px). 머리 원점이 (0,0)이고 왼쪽 12칸은 병아리, 위 2칸은 손·깃발 자리.
import { F_PEOPLE, fPerson } from "./tower.mjs";

const OUT = "#2a1d1a";
const SHADOW = "rgba(42,29,26,0.25)";
const CREAM = "#fffaf0";
const FACE = { W: "#ffffff", B: "#f4a093", M: "#7a3a3a" }; // 흰자·볼·입(시안 pal)

const HEAD_TOP = [
  "....OOOOOO....",
  "..OOHHHHHHOO..",
  ".OHHHHHHHHHHO.",
  "OHHHHHHHHHHHHO",
  "OHHHSHHHHSHHHO",
  "OHSSSSSSSSSSHO",
];
const HEAD_BOT = ["..OOSSSSSSOO..", "....OOOOOO...."];
const EYES = {
  open: ["OSSEWSSSSEWSSO", "OSSEESSSSEESSO"],
  closed: ["OSSSSSSSSSSSSO", "OSSEESSSSEESSO"],
  happy: ["OSSSESSSSESSSO", "OSSESESSESESSO"],
};
const MOUTH = {
  flat: ["OSBBSSMMSSBBSO", ".OSSSSSSSSSSO."],
  smile: ["OSBBSMSSMSBBSO", ".OSSSSMMSSSSO."],
  open: ["OSBBSSMMSSBBSO", ".OSSSSMMSSSSO."],
};
const EXPR = {
  idle: ["closed", "smile"],
  work: ["open", "flat"],
  alert: ["open", "open"],
  done: ["happy", "smile"],
};
const headRows = (st) => {
  const [e, m] = EXPR[st] ?? EXPR.idle;
  return [...HEAD_TOP, ...EYES[e], ...MOUTH[m], ...HEAD_BOT];
};

// 큰 머리용 덮개(시안 HAIR). 키는 F_PEOPLE[i][5]와 같다
const HAIR = {
  long: {
    dx: -1,
    dy: 5,
    rows: [
      "OHO..........OHO",
      "OHO..........OHO",
      "OHO..........OHO",
      "OHO..........OHO",
      "OHO..........OHO",
      "OHO..........OHO",
      "OHO..........OHO",
      "OHO..........OHO",
      ".O............O.",
    ],
  },
  bob: {
    dx: -1,
    dy: 4,
    rows: [
      ".OHHHHHHHHHHHHO.",
      "OHO..........OHO",
      "OHO..........OHO",
      "OHO..........OHO",
      "OHO..........OHO",
      "OHO..........OHO",
      ".O............O.",
    ],
  },
  twin: {
    dx: -3,
    dy: 3,
    rows: [
      "..TT............TT..",
      "OHHO............OHHO",
      "OHHO............OHHO",
      "OHhO............OhHO",
      "OHhO............OhHO",
      "OHHO............OHHO",
      "OHHO............OHHO",
      ".OO..............OO.",
    ],
  },
  perm: {
    dx: -1,
    dy: -1,
    rows: [
      "...O.OO..OO.O...",
      "..OHOHHOOHHOHO..",
      ".OHhHHHHHHHHhHO.",
      "OHHHhHHHHHHhHHHO",
      "",
      "",
      "OHO..........OHO",
      "OHO..........OHO",
      "OHO..........OHO",
      "OHO..........OHO",
      "OHO..........OHO",
      ".O............O.",
    ],
  },
};

const SPK = [".w.", "wYw", ".w."];
const SPK_COLOR = { w: "#fff6c8", Y: "#ffd75e" };
const CHICK = [
  "..OOO..",
  ".OyyyO.",
  ".OyyEOb",
  "OyyyyyO",
  "OyvvyyO",
  ".OOOOO.",
  "..b.b..",
];
const CHICK_COLOR = {
  O: OUT,
  y: "#ffd75e",
  v: "#f2b43a",
  b: "#f2a03d",
  E: OUT,
};
const PLUS = ["...", ".w.", "www", ".w.", "..."];
const DIG = {
  1: [".w.", "ww.", ".w.", ".w.", "www"],
  2: ["ww.", "..w", ".w.", "w..", "www"],
  3: ["ww.", "..w", ".w.", "..w", "ww."],
  4: ["w.w", "w.w", "www", "..w", "..w"],
  5: ["www", "w..", "ww.", "..w", "ww."],
  6: ["ww.", "w..", "www", "w.w", "www"],
  7: ["www", "..w", ".w.", ".w.", ".w."],
  8: ["www", "w.w", "www", "w.w", "www"],
  9: ["www", "w.w", "www", "..w", "ww."],
};
const WHITE = { w: "#ffffff" };

// ── 사각형 → SVG ──
const R = (x, y, w, h, c, cls = "") =>
  w > 0 && h > 0 && c
    ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"${cls ? ` class="${cls}"` : ""}/>`
    : "";
// 글자 격자를 가로 run으로 묶어 사각형으로. '.'과 팔레트에 없는 글자는 비운다
function rows(grid, pal, ox, oy, cls = "") {
  let out = "";
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !pal[ch]) {
        x++;
        continue;
      }
      let e = x;
      while (e < row.length && row[e] === ch) e++;
      out += R(ox + x, oy + y, e - x, 1, pal[ch], cls);
      x = e;
    }
  });
  return out;
}

// ── 상태 소품(머리 원점 기준) ──
const laptop = () =>
  R(2, 5, 10, 4, "rgba(120,190,255,0.28)") + // 얼굴에 비치는 화면 빛
  R(0, 9, 14, 7, OUT) +
  R(1, 10, 12, 5, "#c9c3ba") +
  R(1, 10, 12, 1, "#e6e1d8") +
  R(6, 12, 2, 1, CREAM);
const coffee = (skin) =>
  R(13, 8, 6, 6, OUT) +
  R(14, 9, 4, 4, CREAM) +
  R(14, 9, 4, 1, "#8a5432") +
  R(19, 10, 1, 2, OUT) +
  R(12, 12, 4, 3, OUT) +
  R(13, 13, 2, 1, skin) +
  R(15, 5, 1, 2, "rgba(255,255,255,0.85)", "tw") +
  R(16, 3, 1, 2, "rgba(255,255,255,0.85)", "tw b"); // 김
const raiseHand = (skin) =>
  R(14, 1, 4, 7, OUT) +
  R(15, 2, 2, 5, skin) +
  R(-2, 4, 1, 1, "#7cc6e4") +
  R(-3, 5, 3, 2, "#7cc6e4") +
  R(-3, 5, 1, 1, "#ffffff"); // 땀방울
const flag = (skin) =>
  R(15, -1, 1, 13, "#5a5350") +
  R(16, -1, 5, 5, OUT) +
  R(16, 0, 4, 3, "#4fa86a") +
  R(17, 1, 1, 1, "#ffffff") +
  R(18, 2, 1, 1, "#ffffff") +
  R(19, 0, 1, 2, "#ffffff") + // 체크
  R(14, 8, 3, 3, OUT) +
  R(15, 9, 1, 1, skin);
const PROP = {
  work: () => laptop(),
  idle: (p) => coffee(p.S),
  alert: (p) => raiseHand(p.S),
  done: (p) =>
    flag(p.S) +
    rows(SPK, SPK_COLOR, -4, 1, "tw") +
    rows(SPK, SPK_COLOR, -3, 9, "tw b"),
};

// 병아리 한 마리(팀원) + 둘 이상이면 머리 위 "+N"(N = 나머지, 최대 9)
function chicks(n) {
  let s = rows(CHICK, CHICK_COLOR, -10, 10);
  if (n > 1) {
    s += R(-11, 3, 7, 1, OUT) + R(-12, 4, 9, 5, OUT) + R(-11, 9, 7, 1, OUT);
    s +=
      rows(PLUS, WHITE, -11, 4) + rows(DIG[Math.min(n - 1, 9)], WHITE, -7, 4);
  }
  return s;
}

export const BOX = [-13, -2, 40, 22]; // viewBox(art px). 칸 80×44 css px
// state = mini-model의 avatarState 값. chicks = 일하는 팀원 수. fable은 자리만 둔다(큰 창의 반짝이는 미니에서 생략)
export function avatarSvg({ seed, state, chicks: n = 0, fable = false }) {
  const p = { ...fPerson(seed), ...FACE };
  const hair = HAIR[F_PEOPLE[seed % F_PEOPLE.length][5]];
  const [bx, by, bw, bh] = BOX;
  let g = rows(headRows(state), p, 0, 0);
  if (hair) g += rows(hair.rows, p, hair.dx, hair.dy);
  g += (PROP[state] ?? PROP.idle)(p);
  void fable;
  return (
    `<svg viewBox="${bx} ${by} ${bw} ${bh}" width="${bw * 2}" height="${bh * 2}" shape-rendering="crispEdges" aria-hidden="true">` +
    `<g class="shadow">${R(1, 19, 12, 1, SHADOW)}${n ? R(-9, 17, 6, 1, SHADOW) : ""}</g>` +
    `<g class="bob">${g}</g>` +
    (n ? `<g class="chick">${chicks(n)}</g>` : "") +
    `</svg>`
  );
}

// 본부(허브) 엠블럼: 앱 아이콘 시안 A의 26×26 빌딩(노을 하늘 + 3층 단면). 1 art px = 2 css px → 52×52
const TOWER_PAL = { k: "#2d1e3f", m: "#5f3058", p: "#a84f60", o: "#e57f5c", g: "#f6bd6c", Y: "#ffe6a6", O: "#2a1d1a", F: "#9a4a3a", S: "#3d2a2c", W: "#ffd27a", V: "#f2b45a", L: "#fff6c8", H: "#3b2a24", s: "#f6c9a4", c: "#e07a4f", C: "#6e4128", E: "#c9a66b", K: "#2a2024", G: "#3b3440", R: "#ff6a5a" };
const TOWER = ["..kkkkkkkkkkkkkkkkkkkkkk..", ".kkkkkkkkkkkkkkkkkkkkkkkk.", "kkkkkkkkRkkkkkkkkkkkkkkkkk", "kkkkkkkkOkkkkkkkkkkkkkYkkk", "kkkkkkkkOkkkkkkkkkkkkYYYkk", "mmmmmOOOOOOOOOOOOOOOOmYmmm", "mmmmmOFFFFFFFFFFFFFFOmmmmm", "mmmmmOSSSSSSSSSSSSSSOmmmmm", "mmmmmOFWWLWWWWLWWFKFOmmmmm", "mmmmmOFWWWWWWWWWWFKFOmmmmm", "pppppOFVVVVVVVVVVFKFOppppp", "pppppOFVVVVVVVVVVFKFOppppp", "pppppOSSSSSSSSSSSSSSOppppp", "pppppOFWWHHHHHHWWFEFOppppp", "pppppOFWWHssssHWWFEFOppppp", "oooooOFVVsOssOsVVFEFOooooo", "oooooOFVVVccccVVVFEFOooooo", "oooooOSSSSSSSSSSSSSSOooooo", "oooooOFWWLWWWWLWWFKFOooooo", "oooooOFWWWWWWWWWWFKFOooooo", "gggggOFVCCVVVVCCVFKFOggggg", "gggggOFVCCVVVVCCVFKFOggggg", "gggggOSSSSSSSSSSSSSSOggggg", "GGGGGGGGGGGGGGGGGGGGGGGGGG", ".GGGGGGGGGGGGGGGGGGGGGGGG.", "..GGGGGGGGGGGGGGGGGGGGGG.."];
export function towerSvg(size = 52) {
  return `<svg viewBox="0 0 26 26" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${rows(TOWER, TOWER_PAL, 0, 0)}</svg>`;
}
