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
