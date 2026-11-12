import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  visibleDesks,
  avatarState,
  stateAttr,
  waitLevel,
  chickCount,
  bubbleText,
  canExpand,
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

// CSS가 찾는 이름과 코드가 붙이는 이름이 어긋나면 규칙이 조용히 안 먹는다(예: CSS "working" · 코드 "work" → 초록 점이 안 켜짐)
test("mini.css의 data-state·data-level 값은 전부 mini.mjs가 실제로 붙이는 값이다", () => {
  const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8");
  const css = read("mini.css");
  // mini.mjs는 이 두 식으로 붙인다 — 바꾸면 아래 값 모음도 같이 바꿔야 한다
  assert.match(read("mini.mjs"), /setAttr\(cell, "data-state", stateAttr\(st\)\)/);
  assert.match(read("mini.mjs"), /setAttr\(cell, "data-level", String\(waitLevel\(ms\)\)\)/);
  const attached = {
    // avatarState의 모든 갈래: 기다림 · 작업 · 갓 쉼 · 오래 쉼
    "data-state": [
      d(1, "waiting", NOW),
      d(1, "working", NOW),
      d(1, "resting", NOW),
      d(1, "resting", NOW - 3600e3),
    ].map((x) => stateAttr(avatarState(x, NOW))),
    // waitLevel의 모든 갈래: 5분 전 · 5~15분 · 15분 뒤
    "data-level": [0, 5 * 60e3, 15 * 60e3].map((ms) => String(waitLevel(ms))),
  };
  for (const [attr, ok] of Object.entries(attached)) {
    const inCss = [...css.matchAll(new RegExp(`\\[${attr}="([^"]*)"\\]`, "g"))].map((m) => m[1]);
    assert.ok(inCss.length, `mini.css에 [${attr}] 선택자가 없다`);
    for (const v of new Set(inCss))
      assert.ok(ok.includes(v), `mini.css의 [${attr}="${v}"]는 코드가 붙이지 않는다(붙이는 값: ${ok.join(", ")})`);
  }
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
    ["링크", [base.links[0], base.links[2]]], // 종류마다 최신 하나, 누를 수 있게 객체 그대로
  ]);
  assert.deepEqual(
    peekLines({ zone: "toys", worktree: null, branch: null, state: "resting", lastPrompt: null, activity: base.activity }),
    [["위치", "toys"]],
  );
});

test("peekLines 지금: 내용 없는 '생각'보다 내용이 있는 가장 최근 활동, 전부 비면 최신 것", async () => {
  const { peekLines } = await import("../public/mini-model.mjs");
  const now = (activity) =>
    peekLines({ zone: "toys", state: "working", activity }).find(([k]) => k === "지금")?.[1];
  assert.equal(
    now([
      { verb: "생각", detail: "" },
      { verb: "생각", detail: "" },
      { verb: "수정", detail: "lib/a.mjs" },
      { verb: "실행", detail: "npm test" },
    ]),
    "수정 lib/a.mjs",
  );
  assert.equal(now([{ verb: "생각", detail: "" }]), "생각");
  assert.equal(now([]), undefined);
});

test("isBackground·peekLines: 백그라운드 명령만 남은 작업 중 세션은 고리 점 대상이고 '지금'이 따로 말한다", async () => {
  const { isBackground, peekLines } = await import("../public/mini-model.mjs");
  const bg = d(1, "working", NOW, {
    background: true,
    zone: "toys",
    activity: [{ verb: "실행", detail: "npm run dev" }],
  });
  assert.equal(isBackground(bg), true);
  assert.equal(isBackground({ ...bg, background: false }), false);
  assert.equal(isBackground(d(1, "working", NOW)), false); // 옛 서버(값 없음)
  assert.equal(isBackground({ ...bg, state: "waiting" }), false); // 서버는 작업 중일 때만 붙이지만 화면도 지킨다
  assert.deepEqual(peekLines(bg).find(([k]) => k === "지금"), ["지금", "백그라운드 명령만 실행 중"]);
});

test("mdBlocks: 문단·제목·목록·코드 블록·표, 들여 쓴 줄은 항목에 이어 붙임", async () => {
  const { mdBlocks } = await import("../public/mini-model.mjs");
  const src = [
    "## 결과",
    "첫 줄",
    "둘째 줄",
    "",
    "- 하나",
    "  이어지는 줄",
    "* 둘",
    "3. 셋째부터",
    "",
    "```js",
    "const a = 1; // **굵게 아님**",
    "```",
    "| a | b |",
    "|---|---|",
    "#해시태그는 제목이 아님",
  ].join("\r\n");
  assert.deepEqual(mdBlocks(src), [
    { type: "h", inline: [{ t: "text", v: "결과" }] },
    { type: "p", inline: [{ t: "text", v: "첫 줄\n둘째 줄" }] },
    {
      type: "ul",
      start: 1,
      items: [[{ t: "text", v: "하나\n이어지는 줄" }], [{ t: "text", v: "둘" }]],
    },
    { type: "ol", start: 3, items: [[{ t: "text", v: "셋째부터" }]] },
    { type: "pre", text: "const a = 1; // **굵게 아님**" },
    { type: "pre", text: "| a | b |\n|---|---|" },
    { type: "p", inline: [{ t: "text", v: "#해시태그는 제목이 아님" }] },
  ]);
  assert.deepEqual(mdBlocks(""), []);
  assert.deepEqual(mdBlocks(null), []);
  // 닫히지 않은 코드 블록은 끝까지 코드
  assert.deepEqual(mdBlocks("```\nrm -rf x"), [{ type: "pre", text: "rm -rf x" }]);
});

test("mdInline: 굵게·코드·http(s) 링크·맨 주소(끝 구두점 제외), 굵게 안의 코드", async () => {
  const { mdInline } = await import("../public/mini-model.mjs");
  assert.deepEqual(mdInline("**완료**: `npm test` 통과 — [PR](https://example.com/pr/1) 참고"), [
    { t: "b", c: [{ t: "text", v: "완료" }] },
    { t: "text", v: ": " },
    { t: "code", v: "npm test" },
    { t: "text", v: " 통과 — " },
    { t: "a", v: "PR", href: "https://example.com/pr/1" },
    { t: "text", v: " 참고" },
  ]);
  assert.deepEqual(mdInline("주소는 https://example.com/a?b=1. 끝"), [
    { t: "text", v: "주소는 " },
    { t: "a", v: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
    { t: "text", v: ". 끝" },
  ]);
  assert.deepEqual(mdInline("http://localhost:4545에서"), [
    { t: "a", v: "http://localhost:4545", href: "http://localhost:4545" },
    { t: "text", v: "에서" },
  ]);
  assert.deepEqual(mdInline("**`a` 굵게**"), [
    { t: "b", c: [{ t: "code", v: "a" }, { t: "text", v: " 굵게" }] },
  ]);
});

test("mdInline 악성·깨진 입력: 태그는 글자, http(s) 밖 링크는 원문 그대로, 닫히지 않은 **는 글자", async () => {
  const { mdInline, mdBlocks } = await import("../public/mini-model.mjs");
  const tags = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  assert.deepEqual(mdInline(tags), [{ t: "text", v: tags }]);
  for (const bad of [
    "[눌러](javascript:alert(1))",
    "[x](data:text/html,<b>hi</b>)",
    "[x](vbscript:msgbox)",
    "[x](//evil.example/a)",
    "[x](HTTPS://example.com)", // 대문자 스킴도 링크로 만들지 않는다(화면·메인의 http(s) 판정과 같게)
  ])
    assert.ok(
      mdInline(bad).every((t) => t.t === "text") && mdInline(bad).map((t) => t.v).join("") === bad,
      bad,
    );
  assert.deepEqual(mdInline("**미완성 굵게"), [{ t: "text", v: "**미완성 굵게" }]);
  assert.deepEqual(mdInline("****"), [{ t: "text", v: "****" }]);
  assert.deepEqual(mdInline("`열린 코드"), [{ t: "text", v: "`열린 코드" }]);
  // 속성 끼워 넣기: 공백에서 주소가 끝나 링크는 앞부분만, 나머지는 글자
  const attr = mdInline('[x](https://ok.example" onclick="alert(1))');
  assert.ok(attr.filter((t) => t.t === "a").every((t) => !/["\s]/.test(t.href)));
  // 모든 a 토큰은 http(s) — 블록 안까지
  const hrefs = (ts) => ts.flatMap((t) => (t.t === "a" ? [t.href] : t.c ? hrefs(t.c) : []));
  const blocks = mdBlocks("# [a](javascript:x)\n- [b](https://ok.example)\n**[c](file:///etc/passwd)**");
  const all = blocks.flatMap((b) => (b.items ? b.items.flatMap(hrefs) : b.inline ? hrefs(b.inline) : []));
  assert.deepEqual(all, ["https://ok.example"]);
});

test("mdPlain: 접힌 말풍선용 — 기호만 벗긴다", async () => {
  const { mdPlain } = await import("../public/mini-model.mjs");
  assert.equal(mdPlain("**완료**: `npm test` 통과, [PR](https://example.com/1)"), "완료: npm test 통과, PR");
  assert.equal(mdPlain("## 제목"), "제목");
  assert.equal(mdPlain("- 하나\n- 둘"), "하나 둘");
  assert.equal(mdPlain("권한 승인 필요 · Bash"), "권한 승인 필요 · Bash");
  assert.equal(mdPlain("**잘린 굵게…"), "**잘린 굵게…");
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
