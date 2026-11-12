import { test } from "node:test";
import assert from "node:assert/strict";
import {
  envOf,
  targetOf,
  pickGhostty,
  parseGhosttyList,
} from "../lib/focus.mjs";

const H = "term_50eaa67e-81c0-49e2-b5b5-0adcdba04dc6";

test("envOf: ps eww 한 줄에서 고른 키만, 뒤(환경 변수)가 앞(명령줄)을 이긴다", () => {
  const line = `claude --resume x TERM_PROGRAM=fake ORCA_AGENT_HOOK_TOKEN=secret TERM_PROGRAM=Orca ORCA_TERMINAL_HANDLE=${H}`;
  assert.deepEqual(envOf(line, ["TERM_PROGRAM", "ORCA_TERMINAL_HANDLE"]), {
    TERM_PROGRAM: "Orca",
    ORCA_TERMINAL_HANDLE: H,
  });
});

test("targetOf: Orca는 식별자, Ghostty는 앱, 그 밖은 번들 id, 모양이 틀리면 버린다", () => {
  assert.deepEqual(
    targetOf({ ORCA_TERMINAL_HANDLE: H, TERM_PROGRAM: "Orca" }),
    {
      app: "Orca",
      handle: H,
    },
  );
  assert.deepEqual(targetOf({ TERM_PROGRAM: "ghostty" }), { app: "Ghostty" });
  assert.deepEqual(
    targetOf({
      TERM_PROGRAM: "iTerm.app",
      __CFBundleIdentifier: "com.googlecode.iterm2",
    }),
    { app: "iTerm.app", bundle: "com.googlecode.iterm2" },
  );
  // 명령 인자로 넘어갈 값이라 모양을 검사한다
  assert.equal(targetOf({ ORCA_TERMINAL_HANDLE: "term_x; rm -rf ~" }), null);
  assert.equal(targetOf({ __CFBundleIdentifier: "com.x -a Evil" }), null);
  assert.equal(targetOf({}), null);
});

test("parseGhosttyList: id·폴더·제목(탭 구분) 줄들", () => {
  assert.deepEqual(parseGhosttyList("A\t/p\t✳ 제목\nB\t/q\t~\n"), [
    { id: "A", dir: "/p", name: "✳ 제목" },
    { id: "B", dir: "/q", name: "~" },
  ]);
});

test("pickGhostty: 같은 폴더에서 제목(앞 상태 기호 뗀 것)이 같은 하나, 없으면 그 폴더 창이 하나일 때만", () => {
  const terms = [
    { id: "A", dir: "/a", name: "✳ Agent Office 구현 실행" },
    { id: "B", dir: "/a", name: "◑ declarative-dazzling-oasis 세션 인계" },
    { id: "C", dir: "/b", name: "~" },
    { id: "D", dir: "/c", name: "✳ 다른 제목" },
  ];
  assert.equal(
    pickGhostty(terms, {
      cwd: "/a",
      title: "declarative-dazzling-oasis 세션 인계",
    }),
    "B",
  );
  assert.equal(pickGhostty(terms, { cwd: "/b", title: "레포 파악" }), "C");
  // 같은 폴더 창이 여럿인데 제목이 안 맞으면 고르지 않는다(엉뚱한 창으로 가지 않게)
  assert.equal(pickGhostty(terms, { cwd: "/a", title: "없는 제목" }), null);
  assert.equal(pickGhostty(terms, { cwd: "/z", title: "x" }), null);
  assert.equal(pickGhostty(terms, { cwd: "/c", title: null }), "D");
});

import { attachHelp, parseClients, etimeSec } from "../lib/focus.mjs";

test("attachHelp(bg 세션, 붙은 클라이언트도 agent view도 없을 때): 명령을 클립보드에(pbcopy), supervisor를 띄운 터미널 앱만 앞으로 — 탭은 고르지 않는다", async () => {
  const calls = [];
  const fake = (envLine, fail = {}) => async (cmd, args, input) => {
    calls.push([cmd, ...args, ...(input === undefined ? [] : [`<${input}`])]);
    if (fail[cmd]) return { err: new Error("x"), out: "" };
    return { err: null, out: cmd === "ps" ? envLine : "" };
  };
  const desk = { pid: 7, jobId: "29c7856c" };
  // supervisor를 Orca에서 띄웠으면 Orca 앱만(orca terminal switch로 탭을 고르지 않는다 — 그 탭은 엉뚱한 탭)
  assert.deepEqual(await attachHelp(desk, fake(`claude ORCA_TERMINAL_HANDLE=${H}`)), {
    ok: true,
    app: "Orca",
    partial: "복사함: claude attach 29c7856c · Orca에서 새 탭을 열고 붙여넣기(⌘V)",
  });
  assert.deepEqual(calls, [
    ["pgrep", "-U", String(process.getuid()), "-lf", "^([^ ]*/)?claude (agents|attach)( |$)"],
    ["pbcopy", "<claude attach 29c7856c"],
    ["ps", "eww", "-o", "command=", "-p", "7"],
    ["open", "-b", "com.stablyai.orca"],
  ]);
  calls.length = 0;
  assert.equal((await attachHelp(desk, fake("claude TERM_PROGRAM=ghostty"))).app, "Ghostty");
  assert.deepEqual(calls.at(-1), ["open", "-b", "com.mitchellh.ghostty"]);
  // 어느 앱인지 모르면 열지 않고 안내만
  calls.length = 0;
  assert.deepEqual(await attachHelp(desk, fake("claude")), {
    ok: true,
    partial: "복사함: claude attach 29c7856c · 터미널을 열고 붙여넣기(⌘V)",
  });
  assert.equal(calls.some(([c]) => c === "open"), false);
  // 앱 열기 실패도 같은 안내
  assert.equal(
    (await attachHelp(desk, fake("claude TERM_PROGRAM=ghostty", { open: true }))).partial,
    "복사함: claude attach 29c7856c · 터미널을 열고 붙여넣기(⌘V)",
  );
  // 복사 실패: 명령을 직접 치도록
  assert.equal(
    (await attachHelp(desk, fake("claude TERM_PROGRAM=ghostty", { pbcopy: true }))).partial,
    "복사하지 못했다: claude attach 29c7856c · Ghostty에서 새 탭을 열고 직접 입력",
  );
  // jobId 없음 → 아무것도 실행하지 않는다
  calls.length = 0;
  assert.deepEqual(await attachHelp({ pid: 7, jobId: null }, fake("")), {
    ok: false,
    reason: "백그라운드 세션이라 붙은 터미널이 없다",
  });
  assert.deepEqual(calls, []);
});

test("parseClients·etimeSec: 실행 파일이 claude이고 첫 인자가 agents·attach인 줄만, etime은 초", () => {
  assert.deepEqual(
    parseClients(
      "85177 claude agents\n90001 /Users/me/.local/bin/claude attach 29c7856c\n90002 claude attach\n90003 vim notes claude agents\n",
    ),
    [
      { pid: 85177, kind: "agents", id: null },
      { pid: 90001, kind: "attach", id: "29c7856c" },
      { pid: 90002, kind: "attach", id: null },
    ],
  );
  assert.equal(etimeSec("13:58"), 13 * 60 + 58);
  assert.equal(etimeSec("01:02:03"), 3723);
  assert.equal(etimeSec("2-01:02:03"), 2 * 86400 + 3723);
});

test("attachHelp: 그 잡에 붙은 claude attach가 있으면 그 터미널로(복사 없음), 없으면 가장 최근 agent view로(복사), 둘 다 실패하면 supervisor 앱", async () => {
  const desk = { pid: 7, jobId: "29c7856c", title: "로그 포맷 통일", cwd: "/w" };
  const calls = [];
  const focused = [];
  // pgrep 결과·etime·각 프로세스 작업 폴더를 정해 주는 가짜 실행기와 가짜 focusTerminal
  const world = ({ clients, etime = "", focusResult = () => ({ ok: true, app: "Ghostty" }) }) => [
    async (cmd, args, input) => {
      calls.push([cmd, ...args, ...(input === undefined ? [] : [`<${input}`])]);
      if (cmd === "pgrep") return { err: clients ? null : new Error("no match"), out: clients ?? "" };
      if (cmd === "ps" && args[1] === "pid=,etime=") return { err: null, out: etime };
      if (cmd === "lsof") return { err: null, out: `p${args[2]}\nfcwd\nn/cwd-of-${args[2]}\n` };
      if (cmd === "ps") return { err: null, out: `claude TERM_PROGRAM=Orca ORCA_TERMINAL_HANDLE=${H}` }; // supervisor env(실측: Orca 핸들 있음)
      return { err: null, out: "" };
    },
    async (d) => (focused.push(d), focusResult(d)),
  ];

  // 1) 이 잡에 붙은 attach(90001)가 있으면 agent view(85177)보다 먼저, 복사하지 않는다. 다른 잡의 attach(90009)는 무시
  calls.length = focused.length = 0;
  let [exec, focus] = world({
    clients: "85177 claude agents\n90009 claude attach ffffffff\n90001 claude attach 29c7856c\n",
    etime: " 85177 13:58\n 90009 00:10\n 90001 02:00\n",
  });
  assert.deepEqual(await attachHelp(desk, exec, focus), {
    ok: true,
    app: "Ghostty",
    partial: "이미 붙어 있는 Ghostty 터미널로 옮겼다",
  });
  assert.deepEqual(focused, [{ pid: 90001, cwd: "/cwd-of-90001", title: "로그 포맷 통일" }]);
  assert.equal(calls.some(([c]) => c === "pbcopy"), false);

  // 2) 붙은 클라이언트가 없으면 가장 최근에 띄운 agent view(etime이 작은 85178)로 + 복사
  calls.length = focused.length = 0;
  [exec, focus] = world({
    clients: "85177 claude agents\n85178 claude agents\n",
    etime: " 85177 13:58\n 85178 00:30\n",
  });
  assert.deepEqual(await attachHelp(desk, exec, focus), {
    ok: true,
    app: "Ghostty",
    partial: "복사함: claude attach 29c7856c · Ghostty의 agent view로 옮겼다(목록에서 고르거나 새 탭에서 ⌘V)",
  });
  assert.deepEqual(focused.map((d) => d.pid), [85178]);
  assert.equal(calls.filter(([c]) => c === "pbcopy").length, 1);

  // 3) agent view로 못 가면(focus 실패) supervisor 앱으로, 복사는 한 번만
  calls.length = focused.length = 0;
  [exec, focus] = world({
    clients: "85177 claude agents\n",
    etime: " 85177 13:58\n",
    focusResult: () => ({ ok: false, reason: "x" }),
  });
  assert.deepEqual(await attachHelp(desk, exec, focus), {
    ok: true,
    app: "Orca",
    partial: "복사함: claude attach 29c7856c · Orca에서 새 탭을 열고 붙여넣기(⌘V)",
  });
  assert.equal(calls.filter(([c]) => c === "pbcopy").length, 1);
  assert.deepEqual(calls.at(-1), ["open", "-b", "com.stablyai.orca"]);
});
