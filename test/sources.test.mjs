import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  realpathSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import {
  isAlive,
  listTerminals,
  findTranscript,
  readTail,
  readSessionStart,
  readTeam,
  zoneOf,
  collectOffice,
} from "../lib/sources.mjs";

const tmp = (p = "ao-") => realpathSync(mkdtempSync(join(tmpdir(), p)));
const deadPid = () => spawnSync("true").pid;
const line = (o) => JSON.stringify(o) + "\n";
const term = (o = {}) =>
  JSON.stringify({
    pid: process.pid,
    sessionId: "sid",
    cwd: "/r",
    name: "n1",
    status: "busy",
    statusUpdatedAt: 1000,
    kind: "interactive",
    ...o,
  });

test("isAlive", () => {
  assert.equal(isAlive(process.pid), true);
  assert.equal(isAlive(deadPid()), false);
  assert.equal(isAlive(0), false); // kill(0, 0)은 프로세스 그룹 전체라 항상 성공한다
});

test("listTerminals: 살아 있는 대화형만, 깨진 json과 key 파일은 건너뜀", () => {
  const dir = tmp();
  mkdirSync(join(dir, "sessions"));
  writeFileSync(join(dir, "sessions", "a.json"), term());
  writeFileSync(join(dir, "sessions", "b.json"), term({ pid: deadPid() }));
  writeFileSync(join(dir, "sessions", "c.json"), term({ kind: "sdk" }));
  writeFileSync(join(dir, "sessions", "d.json"), '{"pid":');
  writeFileSync(join(dir, "sessions", "a.abc.key"), "secret");
  writeFileSync(join(dir, "sessions", "e.json"), term({ cwd: undefined })); // 형식이 깨진 파일
  assert.deepEqual(listTerminals(dir), [
    {
      pid: process.pid,
      sessionId: "sid",
      cwd: "/r",
      name: "n1",
      status: "busy",
      waitingFor: null,
      statusUpdatedAt: 1000,
    },
  ]);
  assert.deepEqual(listTerminals(tmp()), []); // sessions 폴더 없음
});

test("findTranscript", () => {
  const dir = tmp();
  mkdirSync(join(dir, "projects", "-a-b"), { recursive: true });
  writeFileSync(join(dir, "projects", "-a-b", "sid.jsonl"), "");
  assert.equal(
    findTranscript(dir, "sid"),
    join(dir, "projects", "-a-b", "sid.jsonl"),
  );
  assert.equal(findTranscript(dir, "nope"), null);
  assert.equal(findTranscript(tmp(), "sid"), null); // projects 폴더 없음
  assert.equal(findTranscript(dir, "../-a-b/sid"), null); // 경로 문자가 든 sessionId
});

test("readTail: 쓰는 중인 마지막 줄과 잘린 첫 줄은 버리고, 파일이 자라면 다시 읽음", () => {
  const f = join(tmp(), "t.jsonl");
  writeFileSync(f, line({ n: 1 }) + line({ n: 2 }) + '{"n":3'); // 8 + 8 + 6 바이트
  assert.deepEqual(
    readTail(f).map((r) => r.n),
    [1, 2],
  );
  assert.deepEqual(
    readTail(f, 15).map((r) => r.n),
    [2],
  ); // 줄1의 '\n'부터 읽음 → 첫 조각 버림
  appendFileSync(f, "}\n");
  assert.deepEqual(
    readTail(f).map((r) => r.n),
    [1, 2, 3],
  );
  const g = join(tmp(), "g.jsonl"); // 객체가 아닌 줄은 버린다
  writeFileSync(g, "null\n" + line({ n: 1 }));
  assert.deepEqual(
    readTail(g).map((r) => r.n),
    [1],
  );
});

test("readSessionStart: 첫 타임스탬프", () => {
  const f = join(tmp(), "s.jsonl");
  writeFileSync(
    f,
    line({ type: "mode" }) +
      line({ type: "user", timestamp: "2026-10-20T09:08:25.590Z" }),
  );
  assert.equal(readSessionStart(f), Date.parse("2026-10-20T09:08:25.590Z"));
  assert.equal(readSessionStart(join(tmp(), "none.jsonl")), null);
});

test("readTeam: subagents 폴더의 meta와 기록", () => {
  const dir = tmp();
  const t = join(dir, "sid.jsonl");
  writeFileSync(t, "");
  assert.deepEqual(readTeam(t), []);
  const sub = join(dir, "sid", "subagents");
  mkdirSync(sub, { recursive: true });
  writeFileSync(
    join(sub, "agent-a1.meta.json"),
    JSON.stringify({ agentType: "Explore", description: "코드 탐색" }),
  );
  writeFileSync(
    join(sub, "agent-a1.jsonl"),
    line({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", name: "Grep", input: { pattern: "x" } }],
      },
    }),
  );
  writeFileSync(
    join(sub, "agent-a2.meta.json"),
    JSON.stringify({ agentType: "Plan", description: "계획", finished: true }),
  );
  writeFileSync(join(sub, "agent-a2.jsonl"), line({ type: "assistant" })); // 퇴근한 팀원 기록은 읽지 않는다
  const team = readTeam(t).sort((a, b) => a.agentId.localeCompare(b.agentId));
  assert.deepEqual(
    team.map((m) => [
      m.agentId,
      m.agentType,
      m.description,
      m.finished,
      m.records.length,
    ]),
    [
      ["a1", "Explore", "코드 탐색", false, 1],
      ["a2", "Plan", "계획", true, 0],
    ],
  );
  assert.equal(typeof team[1].mtimeMs, "number");
});

test("zoneOf: worktree는 원래 레포 구역, 레포 아닌 폴더·없는 경로는 폴더 이름", () => {
  const root = tmp();
  const repo = join(root, "myrepo");
  mkdirSync(repo);
  const git = (...a) =>
    execFileSync("git", ["-C", repo, ...a], { stdio: "pipe" });
  git("init", "-q");
  git(
    "-c",
    "user.email=t@t",
    "-c",
    "user.name=t",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "init",
  );
  git("worktree", "add", "-q", join(root, "wt-feature"));
  const plain = join(root, "plain-folder");
  mkdirSync(plain);
  assert.deepEqual(zoneOf(repo), { zone: "myrepo", worktree: null });
  assert.deepEqual(zoneOf(join(root, "wt-feature")), {
    zone: "myrepo",
    worktree: "wt-feature",
  });
  assert.deepEqual(zoneOf(plain), { zone: "plain-folder", worktree: null });
  assert.deepEqual(zoneOf("/definitely/not/here"), {
    zone: "here",
    worktree: null,
  });
});

test("collectOffice: 기록을 읽어 자리를 만들고, 기록이 없거나 못 읽어도 팀장은 남음", () => {
  const dir = tmp();
  mkdirSync(join(dir, "sessions"));
  mkdirSync(join(dir, "projects", "-x"), { recursive: true });
  const cwd = tmp("plain-");
  const now = Date.now();
  writeFileSync(
    join(dir, "sessions", "a.json"),
    term({ sessionId: "sid", cwd, statusUpdatedAt: now }),
  );
  writeFileSync(
    join(dir, "projects", "-x", "sid.jsonl"),
    line({ type: "ai-title", aiTitle: "제목" }) +
      line({
        type: "assistant",
        timestamp: new Date(now).toISOString(),
        message: {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "t",
              name: "Read",
              input: { file_path: join(cwd, "a.ts") },
            },
          ],
        },
      }),
  );
  writeFileSync(
    join(dir, "sessions", "b.json"),
    term({
      sessionId: "no-transcript",
      cwd,
      name: "새 터미널",
      status: "waiting",
      waitingFor: "input needed",
      statusUpdatedAt: now,
    }),
  );
  writeFileSync(
    join(dir, "sessions", "c.json"),
    term({ sessionId: "locked", cwd, name: "잠긴 기록", statusUpdatedAt: now }),
  );
  writeFileSync(
    join(dir, "projects", "-x", "locked.jsonl"),
    line({ type: "ai-title", aiTitle: "안 보여야 함" }),
  );
  chmodSync(join(dir, "projects", "-x", "locked.jsonl"), 0o000);

  const o = collectOffice(dir, now);
  const { desks } = o;
  assert.deepEqual(
    desks.map((d) => d.title).sort(),
    ["새 터미널", "잠긴 기록", "제목"].sort(),
  );
  const d = desks.find((x) => x.title === "제목");
  assert.deepEqual(
    [d.bubble, typeof d.sessionStart, d.zone],
    ["a.ts 읽는 중", "number", cwd.split("/").pop()],
  );
  assert.deepEqual(
    desks.filter((x) => x.state === "waiting").map((x) => x.title),
    ["새 터미널"],
  );
});

test("collectOffice: 링크는 세션 동안 남고(기록 끝 밖으로 밀려나도), 세션이 바뀌면 비운다", () => {
  const dir = tmp();
  mkdirSync(join(dir, "sessions"));
  mkdirSync(join(dir, "projects", "-x"), { recursive: true });
  const cwd = tmp("plain-");
  const now = Date.now();
  const ts = new Date(now).toISOString();
  const log = join(dir, "projects", "-x", "lnk.jsonl");
  const session = (sessionId) =>
    writeFileSync(
      join(dir, "sessions", "a.json"),
      term({ sessionId, cwd, statusUpdatedAt: now }),
    );
  const labels = () => collectOffice(dir, now).desks[0].links.map((l) => l.label);
  session("lnk");
  writeFileSync(
    log,
    line({
      type: "assistant",
      timestamp: ts,
      message: {
        content: [
          { type: "tool_use", id: "p", name: "Bash", input: { command: "gh pr create" } },
        ],
      },
    }) +
      line({
        type: "user",
        timestamp: ts,
        message: {
          content: [
            { type: "tool_result", tool_use_id: "p", content: "https://github.com/o/r/pull/3" },
          ],
        },
      }),
  );
  assert.deepEqual(labels(), ["PR #3"]);
  writeFileSync(log, line({ type: "ai-title", aiTitle: "PR 기록이 밀려남" }));
  assert.deepEqual(labels(), ["PR #3"]);
  session("other"); // /clear로 다른 세션을 맡음
  assert.deepEqual(labels(), []);
  session("lnk");
  assert.deepEqual(labels(), []);
});
