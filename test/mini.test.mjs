import { test } from "node:test";
import assert from "node:assert/strict";
import {
  visibleDesks,
  avatarState,
  elapsedText,
  waitLevel,
  chickCount,
  bubbleText,
  canExpand,
  overflowCount,
  expandedAfter,
} from "../public/mini-model.mjs";

const NOW = Date.parse("2026-11-10T09:00:00Z");
const d = (pid, state, since, extra = {}) => ({
  pid,
  state,
  since,
  team: [],
  bubble: null,
  full: null,
  ...extra,
});

test("visibleDesks: 휴면 제외, 기다림(오래된 순)→작업→휴식, 같은 상태는 입력 순서", () => {
  const out = visibleDesks(
    [
      d(1, "resting", NOW - 1e3),
      d(2, "waiting", NOW - 60e3),
      d(3, "dormant", 0),
      d(4, "working", NOW),
      d(5, "waiting", NOW - 600e3),
      d(6, "working", NOW - 5e3),
    ],
    NOW,
  );
  assert.deepEqual(
    out.map((x) => x.pid),
    [5, 2, 4, 6, 1],
  );
  assert.equal(visibleDesks([], NOW).length, 0);
});

test("avatarState: waiting→alert, working→work, 5분 안 resting→done, 그 밖 idle", () => {
  assert.equal(avatarState(d(1, "waiting", NOW), NOW), "alert");
  assert.equal(avatarState(d(1, "working", NOW), NOW), "work");
  assert.equal(avatarState(d(1, "resting", NOW - 4 * 60e3), NOW), "done");
  assert.equal(avatarState(d(1, "resting", NOW - 6 * 60e3), NOW), "idle");
});

test("elapsedText: 분, 시간+분, 음수는 0m", () => {
  assert.equal(elapsedText(7 * 60e3), "7m");
  assert.equal(elapsedText(72 * 60e3), "1h 12m");
  assert.equal(elapsedText(-5), "0m");
  assert.equal(elapsedText(NaN), "0m");
});

test("waitLevel: 5분·15분 경계", () => {
  assert.equal(waitLevel(0), 1);
  assert.equal(waitLevel(5 * 60e3), 2);
  assert.equal(waitLevel(15 * 60e3), 3);
});

test("chickCount: 일하는 팀원 수", () => {
  assert.equal(chickCount(d(1, "working", NOW)), 0);
  assert.equal(
    chickCount(
      d(1, "working", NOW, {
        team: [{ working: true }, { working: false }, { working: true }],
      }),
    ),
    2,
  );
});

test("bubbleText: 늘 최근 응답 — 기다림은 bubble, 그 밖은 said(없으면 bubble), 아무 말도 없으면 null", () => {
  assert.equal(
    bubbleText(d(1, "working", NOW, { bubble: "실행: npm test", said: "고쳤습니다" })),
    "고쳤습니다",
  );
  assert.equal(bubbleText(d(1, "working", NOW, { bubble: "수정 중" })), "수정 중");
  assert.equal(
    bubbleText(d(1, "waiting", NOW, { bubble: "답변 필요", said: "옛 말" })),
    "답변 필요",
  );
  assert.equal(bubbleText(d(1, "resting", NOW, { said: "끝났습니다" })), "끝났습니다");
  assert.equal(bubbleText(d(1, "resting", NOW)), null);
});

test("canExpand: 보이는 글과 full이 같거나 full이 없으면 false, 작업 중·휴식도 전문이 있으면 true", () => {
  assert.equal(
    canExpand(
      d(1, "waiting", NOW, {
        bubble: "권한 승인 필요 · Bash",
        full: "권한 승인 필요 · Bash",
      }),
    ),
    false,
  );
  assert.equal(
    canExpand(
      d(1, "waiting", NOW, { bubble: "질문 남김: 진행?", full: "서두\n진행?" }),
    ),
    true,
  );
  assert.equal(
    canExpand(
      d(1, "working", NOW, { bubble: "수정 중", full: "수정 중 전문" }),
    ),
    true,
  );
  assert.equal(
    canExpand(d(1, "resting", NOW, { said: "한 줄", full: "한 줄" })),
    false,
  );
  assert.equal(canExpand(d(1, "waiting", NOW, { bubble: "답변 필요" })), false);
});

test("overflowCount: 칸 80·여백 24 기준으로 안 보이는 수", () => {
  assert.equal(overflowCount(30, 1440), 13);
  assert.equal(overflowCount(3, 1440), 0);
  assert.equal(overflowCount(0, 300), 0);
});

test("expandedAfter: 펼친 세션이 사라지거나 펼칠 말풍선이 없어지면 null", () => {
  const list = [
    d(1, "waiting", NOW, { bubble: "질문 남김: 진행?", full: "서두\n진행?" }),
    d(2, "working", NOW, { bubble: "수정 중", full: null }),
    d(3, "waiting", NOW, { bubble: "권한 승인 필요 · Bash", full: "권한 승인 필요 · Bash" }),
  ];
  assert.equal(expandedAfter(1, list), 1);
  assert.equal(expandedAfter(2, list), null); // working으로 바뀜
  assert.equal(expandedAfter(3, list), null); // full === bubble
  assert.equal(expandedAfter(9, list), null); // 퇴근
  assert.equal(expandedAfter(null, list), null);
});

test("overflowCount: rowWidth(▲ 40px 뺀 #row 너비) 기준 — 왼쪽 여백 24만 뺀다", () => {
  assert.equal(overflowCount(30, 1384), 13); // floor((1384-24)/80) = 17
});

test("signText: 왜 기다리는지 — 승인·질문, 모르면 답 필요", async () => {
  const { signText } = await import("../public/mini-model.mjs");
  assert.equal(signText({ reason: "permission" }), "승인");
  assert.equal(signText({ reason: "question" }), "질문");
  assert.equal(signText({ reason: null }), "답 필요");
});

test("peekLines: 위치는 중복 없이, 요청은 첫 줄, 지금은 작업 중일 때만, 빈 줄은 뺀다", async () => {
  const { peekLines } = await import("../public/mini-model.mjs");
  const base = {
    zone: "my-registry",
    worktree: "petshop",
    branch: "petshop",
    lastPrompt: "서버 다시 켜줘\n둘째 줄",
    activity: [
      { verb: "실행", detail: "npm run dist" },
      { verb: "읽기", detail: "a.md" },
    ],
    links: [
      { kind: "PR", label: "PR #150" },
      { kind: "PR", label: "PR #149" },
      { kind: "Jira", label: "DATADEV-62" },
    ],
  };
  assert.deepEqual(peekLines({ ...base, state: "working" }), [
    ["위치", "my-registry · petshop"],
    ["요청", "서버 다시 켜줘"],
    ["지금", "실행 npm run dist"],
    ["링크", "PR #150 · DATADEV-62"],
  ]);
  assert.deepEqual(
    peekLines({ zone: "toys", worktree: null, branch: null, state: "resting", lastPrompt: null, activity: base.activity }),
    [["위치", "toys"]],
  );
});

test("elapsedShort: 단위 하나만 — 분·시간·일", async () => {
  const { elapsedShort } = await import("../public/mini-model.mjs");
  assert.deepEqual(
    [0, 59 * 60e3, 60 * 60e3, 23 * 3600e3, 139 * 3600e3].map(elapsedShort),
    ["0m", "59m", "1h", "23h", "5d"],
  );
});

test("whereShort: 구역, worktree가 있으면 › 로 잇고 같은 이름은 한 번만", async () => {
  const { whereShort } = await import("../public/mini-model.mjs");
  assert.equal(whereShort({ zone: "toys", worktree: null }), "toys");
  assert.equal(
    whereShort({ zone: "petshop-client", worktree: "ui-poc" }),
    "petshop-client › ui-poc",
  );
  assert.equal(whereShort({ zone: "x", worktree: "x" }), "x");
});
