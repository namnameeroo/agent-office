// 미니 모드의 순수 판정. DOM·tower.mjs를 import하지 않아 node --test에서 그대로 돈다.
// 서버 판정(state·bubble·full)은 그대로 받고, 어떤 세션을 어떤 순서로 띄우고 무엇을 보일지만 정한다.
import { FRESH_MS, firstLine, latestLinks } from "./common.mjs";

const ORDER = { waiting: 0, working: 1, resting: 2 };

// 휴면은 띄우지 않는다. 기다림(오래 기다린 순) → 작업 중 → 휴식. 같은 상태 안은 입력 순서
export function visibleDesks(desks, now) {
  return desks
    .map((d, i) => [d, i])
    .filter(([d]) => d.state in ORDER)
    .sort(([a, i], [b, j]) => {
      if (a.state !== b.state) return ORDER[a.state] - ORDER[b.state];
      if (a.state === "waiting") return a.since - b.since;
      return i - j;
    })
    .map(([d]) => d);
}

// 시안 C의 네 표정·소품: alert = 손 들기, work = 노트북, done = 깃발, idle = 커피
export function avatarState(d, now) {
  if (d.state === "waiting") return "alert";
  if (d.state === "working") return "work";
  return now - d.since < FRESH_MS ? "done" : "idle";
}

// 칸의 data-state(CSS가 상태 점·말풍선 테를 고른다): avatarState 값 그대로, alert만 waiting
export const stateAttr = (st) => (st === "alert" ? "waiting" : st);

// 큰 창 tower.mjs의 waitLevel과 같은 경계(5분·15분)
export const waitLevel = (ms) => (ms < 5 * 60e3 ? 1 : ms < 15 * 60e3 ? 2 : 3);

export const chickCount = (d) => (d.team ?? []).filter((t) => t.working).length;

// 말풍선 = 그 세션의 최근 응답, 늘 뜬다(미니 모드에서 최근 응답을 보는 유일한 길).
// 기다릴 땐 무엇을 승인·답할지(bubble), 그 밖엔 가장 최근에 한 말(said). 지금 돌리는 도구는 쪽지의 "지금"이 말한다
export const bubbleText = (d) =>
  (d.state === "waiting" ? d.bubble : (d.said ?? d.bubble)) ?? null;

export const canExpand = (d) =>
  bubbleText(d) != null && !!d.full && d.full !== bubbleText(d);

// 펼친 말풍선을 유지할지: 그 세션이 아직 보이고 펼칠 말풍선이 있을 때만. 사라지거나 작업 중으로 바뀌면 접는다
export function expandedAfter(expanded, list) {
  if (expanded == null) return null;
  const cur = list.find((d) => d.pid === expanded);
  return cur && canExpand(cur) ? expanded : null;
}

// 표지판: 왜 기다리는지(짧게). 얼마나 기다렸는지는 이름표가 말한다
const WHY = { permission: "승인", question: "질문" };
export const signText = (d) => WHY[d.reason] ?? "답 필요";

// 턴은 끝났고 백그라운드 명령(dev 서버 등)만 살아 있는 작업 중 세션(서버 background, Claude Code status "shell").
// 작업 중으로 두되 이름표 점을 빈 고리로, 쪽지 "지금"을 따로 말한다
export const isBackground = (d) => d.state === "working" && d.background === true;

// 올려두면 뜨는 쪽지: [라벨, 값] 줄. 큰 창을 열지 않고 "어디·뭘 시켰지·지금 뭐 하지"를 본다. 없는 값은 줄째 뺀다.
// 링크 줄의 값만 링크 객체 배열({ kind, label, url })이다 — 화면이 누를 수 있게 그린다
export function peekLines(d) {
  const where = [d.zone, d.worktree, d.branch]
    .filter((x, i, a) => x && a.indexOf(x) === i) // worktree 이름 = 브랜치 이름이면 한 번만
    .join(" · ");
  // activity는 최신순. 내용 없는 "생각"보다 내용이 있는 가장 최근 활동, 없으면 최신 것
  const acts = d.state === "working" ? (d.activity ?? []) : [];
  const act = acts.find((a) => a.detail) ?? acts[0];
  const now = isBackground(d)
    ? "백그라운드 명령만 실행 중"
    : act
      ? `${act.verb} ${act.detail ?? ""}`.trim()
      : "";
  const links = latestLinks(d.links ?? []);
  return [
    ["위치", where],
    ["요청", firstLine(d.lastPrompt ?? "").trim()],
    ["지금", now],
    ["링크", links.length ? links : ""],
  ].filter(([, v]) => v);
}

// ── 펼친 말풍선의 가벼운 마크다운 ──
// 글은 에이전트 출력이라 믿지 않는다: 여기서는 구조(토큰)만 만들고 DOM은 mini.mjs가 createElement·textContent로만 짓는다(innerHTML 없음).
// 블록: 문단(빈 줄로 나눔, 줄바꿈 유지) · 제목(# ~ ######) · 목록(- * + / 1. 1), 들여 쓴 다음 줄은 그 항목에 이어 붙임) ·
//   코드 블록(``` ~~~)과 표(|로 시작하는 줄)는 고정폭 글 그대로.
// 인라인: **굵게** · `코드` · [글](http(s) 주소) · 맨 http(s) 주소. http(s)가 아닌 링크는 원문 글자 그대로.
// ponytail: 기울임·인용·중첩 목록 들여쓰기·이미지·__굵게__(파이썬 __init__과 헷갈림)는 다루지 않는다 — 글자 그대로 보인다
const INLINE =
  /`([^`\n]+)`|\*\*(.+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[\w\-.~:/?#@!$&'*+,;=%]+)/g;
const isWeb = (u) => /^https?:\/\//.test(u); // linkEl(common.mjs)·메인 setWindowOpenHandler와 같은 기준

export function mdInline(s) {
  const out = [];
  const text = (v) => {
    if (!v) return;
    const last = out.at(-1);
    if (last?.t === "text") last.v += v;
    else out.push({ t: "text", v });
  };
  let at = 0;
  for (const m of s.matchAll(INLINE)) {
    const [all, code, bold, label, href, url] = m;
    text(s.slice(at, m.index));
    at = m.index + all.length;
    if (code != null) out.push({ t: "code", v: code });
    else if (bold != null) out.push({ t: "b", c: mdInline(bold) });
    else if (label != null) {
      if (isWeb(href)) out.push({ t: "a", v: label, href });
      else text(all);
    } else {
      const tail = /[.,;:!?'*]+$/.exec(url)?.[0] ?? ""; // 문장 끝 구두점은 주소가 아니다
      const u = url.slice(0, url.length - tail.length);
      out.push({ t: "a", v: u, href: u });
      text(tail);
    }
  }
  text(s.slice(at));
  return out;
}

// → [{ type: "p"|"h", inline } | { type: "ul"|"ol", start, items: [inline] } | { type: "pre", text }]
export function mdBlocks(src) {
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let open = null; // 다음 줄을 이어 붙일 블록(문단·목록·표)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const body = [];
      while (++i < lines.length && !lines[i].trimStart().startsWith(fence[1]))
        body.push(lines[i]);
      out.push({ type: "pre", text: body.join("\n") });
      open = null;
      continue;
    }
    if (!line.trim()) {
      open = null;
      continue;
    }
    const h = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      out.push({ type: "h", text: h[1] });
      open = null;
      continue;
    }
    const li = /^\s*(?:[-*+]|(\d{1,9})[.)])\s+(.*)$/.exec(line);
    if (li) {
      const type = li[1] ? "ol" : "ul";
      if (open?.type !== type) {
        open = { type, start: Number(li[1] ?? 1), items: [] };
        out.push(open);
      }
      open.items.push(li[2]);
    } else if (/^\s*\|/.test(line)) {
      if (open?.type === "pre") open.text += `\n${line}`;
      else out.push((open = { type: "pre", text: line }));
    } else if (open?.items && /^\s/.test(line)) {
      open.items[open.items.length - 1] += `\n${line.trim()}`;
    } else if (open?.type === "p") open.text += `\n${line}`;
    else out.push((open = { type: "p", text: line }));
  }
  return out.map((b) =>
    b.items
      ? { ...b, items: b.items.map(mdInline) }
      : b.type === "pre"
        ? b
        : { type: b.type, inline: mdInline(b.text) },
  );
}

// 접힌 두 줄 말풍선: 기호를 벗긴 글만(목록 표시·#·**·`·[](주소) 없이)
const plain = (tokens) =>
  tokens.map((t) => (t.t === "b" ? plain(t.c) : t.v)).join("");
export const mdPlain = (s) =>
  mdBlocks(s)
    .map((b) =>
      b.type === "pre"
        ? b.text
        : b.items
          ? b.items.map(plain).join(" ")
          : plain(b.inline),
    )
    .join(" ");

// 이름표용 짧은 경과: 단위 하나만(7m · 5h · 5d). 이름표 폭 120px에서 제목 자리를 남긴다
export function elapsedShort(ms) {
  const m = Math.max(0, Math.floor((Number(ms) || 0) / 60e3));
  return m < 60
    ? `${m}m`
    : m < 1440
      ? `${Math.floor(m / 60)}h`
      : `${Math.floor(m / 1440)}d`;
}

// 이름표 둘째 줄: 이 세션이 어디서 도는지(늘 보인다). 구역, worktree가 있으면 함께. 브랜치까지는 쪽지가 말한다
export const whereShort = (d) =>
  [d.zone, d.worktree].filter((x, i, a) => x && a.indexOf(x) === i).join(" › ");
