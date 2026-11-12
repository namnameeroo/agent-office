import { test } from "node:test";
import assert from "node:assert/strict";
import { bubbleFor, shortBubble, summarizeTranscript } from "../lib/office.mjs";

const NOW = Date.parse("2026-10-22T05:00:00Z");
const at = (sec) => new Date(NOW + sec * 1000).toISOString();
const asst = (sec, stop, ...content) => ({
  type: "assistant",
  timestamp: at(sec),
  gitBranch: "feat/sso-retry",
  message: { stop_reason: stop, content },
});
const result = (sec, id, isError = false) => ({
  type: "user",
  timestamp: at(sec),
  message: {
    content: [{ type: "tool_result", tool_use_id: id, is_error: isError }],
  },
});
const tool = (id, name, input) => ({ type: "tool_use", id, name, input });

test("bubbleFor: Bash는 description, 없으면 명령 앞부분 + 실행 중", () => {
  assert.equal(
    bubbleFor(
      tool("a", "Bash", {
        command: "pnpm test auth",
        description: "Run auth tests",
      }),
    ),
    "Run auth tests",
  );
  assert.equal(
    bubbleFor(tool("a", "Bash", { command: "pnpm test auth" })),
    "pnpm test auth 실행 중",
  );
});

test("bubbleFor: 파일·검색·웹·MCP·위임·질문·생각·텍스트", () => {
  assert.equal(
    bubbleFor(tool("a", "Read", { file_path: "/r/src/api/client.ts" })),
    "client.ts 읽는 중",
  );
  assert.equal(
    bubbleFor(tool("a", "Edit", { file_path: "/r/src/hooks/useAuth.ts" })),
    "useAuth.ts 수정 중",
  );
  assert.equal(
    bubbleFor(tool("a", "Write", { file_path: "/r/a.md" })),
    "a.md 수정 중",
  );
  assert.equal(
    bubbleFor(tool("a", "Grep", { pattern: "refreshToken" })),
    "검색: refreshToken",
  );
  assert.equal(
    bubbleFor(tool("a", "Glob", { pattern: "**/*.ts" })),
    "검색: **/*.ts",
  );
  assert.equal(bubbleFor(tool("a", "WebSearch", { query: "x" })), "웹 검색 중");
  assert.equal(
    bubbleFor(tool("a", "WebFetch", { url: "https://x" })),
    "웹 검색 중",
  );
  assert.equal(
    bubbleFor(tool("a", "mcp__atlassian__getJiraIssue", {})),
    "atlassian 사용 중",
  );
  assert.equal(
    bubbleFor(tool("a", "Agent", { description: "코드 탐색" })),
    "팀원에게 맡김: 코드 탐색",
  );
  assert.equal(bubbleFor(tool("a", "AskUserQuestion", {})), "질문 중");
  assert.equal(bubbleFor(tool("a", "ExitPlanMode", {})), "플랜 승인 요청");
  assert.equal(bubbleFor(tool("a", "TodoWrite", {})), "TodoWrite 사용 중");
  assert.equal(bubbleFor({ type: "thinking", thinking: "" }), "생각 중");
  assert.equal(
    bubbleFor({ type: "text", text: "\n목록 API 3개 정리 완료\n자세히는" }),
    "목록 API 3개 정리 완료",
  );
});

test("bubbleFor: 30자를 넘으면 자르고 말줄임표", () => {
  assert.equal(
    bubbleFor({ type: "text", text: "가".repeat(40) }),
    "가".repeat(30) + "…",
  );
});

test("shortBubble: 동사 먼저, 파일은 이름만, 말줄임표 포함 10자", () => {
  const sb = (name, input) => shortBubble(tool("a", name, input));
  assert.equal(
    sb("Edit", { file_path: "/r/src/hooks/useAuth.ts" }),
    "수정 useAut…",
  );
  assert.equal(
    sb("Read", { file_path: "/r/src/api/client.ts" }),
    "읽기 client…",
  );
  assert.equal(sb("Bash", { command: "pnpm test auth" }), "실행 pnpm t…");
  assert.equal(
    sb("Bash", { description: "테스트 실행", command: "x" }),
    "테스트 실행",
  );
  assert.equal(sb("Grep", { pattern: "abcdefg" }), "검색 abcdefg"); // 딱 10자는 그대로
  assert.equal(sb("WebSearch", { query: "x" }), "웹 검색");
  assert.equal(sb("Agent", { description: "코드 탐색" }), "위임 코드 탐색");
  assert.equal(sb("mcp__atlassian__getJiraIssue", {}), "MCP atlas…");
  assert.equal(sb("AskUserQuestion", {}), "질문 중");
  assert.equal(sb("TodoWrite", {}), "도구 TodoWr…");
  assert.equal(shortBubble({ type: "thinking", thinking: "" }), "생각 중");
  assert.equal(
    shortBubble({ type: "text", text: "\n목록 API 3개 정리 완료\n자세히는" }),
    "목록 API 3개…",
  );
  assert.equal(shortBubble({ type: "text", text: "\n" }), null);
  assert.equal(shortBubble({ type: "tool_result" }), null);
  // 자른 끝이 공백이면 떼고 말줄임표를 붙인다
  assert.equal(
    shortBubble(tool("a", "Bash", { description: "git diff 확인" })),
    "git diff…",
  );
});

test("summarizeTranscript: 제목·브랜치·마지막 요청·현재 동작·대기 도구·최근 활동", () => {
  const s = summarizeTranscript(
    [
      { type: "ai-title", aiTitle: "옛 제목" },
      { type: "ai-title", aiTitle: "SSO 로그인 안정화" },
      {
        type: "last-prompt",
        lastPrompt: "토큰 만료 시 재시도 로직 넣고 테스트까지 돌려줘",
      },
      asst(0, "tool_use", { type: "thinking", thinking: "" }),
      asst(1, "tool_use", tool("t1", "Bash", { command: "pnpm test auth" })),
      result(2, "t1", true),
      asst(
        3,
        "tool_use",
        tool("t2", "Edit", { file_path: "/repo/src/hooks/useAuth.ts" }),
      ),
    ],
    "/repo",
  );
  assert.equal(s.title, "SSO 로그인 안정화");
  assert.equal(s.branch, "feat/sso-retry");
  assert.equal(s.lastPrompt, "토큰 만료 시 재시도 로직 넣고 테스트까지 돌려줘");
  assert.equal(s.current, "useAuth.ts 수정 중");
  assert.equal(s.turnEnded, false);
  assert.deepEqual(s.pendingTool, {
    name: "Edit",
    verb: "수정",
    detail: "src/hooks/useAuth.ts",
  });
  assert.deepEqual(
    s.activity.map((a) => [a.verb, a.detail, a.failed]),
    [
      ["수정", "src/hooks/useAuth.ts", false],
      ["실행", "pnpm test auth", true],
      ["생각", "", false],
    ],
  );
  assert.equal(s.activity[0].at, NOW + 3000);
  assert.equal(s.lastEventAt, NOW + 3000);
});

test("summarizeTranscript: 평문 질문으로 턴 종료", () => {
  const s = summarizeTranscript(
    [
      asst(0, "end_turn", {
        type: "text",
        text: "정리했어요.\n\n이대로 **진행할까요?**",
      }),
    ],
    "/r",
  );
  assert.equal(s.turnEnded, true);
  assert.equal(s.turnEndedAt, NOW);
  assert.equal(s.finalText, "정리했어요.\n\n이대로 **진행할까요?**");
  assert.equal(s.endedWithQuestion, true);
  assert.equal(s.question, "이대로 진행할까요?");
  assert.equal(s.pendingTool, null);
});

test("summarizeTranscript: 질문 아닌 종료 / 종료 뒤 사용자 입력", () => {
  assert.equal(
    summarizeTranscript(
      [asst(0, "end_turn", { type: "text", text: "완료했습니다." })],
      "/r",
    ).endedWithQuestion,
    false,
  );
  const s = summarizeTranscript(
    [
      asst(0, "end_turn", { type: "text", text: "할까요?" }),
      { type: "user", timestamp: at(5), message: { content: "응" } },
    ],
    "/r",
  );
  assert.equal(s.turnEnded, false);
  assert.equal(s.endedWithQuestion, false);
});

test("summarizeTranscript: 빈 기록", () => {
  const s = summarizeTranscript([], "/r");
  assert.deepEqual(
    [s.title, s.current, s.lastEventAt, s.turnEnded, s.pendingTool],
    [null, null, null, false, null],
  );
  assert.deepEqual(s.activity, []);
  // 레포 밖·detached에서는 gitBranch가 "HEAD"로 찍힌다. 브랜치 이름이 아니므로 없음으로 본다
  assert.equal(
    summarizeTranscript([{ ...asst(0, "tool_use"), gitBranch: "HEAD" }], "/r")
      .branch,
    null,
  );
});

import { classifyDesk, teamView } from "../lib/office.mjs";

const M = 60e3,
  H = 3600e3,
  D = 24 * H;
const term = (pid, o = {}) => ({
  pid,
  sessionId: `s${pid}`,
  cwd: "/r",
  name: `name-${pid}`,
  status: "idle",
  waitingFor: null,
  statusUpdatedAt: NOW,
  ...o,
});
const sum = (o = {}) => ({ ...summarizeTranscript([], "/r"), ...o });
const working = [
  {
    name: "x",
    agentType: "Explore",
    working: true,
    bubble: null,
    endedAt: null,
  },
];
const st = (state, reason, since, extra = {}) => ({
  state,
  reason,
  rawStatus: null,
  since,
  staleDays: null,
  ...extra,
});

test("classifyDesk: 도구로 막힘 → 나를 기다림", () => {
  assert.deepEqual(
    classifyDesk(
      term(1, {
        status: "waiting",
        waitingFor: "permission prompt",
        statusUpdatedAt: NOW - 12 * M,
      }),
      sum(),
      [],
      NOW,
    ),
    st("waiting", "permission", NOW - 12 * M),
  );
  assert.deepEqual(
    classifyDesk(
      term(1, {
        status: "waiting",
        waitingFor: "input needed",
        statusUpdatedAt: NOW - M,
      }),
      sum(),
      [],
      NOW,
    ),
    st("waiting", "input", NOW - M),
  );
});

test("classifyDesk: 평문 질문은 idle이든 busy(팀원 작업 중)든 나를 기다림", () => {
  const q = sum({
    turnEnded: true,
    turnEndedAt: NOW - M,
    endedWithQuestion: true,
    question: "할까요?",
  });
  assert.deepEqual(
    classifyDesk(term(1), q, [], NOW),
    st("waiting", "question", NOW - M),
  );
  assert.deepEqual(
    classifyDesk(term(1, { status: "busy" }), q, working, NOW),
    st("waiting", "question", NOW - M),
  );
});

test("classifyDesk: 작업 중 (busy, 모르는 status, idle인데 팀원 작업 중)", () => {
  assert.deepEqual(
    classifyDesk(
      term(1, { status: "busy", statusUpdatedAt: NOW - 6 * M }),
      sum(),
      [],
      NOW,
    ),
    st("working", null, NOW - 6 * M),
  );
  assert.deepEqual(
    classifyDesk(term(1, { status: "compacting" }), sum(), [], NOW),
    st("working", null, NOW, { rawStatus: "compacting" }),
  );
  assert.equal(classifyDesk(term(1), sum(), working, NOW).state, "working");
});

test("classifyDesk: 휴식 / 휴면 경계 8시간", () => {
  assert.equal(
    classifyDesk(
      term(1, { statusUpdatedAt: NOW - (8 * H - 1) }),
      sum(),
      [],
      NOW,
    ).state,
    "resting",
  );
  assert.equal(
    classifyDesk(term(1, { statusUpdatedAt: NOW - 8 * H }), sum(), [], NOW)
      .state,
    "dormant",
  );
});

test("classifyDesk: 24시간 넘은 대기는 휴면 + staleDays", () => {
  assert.deepEqual(
    classifyDesk(
      term(1, {
        status: "waiting",
        waitingFor: "permission prompt",
        statusUpdatedAt: NOW - 25 * H,
      }),
      sum(),
      [],
      NOW,
    ),
    st("dormant", "permission", NOW - 25 * H, { staleDays: 1 }),
  );
  const q = sum({
    turnEnded: true,
    turnEndedAt: NOW - 3 * D,
    endedWithQuestion: true,
    question: "?",
  });
  assert.deepEqual(
    classifyDesk(term(1, { statusUpdatedAt: NOW - 3 * D }), q, [], NOW),
    st("dormant", "question", NOW - 3 * D, { staleDays: 3 }),
  );
});

test("teamView: 일하는 팀원 + 5분 안에 퇴근한 팀원만", () => {
  const raw = [
    {
      agentId: "a1",
      agentType: "Explore",
      description: "코드 탐색",
      finished: false,
      mtimeMs: NOW - 30e3,
      records: [
        asst(0, "tool_use", tool("g", "Grep", { pattern: "refreshToken" })),
      ],
    },
    {
      agentId: "a2",
      agentType: "Explore",
      description: "멈춘 팀원",
      finished: false,
      mtimeMs: NOW - 11 * M,
      records: [],
    },
    {
      agentId: "a3",
      agentType: "intent-recorder",
      description: "의도 기록",
      finished: true,
      mtimeMs: NOW - 2 * M,
      records: [],
    },
    {
      agentId: "a4",
      agentType: "Plan",
      description: "오래전 퇴근",
      finished: true,
      mtimeMs: NOW - 6 * M,
      records: [],
    },
  ];
  assert.deepEqual(teamView(raw, "/r", NOW), [
    {
      name: "코드 탐색",
      agentType: "Explore",
      working: true,
      bubble: "검색: refreshToken",
      doing: "검색 refres…",
      endedAt: null,
      lastEventAt: NOW,
      model: null,
    },
    {
      name: "의도 기록",
      agentType: "intent-recorder",
      working: false,
      bubble: null,
      doing: null,
      endedAt: NOW - 2 * M,
    },
  ]);
});

import { buildOffice } from "../lib/office.mjs";

const chick = (description) => ({
  agentId: description,
  agentType: "Explore",
  description,
  finished: false,
  mtimeMs: NOW - 10e3,
  records: [],
});
const input = (pid, zone, worktree, t, s, team = []) => ({
  terminal: term(pid, t),
  zone: { zone, worktree },
  summary: sum(s),
  team,
  sessionStart: NOW - H,
});

test("buildOffice: 예시 화면 3.1", () => {
  const o = buildOffice(
    [
      input(
        1,
        "petshop-client",
        "foxtail",
        { status: "busy", statusUpdatedAt: NOW - 6 * M },
        {
          title: "SSO 로그인 안정화",
          current: "useAuth.ts 수정 중",
          lastEventAt: NOW - 5e3,
        },
        [chick("코드 탐색"), chick("리뷰")],
      ),
      {
        ...input(
          2,
          "petshop-client",
          "ops-deploy-dev",
          {
            status: "waiting",
            waitingFor: "permission prompt",
            statusUpdatedAt: NOW - 12 * M,
          },
          {
            title: "배포 설정 정리",
            pendingTool: { name: "Bash", detail: "pnpm build:dev" },
            lastEventAt: NOW - 12 * M,
          },
        ),
        links: [{ kind: "PR", label: "PR #1", url: "u", at: 1 }],
      },
      input(
        3,
        "seo-client",
        "develop-3",
        { status: "busy", statusUpdatedAt: NOW - 20 * M },
        {
          title: "HTTP 헬스체크",
          current: "pnpm test 실행 중",
          lastEventAt: NOW - 30e3,
        },
      ),
      input(
        4,
        "seo-client",
        null,
        { statusUpdatedAt: NOW - 4 * M },
        {
          title: "API 목록 정리",
          turnEnded: true,
          turnEndedAt: NOW - 4 * M,
          finalText: "목록 API 3개 정리 완료\n상세는",
          lastEventAt: NOW - 4 * M,
        },
      ),
      input(
        5,
        "seo-client",
        "anhinga",
        { statusUpdatedAt: NOW - 5 * D },
        { lastEventAt: NOW - 5 * D },
      ),
      input(
        6,
        "toys",
        null,
        { statusUpdatedAt: NOW - 38 * M },
        {
          title: "arc 고정탭 범위",
          turnEnded: true,
          turnEndedAt: NOW - 38 * M,
          finalText: "완료",
          lastEventAt: NOW - 38 * M,
        },
      ),
      input(
        7,
        "_agent",
        null,
        {
          status: "waiting",
          waitingFor: "input needed",
          statusUpdatedAt: NOW - 3 * D - H,
        },
        { title: "vault 권한 수정", lastEventAt: NOW - 3 * D - H },
      ),
    ],
    NOW,
  );

  assert.equal(o.generatedAt, NOW);
  assert.deepEqual(o.counts, {
    waiting: 1,
    working: 2,
    resting: 2,
    dormant: 2,
  });
  assert.deepEqual(
    o.desks.map((d) => [d.pid, d.zone, d.state]),
    [
      [1, "petshop-client", "working"],
      [2, "petshop-client", "waiting"],
      [3, "seo-client", "working"],
      [4, "seo-client", "resting"],
      [5, "seo-client", "dormant"],
      [6, "toys", "resting"],
      [7, "_agent", "dormant"],
    ],
  );
  assert.ok(!("zones" in o) && !("myDesk" in o));
  assert.equal(o.desks[0].sessionId, "s1");
  assert.ok(!("atMyDesk" in o.desks[0]));
  assert.deepEqual(o.desks[0].links, []); // links 입력이 없으면 빈 배열
  assert.deepEqual(o.desks[1].links, [
    { kind: "PR", label: "PR #1", url: "u", at: 1 },
  ]);
  assert.deepEqual(
    [o.desks[1].reason, o.desks[1].bubble],
    ["permission", "권한 승인 필요 · Bash: pnpm build:dev"],
  );

  const [a] = o.desks;
  assert.deepEqual(
    [a.title, a.worktree, a.bubble, a.team.length, a.sessionStart],
    ["SSO 로그인 안정화", "foxtail", "useAuth.ts 수정 중", 2, NOW - H],
  );
  assert.equal(o.desks[3].bubble, "목록 API 3개 정리 완료"); // 끝난 지 5분 안
  assert.equal(o.desks[4].title, "name-5"); // 제목 없으면 터미널 이름
  assert.equal(o.desks[5].bubble, null); // 끝난 지 38분
  assert.deepEqual(
    ["state", "reason", "staleDays", "bubble"].map((k) => o.desks[6][k]),
    ["dormant", "input", 3, null],
  );
});

test('buildOffice: 턴이 끝나고 팀원만 일하면 "팀원 N명 작업 중"', () => {
  const o = buildOffice(
    [
      input(
        1,
        "r",
        null,
        { status: "busy" },
        {
          turnEnded: true,
          turnEndedAt: NOW - M,
          finalText: "결과를 기다릴게요.",
          lastEventAt: NOW - M,
        },
        [chick("a"), chick("b")],
      ),
    ],
    NOW,
  );
  assert.deepEqual(
    [o.desks[0].state, o.desks[0].bubble],
    ["working", "팀원 2명 작업 중"],
  );
});

test("buildOffice: 질문을 남긴 팀장은 나를 기다리고, 팀원은 곁에서 계속 일함", () => {
  const o = buildOffice(
    [
      input(
        1,
        "r",
        null,
        { status: "busy" },
        {
          turnEnded: true,
          turnEndedAt: NOW - M,
          endedWithQuestion: true,
          question: "이대로 진행할까요?",
          lastEventAt: NOW - M,
        },
        [chick("a"), chick("b")],
      ),
    ],
    NOW,
  );
  assert.deepEqual(
    [o.desks[0].state, o.desks[0].bubble, o.desks[0].team.length],
    ["waiting", "질문 남김: 이대로 진행할까요?", 2],
  );
});

test("buildOffice: desks는 입력 순서 그대로, 답변 필요 문구", () => {
  const o = buildOffice(
    [
      input(
        1,
        "r",
        null,
        {
          status: "waiting",
          waitingFor: "input needed",
          statusUpdatedAt: NOW - M,
        },
        {},
      ),
      input(
        2,
        "r",
        null,
        {
          status: "waiting",
          waitingFor: "permission prompt",
          statusUpdatedAt: NOW - 9 * M,
        },
        {},
      ),
    ],
    NOW,
  );
  assert.deepEqual(
    o.desks.map((d) => [d.pid, d.bubble]),
    [
      [1, "답변 필요"],
      [2, "권한 승인 필요"],
    ],
  );
});

test("buildOffice: 대기 도구의 detail이 도구 이름뿐이면 이름만 붙임", () => {
  const o = buildOffice(
    [
      input(
        1,
        "r",
        null,
        { status: "waiting", waitingFor: "permission prompt" },
        { pendingTool: { name: "ExitPlanMode", detail: "ExitPlanMode" } },
      ),
    ],
    NOW,
  );
  assert.equal(o.desks[0].bubble, "권한 승인 필요 · ExitPlanMode");
});

test("summarizeTranscript: 형식이 이상한 레코드는 그 레코드만 건너뜀(팀장·팀원 경로 모두)", () => {
  const bad = asst(0, "tool_use", tool("x", "Read", { file_path: 123 }), null);
  const s = summarizeTranscript(
    [bad, asst(1, "end_turn", { type: "text", text: "이대로 진행할까요?" })],
    "/r",
  );
  assert.equal(s.endedWithQuestion, true);
  const o = buildOffice(
    [
      input(1, "r", null, { status: "busy" }, {}, [
        { ...chick("깨진 기록"), records: [bad] },
      ]),
    ],
    NOW,
  );
  assert.equal(o.desks[0].team.length, 1);
});

test("summarizeTranscript: said = 팀장이 방금 한 말의 첫 줄(80자), 도구만 있으면 null", () => {
  const text = (t) => ({ type: "text", text: t });
  const s = summarizeTranscript(
    [
      asst(0, "tool_use", text("\n모두 통과. 커밋합니다.\n자세한 내용"), tool("a", "Bash", { command: "git commit" })),
      result(1, "a"),
      asst(2, "tool_use", tool("b", "Read", { file_path: "/r/x.ts" })),
    ],
    "/r",
  );
  assert.equal(s.said, "모두 통과. 커밋합니다.");
  assert.equal(
    summarizeTranscript([asst(0, "tool_use", tool("a", "Read", { file_path: "/r/x" }))], "/r").said,
    null,
  );
  assert.equal(
    summarizeTranscript([asst(0, "end_turn", text("가".repeat(100)))], "/r").said,
    "가".repeat(80) + "…",
  );
});

test("buildOffice: 팀장 말풍선 doing(접힘 10자, 상태별)과 said(방금 한 말)", () => {
  const o = buildOffice(
    [
      input(1, "r", null, { status: "busy", statusUpdatedAt: NOW - M }, { doing: "수정 tower.mjs", said: "T4를 구현합니다.", lastEventAt: NOW - 5e3 }),
      input(
        2,
        "r",
        null,
        { status: "busy" },
        { turnEnded: true, turnEndedAt: NOW - M, finalText: "결과를 기다릴게요. 끝나면 정리합니다", doing: "결과를 기다릴게요…", said: "결과를 기다릴게요. 끝나면 정리합니다", lastEventAt: NOW - M },
        [chick("a")],
      ),
      input(
        3,
        "r",
        null,
        { status: "waiting", waitingFor: "permission prompt", statusUpdatedAt: NOW - M },
        { pendingTool: { name: "Bash", verb: "실행", detail: "pnpm build:dev" }, said: "빌드해 볼게요." },
      ),
      input(4, "r", null, { status: "busy" }, { turnEnded: true, turnEndedAt: NOW - M, endedWithQuestion: true, question: "이대로 진행할까요? 아니면 멈출까요?" }),
      input(5, "r", null, { statusUpdatedAt: NOW - M }, { turnEnded: true, turnEndedAt: NOW - M, finalText: "목록 API 3개 정리 완료\n상세는" }),
      input(6, "r", null, { statusUpdatedAt: NOW - 38 * M }, { turnEnded: true, turnEndedAt: NOW - 38 * M, finalText: "완료" }),
    ],
    NOW,
  );
  assert.deepEqual(
    o.desks.map((d) => [d.state, d.doing]),
    [
      ["working", "수정 tower.mjs"], // 본류의 가장 최근 것
      ["working", "결과를 기다릴게요…"], // 턴은 끝나고 팀원만 일함: 마지막 말
      ["waiting", "실행 pnpm b…"], // 권한 대기: 무엇을 승인할지
      ["waiting", "이대로 진행할까요…"], // 질문 대기: 질문 앞부분
      ["resting", "목록 API 3개…"], // 방금 끝남: 결과 첫 줄
      ["resting", null], // 휴식: 말풍선 없음
    ],
  );
  assert.deepEqual(
    o.desks.map((d) => d.said),
    ["T4를 구현합니다.", "결과를 기다릴게요. 끝나면 정리합니다", "빌드해 볼게요.", null, null, null],
  );
});

test("summarizeTranscript: talk = 팀장이 한 말 첫 줄(최신이 위, 8개까지), 도구만 있으면 빈 배열", () => {
  const text = (t) => ({ type: "text", text: t });
  const recs = Array.from({ length: 10 }, (_, i) =>
    asst(i, "tool_use", text(`말 ${i}\n둘째 줄`), tool(`t${i}`, "Read", { file_path: "/r/x" })),
  );
  const s = summarizeTranscript(recs, "/r");
  assert.equal(s.talk.length, 8);
  assert.deepEqual(s.talk[0], { at: NOW + 9e3, text: "말 9" });
  assert.equal(s.talk.at(-1).text, "말 2");
  assert.deepEqual(
    summarizeTranscript([asst(0, "tool_use", tool("a", "Read", { file_path: "/r/x" }))], "/r").talk,
    [],
  );
  const talk = [{ at: 1, text: "x" }];
  assert.deepEqual(buildOffice([input(1, "r", null, { status: "busy" }, { talk })], NOW).desks[0].talk, talk);
});

test("summarizeTranscript: 마지막 요청은 보낸 순간의 사람 입력(끼워 보낸 것 포함), 없으면 last-prompt", () => {
  const human = (sec, content) => ({ type: "user", timestamp: at(sec), origin: { kind: "human" }, message: { content } });
  const queued = (prompt, origin = { kind: "human" }) => ({ type: "attachment", attachment: { type: "queued_command", prompt, origin, humanTurn: true } });
  const recs = [
    { type: "last-prompt", lastPrompt: "이전 작업" },
    human(1, "칠판 늘려"),
    // 에이전트 첫 출력 전: last-prompt는 아직 옛 값이다. 사람 입력이 바로 보여야 한다
    { type: "last-prompt", lastPrompt: "이전 작업" },
  ];
  assert.equal(summarizeTranscript(recs, "/repo").lastPrompt, "칠판 늘려");
  // 작업 중 끼워 보낸 메시지(그 뒤 last-prompt는 여전히 턴 시작 프롬프트)
  const mid = [...recs, queued("그리고 조명도"), { type: "last-prompt", lastPrompt: "칠판 늘려" }];
  assert.equal(summarizeTranscript(mid, "/repo").lastPrompt, "그리고 조명도");
  // 사람 입력이 아닌 것은 건너뛴다: 작업 알림·스킬 본문(isMeta)·중단 표시·도구 결과
  const noise = [
    ...mid,
    queued("<task-notification>…", { kind: "task-notification" }),
    { type: "user", isMeta: true, origin: null, message: { content: [{ type: "text", text: "Base directory for this skill" }] } },
    { type: "user", message: { content: [{ type: "text", text: "[Request interrupted by user]" }] } },
    result(5, "t9"),
  ];
  assert.equal(summarizeTranscript(noise, "/repo").lastPrompt, "그리고 조명도");
  // 이미지와 함께 보낸 입력은 글 부분, 슬래시 명령은 "/이름 인자"
  assert.equal(
    summarizeTranscript([human(6, [{ type: "image" }, { type: "text", text: "이 화면 봐줘" }])], "/repo").lastPrompt,
    "이 화면 봐줘",
  );
  assert.equal(
    summarizeTranscript([human(7, "<command-message>design</command-message>\n<command-name>/design</command-name>\n<command-args>시안 F</command-args>")], "/repo").lastPrompt,
    "/design 시안 F",
  );
  // origin이 없는 옛 기록은 last-prompt 그대로
  assert.equal(summarizeTranscript([{ type: "last-prompt", lastPrompt: "옛 방식" }, result(1, "t1")], "/repo").lastPrompt, "옛 방식");
});

test("summarizeTranscript·buildOffice: model = 가장 최근 응답의 모델(<synthetic> 제외), 책상까지 전달", () => {
  const m = (sec, model) => ({ ...asst(sec, "end_turn"), message: { model, stop_reason: "end_turn", content: [] } });
  assert.equal(summarizeTranscript([], "/r").model, null);
  // /model로 바꾸면 최신 값을 따른다. 중단·오류 때 끼는 <synthetic>은 모델이 아니다
  assert.equal(
    summarizeTranscript([m(0, "claude-opus-5-5"), m(1, "claude-fable-5-1"), m(2, "<synthetic>")], "/r").model,
    "claude-fable-5-1",
  );
  const o = buildOffice([input(1, "r", null, { status: "busy", statusUpdatedAt: NOW - M }, { model: "claude-fable-5-1" })], NOW);
  assert.equal(o.desks[0].model, "claude-fable-5-1");
});

test("buildOffice: 책상 lastEventAt = 팀장 기록의 마지막 시각(말풍선 겹침 순서, T44)", () => {
  const o = buildOffice([input(1, "r", null, { status: "busy", statusUpdatedAt: NOW - M }, { lastEventAt: NOW - 5e3 })], NOW);
  assert.equal(o.desks[0].lastEventAt, NOW - 5e3);
});

test("buildOffice: full — 질문은 finalText 전체, 권한은 bubble, 작업 중은 가장 최근에 한 말 전체(없으면 null)", () => {
  const long = "서두 설명입니다.\n\n이대로 진행할까요?";
  const o = buildOffice(
    [
      input(1, "r", null, { status: "busy" }, { turnEnded: true, turnEndedAt: NOW - M, endedWithQuestion: true, question: "이대로 진행할까요?", finalText: long, lastEventAt: NOW - M }, []),
      input(2, "r", null, { status: "waiting", waitingFor: "permission prompt", statusUpdatedAt: NOW - M }, { pendingTool: { name: "Bash", verb: "실행", detail: "rm -rf dist" }, lastEventAt: NOW - M }, []),
      input(3, "r", null, { status: "busy", statusUpdatedAt: NOW - M }, { current: "useAuth.ts 수정 중", lastEventAt: NOW - M }, []),
      input(4, "r", null, { status: "busy", statusUpdatedAt: NOW - M }, { current: "useAuth.ts 수정 중", said: "원인을 찾았습니다.", saidFull: "원인을 찾았습니다.\n\n둘째 문단", lastEventAt: NOW - M }, []),
    ],
    NOW,
  );
  assert.equal(o.desks[3].full, "원인을 찾았습니다.\n\n둘째 문단");
  assert.equal(o.desks[0].state, "waiting");
  assert.equal(o.desks[0].full, long);
  assert.equal(o.desks[1].full, o.desks[1].bubble);
  assert.equal(o.desks[2].full, null);
});

test("buildOffice: full — 방금 끝남은 finalText 전체, 2000자 상한", () => {
  const text = "끝.\n" + "가".repeat(2500);
  const o = buildOffice(
    [input(1, "r", null, { status: "idle", statusUpdatedAt: NOW - M }, { turnEnded: true, turnEndedAt: NOW - M, finalText: text, lastEventAt: NOW - M }, [])],
    NOW,
  );
  assert.equal([...o.desks[0].full].length, 2001); // 2000자 + …
  assert.ok(o.desks[0].full.endsWith("…"));
});

test("buildOffice: full — 휴면 책상은 싣지 않는다(미니 모드에 안 나옴), 휴식은 그대로", () => {
  const o = buildOffice(
    [
      input(1, "r", null, { statusUpdatedAt: NOW - 8 * H }, { turnEnded: true, turnEndedAt: NOW - 8 * H, finalText: "끝.\n둘째 줄" }),
      input(2, "r", null, { statusUpdatedAt: NOW - 25 * H }, { turnEnded: true, turnEndedAt: NOW - 25 * H, endedWithQuestion: true, question: "할까요?", finalText: "설명\n할까요?" }),
      input(3, "r", null, { statusUpdatedAt: NOW - H }, { turnEnded: true, turnEndedAt: NOW - H, finalText: "끝.\n둘째 줄" }),
    ],
    NOW,
  );
  assert.deepEqual(
    o.desks.map((d) => [d.state, d.full]),
    [["dormant", null], ["dormant", null], ["resting", "끝.\n둘째 줄"]],
  );
});

test("buildOffice: background — 턴·위임 작업 없이 백그라운드 셸만 남은 세션(status shell)만 true, 분류는 그대로", () => {
  const o = buildOffice(
    [
      input(1, "r", null, { status: "shell", statusUpdatedAt: NOW - 5 * D }, { turnEnded: true, turnEndedAt: NOW - 5 * D, finalText: "dev 서버를 켰습니다." }),
      input(2, "r", null, { status: "busy", statusUpdatedAt: NOW - M }),
      input(3, "r", null, { status: "compacting" }),
      input(4, "r", null, { status: "idle", statusUpdatedAt: NOW - M }),
      input(5, "r", null, { status: "shell", statusUpdatedAt: NOW - M }, { turnEnded: true, turnEndedAt: NOW - M, endedWithQuestion: true, question: "켤까요?", finalText: "켤까요?" }),
    ],
    NOW,
  );
  assert.deepEqual(
    o.desks.map((d) => [d.state, d.rawStatus, d.background]),
    [
      ["working", "shell", true],
      ["working", null, false],
      ["working", "compacting", false],
      ["resting", null, false],
      ["waiting", null, false], // 질문으로 끝낸 턴은 셸이 돌아도 나를 기다림이 우선
    ],
  );
  assert.equal(o.counts.working, 3);
});

test("classifyDesk: 백그라운드 세션(kind bg)은 쉬는 기준이 대화 기록의 마지막 시각 — 재기동이 statusUpdatedAt을 새로 써도 휴면. 대화형은 그대로", () => {
  const restarted = { status: "idle", statusUpdatedAt: NOW - M }; // supervisor가 막 다시 띄움
  const old = sum({ lastEventAt: NOW - 9 * H });
  const bg = (o = {}) => term(1, { ...restarted, kind: "bg", ...o });
  assert.deepEqual(classifyDesk(bg(), old, [], NOW), st("dormant", null, NOW - 9 * H));
  assert.deepEqual(
    classifyDesk(bg(), sum({ lastEventAt: NOW - 5 * M }), [], NOW),
    st("resting", null, NOW - 5 * M),
  );
  assert.deepEqual(classifyDesk(bg(), sum(), [], NOW), st("resting", null, NOW - M)); // 기록이 없으면 statusUpdatedAt
  assert.deepEqual(classifyDesk(term(1, restarted), old, [], NOW), st("resting", null, NOW - M)); // 대화형은 지금처럼
});
