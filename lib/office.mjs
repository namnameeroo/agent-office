// 순수 함수만 둔다: 세션 기록 → 요약, 팀장 상태 판정, 사무실 뷰 모델. IO 없음.
import { basename } from "node:path";

export const DORMANT_AFTER_MS = 8 * 3600e3;
export const STALE_WAIT_MS = 24 * 3600e3;
export const RESULT_BUBBLE_MS = 5 * 60e3;
export const RETIRED_VISIBLE_MS = 5 * 60e3;
export const TEAM_STALE_MS = 10 * 60e3;
export const BUBBLE_MAX = 30;
export const DOING_MAX = 10;
export const ACTIVITY_MAX = 10;
export const SAID_MAX = 80;
export const TALK_MAX = 8;
export const FULL_MAX = 2000; // 미니 모드가 말풍선을 펼칠 때 보여주는 전문 상한

const DETAIL_MAX = 60;

export function truncate(s, max = BUBBLE_MAX) {
  const chars = [...s];
  return chars.length > max ? chars.slice(0, max).join("") + "…" : s;
}

const firstLine = (s = "") =>
  s
    .split("\n")
    .find((l) => l.trim())
    ?.trim() ?? "";
const lastLine = (s = "") =>
  s
    .split("\n")
    .filter((l) => l.trim())
    .at(-1) ?? "";
const contentOf = (r) =>
  Array.isArray(r.message?.content) ? r.message.content : [];

function toolBubble(name, input) {
  switch (name) {
    case "Bash":
      return input.description || `${firstLine(input.command)} 실행 중`;
    case "Read":
      return `${basename(input.file_path ?? "")} 읽는 중`;
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return `${basename(input.file_path ?? input.notebook_path ?? "")} 수정 중`;
    case "Grep":
    case "Glob":
      return `검색: ${input.pattern ?? ""}`;
    case "WebFetch":
    case "WebSearch":
      return "웹 검색 중";
    case "Agent":
    case "Task":
      return `팀원에게 맡김: ${input.description ?? ""}`;
    case "AskUserQuestion":
      return "질문 중";
    case "ExitPlanMode":
      return "플랜 승인 요청";
  }
  if (name.startsWith("mcp__")) return `${name.split("__")[1]} 사용 중`;
  return `${name} 사용 중`;
}

// 오리 말풍선(시안 F): 동사를 앞에 둬서 10자로 잘라도 무엇을 하는지 남는다. 동사는 최근 활동(activityOf)과 같은 말
export function shortBubble(block) {
  const s = (() => {
    if (block?.type === "thinking") return "생각 중";
    if (block?.type === "text") return firstLine(block.text) || null;
    if (block?.type !== "tool_use") return null;
    const name = block.name ?? "";
    const input = block.input ?? {};
    switch (name) {
      case "Bash":
        return input.description || `실행 ${firstLine(input.command)}`;
      case "Read":
        return `읽기 ${basename(input.file_path ?? "")}`;
      case "Edit":
      case "Write":
      case "NotebookEdit":
        return `수정 ${basename(input.file_path ?? input.notebook_path ?? "")}`;
      case "Grep":
      case "Glob":
        return `검색 ${input.pattern ?? ""}`;
      case "WebFetch":
      case "WebSearch":
        return "웹 검색";
      case "Agent":
      case "Task":
        return `위임 ${input.description ?? ""}`;
      case "AskUserQuestion":
        return "질문 중";
      case "ExitPlanMode":
        return "플랜 승인 요청";
    }
    if (name.startsWith("mcp__")) return `MCP ${name.split("__")[1]}`;
    return `도구 ${name}`;
  })();
  return s ? clip(s) : null;
}

// 말줄임표 포함 10자. 자른 끝의 공백은 뗀다("git diff …" → "git diff…")
function clip(s) {
  const chars = [...s];
  return chars.length > DOING_MAX
    ? chars
        .slice(0, DOING_MAX - 1)
        .join("")
        .trimEnd() + "…"
    : s;
}

export function bubbleFor(block) {
  if (block?.type === "thinking") return "생각 중";
  if (block?.type === "text")
    return firstLine(block.text) ? truncate(firstLine(block.text)) : null;
  if (block?.type !== "tool_use") return null;
  return truncate(toolBubble(block.name ?? "", block.input ?? {}));
}

function activityOf(block, cwd) {
  if (block.type === "thinking") return { verb: "생각", detail: "" };
  if (block.type !== "tool_use") return null;
  const name = block.name ?? "";
  const input = block.input ?? {};
  const rel = (p = "") =>
    p.startsWith(cwd + "/") ? p.slice(cwd.length + 1) : p;
  const [verb, detail] = (() => {
    switch (name) {
      case "Read":
        return ["읽기", rel(input.file_path)];
      case "Edit":
      case "Write":
      case "NotebookEdit":
        return ["수정", rel(input.file_path ?? input.notebook_path)];
      case "Bash":
        return ["실행", firstLine(input.command)];
      case "Grep":
      case "Glob":
        return ["검색", input.pattern ?? ""];
      case "WebFetch":
      case "WebSearch":
        return ["웹", input.url ?? input.query ?? ""];
      case "Agent":
      case "Task":
        return ["위임", input.description ?? ""];
    }
    if (name.startsWith("mcp__"))
      return ["MCP", name.split("__").slice(2).join("__")];
    return ["도구", name];
  })();
  return { verb, detail: truncate(String(detail), DETAIL_MAX) };
}

// 끝의 마크다운·따옴표·괄호를 걷어낸 뒤 물음표로 끝나면 질문으로 본다
const isQuestion = (text) =>
  /[?？]$/.test(text.replace(/[\s*_`'")\]」』]+$/u, ""));

// 사람이 보낸 입력(origin.kind = "human")의 글. 보낸 순간 기록되는 user 기록과, 작업 중 끼워 보낸 queued_command가 있다.
// 작업 알림(task-notification)·스킬 본문·시스템 알림(isMeta)은 origin이 사람이 아니라 빠진다. 슬래시 명령은 "/이름 인자"
function humanPrompt(r) {
  const src =
    r.type === "user"
      ? { origin: r.origin, meta: r.isMeta, body: r.message?.content }
      : r.type === "attachment" && r.attachment?.type === "queued_command"
        ? { origin: r.attachment.origin, meta: r.attachment.isMeta, body: r.attachment.prompt }
        : null;
  if (src?.origin?.kind !== "human" || src.meta) return null;
  const text = (
    typeof src.body === "string"
      ? src.body
      : (src.body ?? [])
          .filter((b) => b?.type === "text")
          .map((b) => b.text)
          .join("\n")
  ).trim();
  const cmd = text.match(/<command-name>([^<]*)<\/command-name>/);
  if (cmd)
    return [cmd[1], text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1].trim()]
      .filter(Boolean)
      .join(" ");
  return text || null;
}

export function summarizeTranscript(records, cwd) {
  const s = {
    title: null,
    branch: null,
    lastPrompt: null,
    lastEventAt: null,
    turnEnded: false,
    turnEndedAt: null,
    finalText: null,
    endedWithQuestion: false,
    question: null,
    current: null,
    doing: null,
    pendingTool: null,
    said: null, // 팀장이 방금 한 말(가장 최근 text 블록의 첫 줄). 말풍선을 펼치면 보인다
    saidFull: null, // 그 text 블록 전체. 미니 모드가 끝나지 않은 턴의 최근 응답을 펼칠 때 쓴다
    model: null, // 가장 최근 응답의 모델(/model로 바꾸면 따라간다). 화면은 Fable이면 반짝이(T42)
    talk: [], // 팀장이 한 말 첫 줄들(최신이 위, TALK_MAX개). 하단 상세의 "팀장이 한 말"
    activity: [],
  };
  const results = new Map(); // tool_use_id → is_error
  const acts = [];
  const talk = [];
  let last = null;
  let human = null; // 가장 최근 사람 입력. 있으면 last-prompt보다 우선한다
  for (const r of records) {
    // 형식이 이상한 레코드 하나 때문에 팀장 전체 요약(또는 사무실 전체)이 무너지지 않게 그 레코드만 건너뛴다
    try {
      if (r.type === "ai-title" && r.aiTitle) s.title = r.aiTitle;
      // last-prompt는 에이전트가 첫 출력을 낼 때 써지고(그 전엔 옛 값) 끼워 보낸 메시지를 담지 않는다. 사람 입력이 없는 옛 기록의 대체값
      if (r.type === "last-prompt" && r.lastPrompt) s.lastPrompt = r.lastPrompt;
      human = humanPrompt(r) ?? human;
      if (r.type !== "user" && r.type !== "assistant") continue;
      last = r;
      // <synthetic> = 중단·오류 때 Claude Code가 끼워 넣는 응답(모델 아님)
      const model = r.type === "assistant" ? r.message?.model : null;
      if (model && model !== "<synthetic>") s.model = model;
      const at = Date.parse(r.timestamp);
      if (!Number.isNaN(at)) s.lastEventAt = at;
      if (r.gitBranch) s.branch = r.gitBranch === "HEAD" ? null : r.gitBranch;
      for (const b of contentOf(r)) {
        if (b.type === "tool_result")
          results.set(b.tool_use_id, b.is_error === true);
        if (r.type !== "assistant") continue;
        s.current = bubbleFor(b) ?? s.current;
        s.doing = shortBubble(b) ?? s.doing;
        if (b.type === "text" && firstLine(b.text)) {
          s.said = truncate(firstLine(b.text), SAID_MAX);
          s.saidFull = b.text;
          talk.push({ at, text: s.said });
        }
        const act = activityOf(b, cwd);
        if (act)
          acts.push({
            at,
            ...act,
            id: b.type === "tool_use" ? b.id : null,
            name: b.name,
          });
      }
    } catch {
      // 건너뜀
    }
  }

  s.lastPrompt = human ?? s.lastPrompt;
  s.talk = talk.slice(-TALK_MAX).reverse();
  s.activity = acts
    .slice(-ACTIVITY_MAX)
    .reverse()
    .map(({ at, verb, detail, id }) => ({
      at,
      verb,
      detail,
      failed: results.get(id) === true,
    }));

  if (last?.type === "assistant" && last.message?.stop_reason === "end_turn") {
    s.turnEnded = true;
    s.turnEndedAt = Date.parse(last.timestamp) || null;
    const texts = contentOf(last)
      .filter((b) => b.type === "text")
      .map((b) => b.text);
    s.finalText = texts.length ? texts.join("\n") : null;
    if (s.finalText && isQuestion(s.finalText)) {
      s.endedWithQuestion = true;
      s.question = lastLine(s.finalText).replace(/[*`]/g, "").trim();
    }
  } else {
    const pending = acts.findLast((a) => a.id && !results.has(a.id));
    if (pending)
      s.pendingTool = {
        name: pending.name,
        verb: pending.verb,
        detail: pending.detail,
      };
  }
  return s;
}

export function teamView(raw, cwd, now) {
  return raw.flatMap((m) => {
    const base = { name: m.description || m.agentType, agentType: m.agentType };
    if (!m.finished && now - m.mtimeMs < TEAM_STALE_MS) {
      const { current, doing, lastEventAt, model } = summarizeTranscript(m.records, cwd);
      // lastEventAt: 팀장 말풍선과 겹칠 때 더 최근 말이 위로 온다(T44). model: Fable이면 오리도 반짝인다(T46)
      return [
        { ...base, working: true, bubble: current, doing, endedAt: null, lastEventAt, model },
      ];
    }
    if (m.finished && now - m.mtimeMs < RETIRED_VISIBLE_MS)
      return [
        {
          ...base,
          working: false,
          bubble: null,
          doing: null,
          endedAt: m.mtimeMs,
        },
      ];
    return [];
  });
}

// 우선순위: 나를 기다림 > 작업 중(팀원만 일해도) > 휴식 > 휴면
export function classifyDesk(terminal, summary, team, now) {
  const { status, waitingFor, statusUpdatedAt } = terminal;
  const desk = (state, reason, since, rawStatus = null) => {
    if (state === "waiting" && now - since >= STALE_WAIT_MS)
      return {
        state: "dormant",
        reason,
        rawStatus,
        since,
        staleDays: Math.floor((now - since) / (24 * 3600e3)),
      };
    return { state, reason, rawStatus, since, staleDays: null };
  };
  if (status === "waiting")
    return desk(
      "waiting",
      waitingFor === "permission prompt" ? "permission" : "input",
      statusUpdatedAt,
    );
  if (summary.endedWithQuestion)
    return desk("waiting", "question", summary.turnEndedAt ?? statusUpdatedAt);
  if (status !== "idle")
    return desk(
      "working",
      null,
      statusUpdatedAt,
      status === "busy" ? null : (status ?? null),
    );
  if (team.some((t) => t.working))
    return desk("working", null, statusUpdatedAt);
  // 백그라운드 세션은 supervisor가 다시 띄울 때 statusUpdatedAt을 새로 쓴다 → 쉰 기준은 대화 기록의 마지막 시각
  const restSince =
    terminal.kind === "bg" ? (summary.lastEventAt ?? statusUpdatedAt) : statusUpdatedAt;
  return desk(
    now - restSince < DORMANT_AFTER_MS ? "resting" : "dormant",
    null,
    restSince,
  );
}

// 팀장 말풍선(접힘, 10자, 동사 먼저) = 세션 본류에서 지금 가장 중요한 것.
// 작업 중 = 가장 최근 블록(도구·생각·말), 권한 대기 = 무엇을 승인할지, 질문 대기 = 질문 앞부분,
// 그 밖은 bubble 앞부분(방금 끝남 = 결과 첫 줄). 휴식·휴면은 bubble이 없어 말풍선도 없다
function doingOf(st, summary, bubble) {
  const p = summary.pendingTool;
  if (st.state === "working" && summary.doing) return summary.doing;
  if (st.state === "waiting" && st.reason === "permission" && p)
    return clip(`${p.verb} ${p.detail}`);
  if (st.state === "waiting" && st.reason === "question" && summary.question)
    return clip(summary.question);
  return bubble ? clip(bubble) : null;
}

function bubbleOf(st, summary, team, now) {
  switch (st.state) {
    case "waiting": {
      if (st.reason === "question") return `질문 남김: ${summary.question}`;
      if (st.reason === "input") return "답변 필요";
      const p = summary.pendingTool;
      if (!p) return "권한 승인 필요";
      // 입력이 따로 없는 도구(ExitPlanMode 등)는 detail이 도구 이름이다
      return p.detail && p.detail !== p.name
        ? `권한 승인 필요 · ${p.name}: ${p.detail}`
        : `권한 승인 필요 · ${p.name}`;
    }
    case "working": {
      const n = team.filter((t) => t.working).length;
      return summary.turnEnded && n ? `팀원 ${n}명 작업 중` : summary.current;
    }
    case "resting":
      return summary.turnEnded && now - summary.turnEndedAt < RESULT_BUBBLE_MS
        ? bubbleFor({ type: "text", text: summary.finalText ?? "" })
        : null;
    default:
      return null;
  }
}

// 말풍선 펼침용 전문(미니 모드). 판정은 건드리지 않고 이미 읽은 글을 자르지 않고 싣는다: 질문·방금 끝남 = 최종 응답 전체,
// 권한·답변 대기 = bubble과 같은 글(원천이 이미 짧다), 휴면 = null(미니 모드에 안 나오고 큰 창은 full을 안 쓴다)
function fullOf(st, summary, bubble) {
  if (st.state === "dormant") return null;
  if (st.state === "waiting" && st.reason !== "question") return bubble;
  // 끝난 턴 = 최종 응답 전체, 아직 도는 턴 = 가장 최근에 한 말 전체. 오래 쉰 세션도 싣는다(미니 모드가 최근 응답을 늘 보여준다)
  const t = summary.finalText ?? summary.saidFull;
  return t ? truncate(t, FULL_MAX) : null;
}

// desks는 입력 순서 그대로다. 층·단 정렬과 배치는 화면이 한다(v2, 내 자리 폐기)
export function buildOffice(inputs, now) {
  const desks = inputs.map(
    ({ terminal, zone, summary, team: raw, sessionStart, links }) => {
      const team = teamView(raw, terminal.cwd, now);
      const st = classifyDesk(terminal, summary, team, now);
      const bubble = bubbleOf(st, summary, team, now);
      return {
        pid: terminal.pid,
        sessionId: terminal.sessionId,
        ...(terminal.kind === "bg" && { kind: "bg", jobId: terminal.jobId }), // 대화형 책상은 필드를 더하지 않는다
        cwd: terminal.cwd,
        zone: zone.zone,
        worktree: zone.worktree,
        title: summary.title ?? terminal.name,
        branch: summary.branch,
        ...st,
        // "shell" = Claude Code가 턴·위임 작업 없이 끝나지 않은 백그라운드 Bash만 있을 때 쓰는 status(2.1.322 본체 확인).
        // 분류는 작업 중 그대로 두고, 화면이 "셸만 도는 중"을 구분하게 한다. rawStatus는 작업 중일 때만 붙어 기다림은 섞이지 않는다
        background: st.rawStatus === "shell",
        bubble,
        doing: doingOf(st, summary, bubble),
        full: fullOf(st, summary, bubble),
        said: summary.said,
        model: summary.model,
        lastEventAt: summary.lastEventAt,
        talk: summary.talk,
        lastPrompt: summary.lastPrompt,
        sessionStart,
        activity: summary.activity,
        team,
        links: links ?? [],
      };
    },
  );

  const counts = { waiting: 0, working: 0, resting: 0, dormant: 0 };
  for (const d of desks) counts[d.state]++;

  return { generatedAt: now, counts, desks };
}
