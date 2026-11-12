import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("../server.mjs", import.meta.url));

// 서버를 Claude 디렉터리(기본은 빈 것)로 띄우고 "Agent Office:" 줄이 찍힐 때까지 기다린다
function startServer(port, claudeDir = mkdtempSync(join(tmpdir(), "ao-claude-"))) {
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      AGENT_OFFICE_CLAUDE_DIR: claudeDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ready = new Promise((resolve, reject) => {
    let out = "";
    child.stdout.on("data", (c) => {
      out += c;
      if (out.includes("Agent Office:")) resolve();
    });
    child.stderr.on("data", (c) => reject(new Error(String(c))));
    child.on("exit", (code) => reject(new Error(`exit ${code}`)));
  });
  return { child, ready };
}

test("GET /api/state: version은 package.json과 같다", async () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const port = 45450 + Math.floor(Math.random() * 100);
  const { child, ready } = startServer(port);
  try {
    await ready;
    const res = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { host: `127.0.0.1:${port}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.version, pkg.version);
    assert.ok(Array.isArray(body.desks));
  } finally {
    child.kill();
  }
});

test("잘못된 요청 URL(//)은 400이고 서버는 계속 산다", async () => {
  const port = 45550 + Math.floor(Math.random() * 100);
  const { child, ready } = startServer(port);
  try {
    await ready;
    // fetch는 URL을 정규화해 //를 그대로 보낼 수 없다. 요청 줄을 소켓에 직접 쓴다
    const head = await new Promise((resolve, reject) => {
      const s = connect(port, "127.0.0.1", () =>
        s.write(
          `GET // HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
        ),
      );
      let out = "";
      s.on("data", (c) => (out += c));
      s.on("end", () => resolve(out));
      s.on("error", reject);
    });
    assert.match(head, /^HTTP\/1\.1 400/);
    const res = await fetch(`http://127.0.0.1:${port}/api/state`);
    assert.equal(res.status, 200);
  } finally {
    child.kill();
  }
});

test("GET /api/state?pid=N: desks는 그 pid 하나(없으면 빈 배열), 나머지는 그대로, 숫자 아닌 pid는 400", async () => {
  // 살아 있는 pid 둘(이 테스트 프로세스와 부모)로 세션 파일을 만든다. 기록이 없어도 팀장은 이름과 상태로 남는다
  const claudeDir = mkdtempSync(join(tmpdir(), "ao-claude-"));
  mkdirSync(join(claudeDir, "sessions"));
  for (const pid of [process.pid, process.ppid])
    writeFileSync(
      join(claudeDir, "sessions", `${pid}.json`),
      JSON.stringify({
        pid,
        sessionId: `s${pid}`,
        cwd: claudeDir,
        kind: "interactive",
        status: "idle",
        statusUpdatedAt: Date.now(),
      }),
    );
  const port = 45650 + Math.floor(Math.random() * 100);
  const { child, ready } = startServer(port, claudeDir);
  const get = (q) => fetch(`http://127.0.0.1:${port}/api/state${q}`);
  try {
    await ready;
    const all = await (await get("")).json();
    assert.equal(all.desks.length, 2);

    const res = await get(`?pid=${process.pid}`);
    assert.equal(res.status, 200);
    const one = await res.json();
    assert.deepEqual(one.desks.map((d) => d.pid), [process.pid]);
    assert.deepEqual(Object.keys(one), Object.keys(all));
    assert.deepEqual(one.counts, all.counts); // 전체 세션 기준 그대로
    assert.equal(one.version, all.version);
    assert.equal(typeof one.generatedAt, "number");

    assert.deepEqual((await (await get("?pid=999999999")).json()).desks, []);
    for (const bad of ["abc", "1.5", "-1", ""])
      assert.equal((await get(`?pid=${bad}`)).status, 400, `pid=${bad}`);
  } finally {
    child.kill();
  }
});
