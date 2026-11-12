// 화면 공통: 상태 이름, 시간 글자, 로그 문구, 링크 칩. wireframes/office-v2.html에서 옮겼다
import { el, setText, sync } from "./dom.mjs";

// [키, 이름, 설명]. 사용자가 말한 대기 / 작업 / 작업완료 후 대기 = 나를 기다림 / 작업 중 / 휴식
export const STATES = [
  ["waiting", "나를 기다림", "답·승인해야 진행"],
  ["working", "작업 중", "턴 진행 또는 팀원 일하는 중"],
  ["resting", "휴식", "작업 끝내고 다음 지시 대기"],
  ["dormant", "휴면", "8시간 넘게 손 안 댐 · 지하층"],
];
export const NAME = Object.fromEntries(STATES);
export const REASON = {
  permission: "권한 승인",
  question: "질문 답변",
};
export const LOG_MS = 2 * 3600e3; // 로그는 최근 2시간만
export const FRESH_MS = 5 * 60e3; // 끝난 뒤 5분은 '방금 끝남'

export function dur(ms) {
  const m = Math.floor(ms / 60e3);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}시간` : `${Math.floor(h / 24)}일`;
}
export const elapsed = (t, now) =>
  dur(now - t) === "방금" ? "방금" : `${dur(now - t)}째`;
export const ago = (t, now) =>
  dur(now - t) === "방금" ? "방금" : `${dur(now - t)} 전`;
export const pad = (n) => String(n).padStart(2, "0");
export const hm = (t) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const hms = (t) => `${hm(t)}:${pad(new Date(t).getSeconds())}`;
export const mdhm = (t) => {
  const d = new Date(t);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm(t)}`;
};
export const firstLine = (s) => s.split("\n")[0];

export function eventText(e) {
  if (e.to === "gone") return "퇴근";
  if (e.to === "waiting")
    return `나를 기다림 · ${REASON[e.reason] ?? "답 필요"}`;
  if (e.to === "resting") return e.note ? `작업 끝남 · ${e.note}` : "작업 끝남";
  return e.from === "waiting" ? "다시 작업 (답 받음)" : "작업 시작";
}

// 링크(최신순)를 종류별로 줄인다: 칠판은 종류마다 최신 1개, 하단 상세는 최근 5개까지
export const latestLinks = (links) =>
  links.filter((l, i) => links.findIndex((x) => x.kind === l.kind) === i);
export const recentLinks = (links) =>
  links.filter(
    (l, i) => links.slice(0, i).filter((x) => x.kind === l.kind).length < 5,
  );

// 링크 칩. 주소가 있으면 새 탭 링크, 없으면(Jira 주소를 설정하지 않음) 글자만. box를 주면 그 안을 key로 맞춘다
export function chips(links, box = el("span", "chips")) {
  sync(
    box,
    links,
    (l) => `${l.kind}:${l.label}:${l.url ?? ""}`,
    (l) => linkEl(l, `lk ${l.kind}`),
    (a, l) => setText(a, l.label),
  );
  return box;
}

// 링크 하나. http(s) 주소가 있으면 새 탭 링크, 없으면(Jira 주소를 설정하지 않음) 누를 수 없는 span
export function linkEl(l, className) {
  const href = /^https?:\/\//.test(l.url ?? "") ? l.url : null;
  const a = el(href ? "a" : "span", className);
  if (href)
    Object.assign(a, { href, target: "_blank", rel: "noopener noreferrer" });
  return a;
}

// 건물 배율 S(1 art px = S css px). 남는 공간에 들어가는 가장 큰 값을 2~4에서 고른다.
// 단위는 1/dpr라서 art px 하나가 늘 장치 픽셀 정수개에 맞는다(dpr 2면 0.5 단위, dpr 1이면 정수)
export function pickScale({ availW, availH, W, H, dpr }) {
  const step = 1 / Math.max(1, Math.round(dpr));
  const fit = Math.floor(Math.min(availW / W, availH / H) / step) * step;
  return Math.max(2, Math.min(4, fit));
}

// 칠판 아래 오브젝트 줄(칠판 왼쪽에서 art px). 종류별로 PR·Jira·artifact 순, 안에서는 최신부터.
// 칸 사이 1, 종류 사이 2. 줄은 LINK_ROW_MAX(칠판 x+3 ~ 팀장 의자 x+85 앞 2칸)를 넘지 않는다.
// ① 종류마다 첫 칸은 꼭 넣는다. 글자 그대로(widthOf(link, false)) 안 들어가면 짧은 글자(widthOf(link, true))로
// ② 자리가 남으면 종류마다 번갈아 한 칸씩 더 넣고, 못 넣은 수는 그 종류 끝 "+N"(moreW)으로 센다
const LINK_KINDS = ["PR", "Jira", "artifact"];
export const LINK_ROW_MAX = 80;
export function layoutLinks(links, widthOf, moreW = 6) {
  const kinds = LINK_KINDS.map((k) => links.filter((l) => l.kind === k)).filter(
    (ls) => ls.length,
  );
  const place = (shown, short) => {
    let x = 0;
    const cells = [];
    kinds.forEach((ls, ki) => {
      if (ki) x += 2;
      const row = ls.slice(0, shown[ki]).map((link) => ({
        kind: link.kind,
        link,
        short,
        w: widthOf(link, short),
      }));
      if (ls.length > shown[ki])
        row.push({ kind: ls[0].kind, more: ls.length - shown[ki], w: moreW });
      row.forEach((c, i) => {
        if (i) x += 1;
        cells.push({ ...c, x });
        x += c.w;
      });
    });
    return { cells, end: x };
  };
  const grow = (shown, short) => {
    for (let grew = true; grew;) {
      grew = false;
      kinds.forEach((ls, ki) => {
        if (shown[ki] === ls.length) return;
        shown[ki]++;
        if (place(shown, short).end > LINK_ROW_MAX) shown[ki]--;
        else grew = true;
      });
    }
    return place(shown, short).cells;
  };
  for (const short of [false, true]) {
    const first = kinds.map(() => 1);
    if (place(first, short).end <= LINK_ROW_MAX) return grow(first, short);
  }
  // ponytail: 짧은 글자로도 첫 칸이 다 안 들어가는 경우(5자리 PR + 종류마다 +N 등)는 앞 종류부터 채우고 나머지는 +N만
  return grow(
    kinds.map(() => 0),
    true,
  );
}

// 하단 머리줄의 층 이름표. 건물(tower.mjs floorGroups)과 같은 순서다:
// 일하는 팀이 있는 폴더를 이름순으로 쌓고 위층이 큰 번호. 휴면은 지하(B1), 퇴근한 팀은 층이 없어 폴더만
export function floorTag(desks, d) {
  if (d.goneAt) return d.zone;
  if (d.state === "dormant") return `B1 · ${d.zone}`;
  const zones = [
    ...new Set(desks.filter((x) => x.state !== "dormant").map((x) => x.zone)),
  ].sort((a, b) => (a < b ? -1 : 1));
  return `${zones.length - zones.indexOf(d.zone)}F · ${d.zone}`;
}

export function boardNote(d, now) {
  if (d.state === "waiting")
    return `${dur(now - d.since)} 대기 · ${REASON[d.reason] ?? "답 필요"}`;
  if (d.state === "resting") return `${ago(d.since, now)} 끝남`;
  if (d.state === "dormant")
    return d.staleDays
      ? `${d.staleDays}일째 답 대기`
      : `${dur(now - d.since)}째 손 안 댐`;
  const n = d.team.length;
  const w = d.team.filter((m) => m.working).length;
  return n
    ? `${elapsed(d.since, now)} · 팀원 ${w}/${n} 진행 중`
    : elapsed(d.since, now);
}

// 글자 격자 그림(tower.mjs 스프라이트) 위에 덮개(머리 모양 등)를 겹친다. 덮개 왼쪽 위 칸은 그림의 (dx, dy).
// 덮개의 '.'과 빈 줄은 아래 그림이 그대로 보인다. 덮개가 왼쪽·위·오른쪽으로 나가면 그만큼 그림을 넓히고
// (그리는 곳은 원점을 min(0, dx), min(0, dy)만큼 옮긴다), 그림 아래로 넘친 덮개 줄은 버린다(발 아래는 바닥)
export function overlay(rows, dy, top, dx = 0) {
  const L = Math.max(0, -dx);
  const T = Math.max(0, -dy);
  const w = Math.max(L + rows[0].length, ...top.map((o) => L + dx + o.length));
  const grid = [
    ...Array(T).fill(".".repeat(w)),
    ...rows.map((r) => (".".repeat(L) + r).padEnd(w, ".")),
  ];
  return grid.map((r, y) => {
    const o = top[y - T - dy];
    if (!o) return r;
    return [...r]
      .map((c, x) => {
        const k = o[x - L - dx];
        return k && k !== "." ? k : c;
      })
      .join("");
  });
}
