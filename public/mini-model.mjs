// 미니 모드의 순수 판정. DOM·tower.mjs를 import하지 않아 node --test에서 그대로 돈다.
// 서버 판정(state·bubble·full)은 그대로 받고, 띠에 어떻게 줄 세우고 무엇을 보일지만 정한다.
import { FRESH_MS, firstLine, latestLinks } from "./common.mjs";

const ORDER = { waiting: 0, working: 1, resting: 2 };

// 휴면은 띠에 없다. 기다림(오래 기다린 순) → 작업 중 → 휴식. 같은 상태 안은 입력 순서
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

export function elapsedText(ms) {
  const m = Math.max(0, Math.floor((Number(ms) || 0) / 60e3));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// 큰 창 tower.mjs의 waitLevel과 같은 경계(5분·15분)
export const waitLevel = (ms) => (ms < 5 * 60e3 ? 1 : ms < 15 * 60e3 ? 2 : 3);

export const chickCount = (d) => (d.team ?? []).filter((t) => t.working).length;

// 말풍선 = 그 세션의 최근 응답, 늘 뜬다(미니 모드에서 최근 응답을 보는 유일한 길).
// 기다릴 땐 무엇을 승인·답할지(bubble), 그 밖엔 가장 최근에 한 말(said). 지금 돌리는 도구는 쪽지의 "지금"이 말한다
export const bubbleText = (d) =>
  (d.state === "waiting" ? d.bubble : (d.said ?? d.bubble)) ?? null;

export const canExpand = (d) =>
  bubbleText(d) != null && !!d.full && d.full !== bubbleText(d);

// 펼친 말풍선을 유지할지: 그 세션이 아직 띠에 있고 펼칠 말풍선이 있을 때만. 사라지거나 작업 중으로 바뀌면 접는다
export function expandedAfter(expanded, list) {
  if (expanded == null) return null;
  const cur = list.find((d) => d.pid === expanded);
  return cur && canExpand(cur) ? expanded : null;
}

// rowWidth = #row의 너비(▲ 칸 40px은 이미 빠져 있다). 칸 80px, 왼쪽 여백 24px
export const overflowCount = (n, rowWidth) =>
  Math.max(0, n - Math.floor((rowWidth - 24) / 80));

// 표지판: 왜 기다리는지(짧게). 얼마나 기다렸는지는 이름표가 말한다
const WHY = { permission: "승인", question: "질문" };
export const signText = (d) => WHY[d.reason] ?? "답 필요";

// 올려두면 뜨는 쪽지: [라벨, 글] 줄. 큰 창을 열지 않고 "어디·뭘 시켰지·지금 뭐 하지"를 본다. 없는 값은 줄째 뺀다
export function peekLines(d) {
  const where = [d.zone, d.worktree, d.branch]
    .filter((x, i, a) => x && a.indexOf(x) === i) // worktree 이름 = 브랜치 이름이면 한 번만
    .join(" · ");
  const act = d.state === "working" ? d.activity?.[0] : null; // activity는 최신순
  return [
    ["위치", where],
    ["요청", firstLine(d.lastPrompt ?? "").trim()],
    ["지금", act ? `${act.verb} ${act.detail ?? ""}`.trim() : ""],
    ["링크", latestLinks(d.links ?? []).map((l) => l.label).join(" · ")],
  ].filter(([, v]) => v);
}

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
