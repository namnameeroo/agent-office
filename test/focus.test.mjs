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

import { attachHelp } from "../lib/focus.mjs";

test("attachHelp(bg 세션): 다시 붙는 명령을 클립보드에(pbcopy), 세션을 띄운 터미널 앱만 앞으로 — 탭은 고르지 않는다", async () => {
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
