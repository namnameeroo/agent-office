// npm run smoke: 개발용 Electron을 빈 포트·임시 userData로 미니 모드에 띄워 캐릭터 창 불변식을 단언한다.
// 측정은 desktop/debug.mjs(AGENT_OFFICE_SMOKE=1)의 [smoke] 줄. 사용자가 띄운 앱(4545)·저장된 캐릭터 위치는 건드리지 않는다.
// 종료 코드 0 = 전부 통과(살아 있는 세션이 없으면 캐릭터 단언은 건너뛰고 0), 1 = 실패. [렌더러] 표시는 렌더러가
// pet:fit의 { shiftX, roomAbove }를 써야 통과하는 단언이다
import electron from "electron";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TIMEOUT = 60_000;
const TOL = 0.5;

const port = await new Promise((resolve) => {
  const s = createServer().listen(0, "127.0.0.1", () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});
const userData = mkdtempSync(join(tmpdir(), "agent-office-smoke-"));
console.log(`smoke: PORT=${port} userData=${userData}`);

const lines = [];
const steps = {};
const child = spawn(electron, ["."], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port),
    AGENT_OFFICE_USER_DATA: userData,
    AGENT_OFFICE_SMOKE: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let buf = "";
const take = (chunk) => {
  buf += chunk;
  const parts = buf.split("\n");
  buf = parts.pop();
  for (const line of parts) {
    lines.push(line);
    if (line.startsWith("[smoke] ")) {
      const d = JSON.parse(line.slice(8));
      steps[d.step] = d;
    }
  }
};
child.stdout.on("data", take);
child.stderr.on("data", take);
const timer = setTimeout(() => child.kill(), TIMEOUT); // 우리가 띄운 자식만(PID)
const code = await new Promise((r) => child.on("exit", r));
clearTimeout(timer);
rmSync(userData, { recursive: true, force: true });

if (!steps.end) {
  console.log(
    steps.error
      ? `FAIL smoke 중 오류: ${steps.error.message}`
      : `FAIL [smoke] end 줄이 없다(종료 코드 ${code}, ${TIMEOUT / 1000}초 제한)`,
  );
  console.log(lines.slice(-30).join("\n"));
  process.exit(1);
}

const fails = [];
const check = (ok, what, renderer = false) => {
  const label = `${renderer ? "[렌더러] " : ""}${what}`;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) fails.push(label);
};
const near = (a, b) => Math.abs(a - b) <= TOL;
const cx = (r) => r.l + r.w / 2;
const bottomOf = (b) => b.y + b.height;
const nameBottom = (s) => s.name.t + s.name.h;
const face = (s) => ({ x: s.b.x + cx(s.face), y: s.b.y + s.face.t + s.face.h / 2 }); // 화면 좌표
const inside = (b, wa) =>
  b.x >= wa.x &&
  b.y >= wa.y &&
  b.x + b.width <= wa.x + wa.width &&
  b.y + b.height <= wa.y + wa.height;
const f1 = (n) => Math.round(n * 10) / 10;
const isChar = (s) => s.pid !== "hub";

// 1) 접힘: 얼굴·이름표·말풍선이 한 축, 이름표가 창 안
const collapsed = steps.collapsed.wins.filter(isChar);
console.log(`캐릭터 ${collapsed.length}개 · 허브 ${steps.collapsed.wins.length - collapsed.length}개`);
if (!collapsed.length) console.log("검사할 캐릭터 없음 — 캐릭터 단언은 건너뛴다(실패 아님)");
for (const s of collapsed) {
  if (!s.face || !s.name) {
    check(false, `접힘 ${s.pid}: 얼굴·이름표 요소가 없다(화면 코드가 중간 상태?)`);
    continue;
  }
  const xs = [s.face, s.name, s.bubble].filter(Boolean).map(cx);
  check(
    xs.every((x) => near(x, xs[0])),
    `접힘 ${s.pid}: 얼굴·이름표${s.bubble ? "·말풍선" : ""} 가로 중심 같음 (${xs.map(f1).join(", ")})`,
  );
  check(
    nameBottom(s) <= s.ih + TOL,
    `접힘 ${s.pid}: 이름표 아래 끝 ${f1(nameBottom(s))} ≤ 창 높이 ${s.ih}`,
  );
}

// 2) 펼침(바닥 왼쪽): 창 왼쪽·아래 모서리·얼굴 그대로, 캐릭터가 창 아래로 안 밀림
const ex = steps.expand;
if (ex?.skip) console.log(`  skip 펼침: ${ex.skip}`);
else if (ex) {
  const { before: a, after: z } = ex;
  check(z.open, `펼침 ${z.pid}: 말풍선이 펼쳐짐 (창 ${a.b.width}×${a.b.height} → ${z.b.width}×${z.b.height})`);
  check(
    a.b.x === z.b.x && bottomOf(a.b) === bottomOf(z.b),
    `펼침: 창 왼쪽 x ${a.b.x}→${z.b.x} · 아래 모서리 ${bottomOf(a.b)}→${bottomOf(z.b)} 그대로`,
  );
  check(
    near(face(a).x, face(z).x) && near(face(a).y, face(z).y),
    `펼침: 얼굴 중심 (${f1(face(a).x)}, ${f1(face(a).y)}) → (${f1(face(z).x)}, ${f1(face(z).y)}) 그대로`,
  );
  check(nameBottom(z) <= z.ih + TOL, `펼침: 이름표 아래 끝 ${f1(nameBottom(z))} ≤ 창 높이 ${z.ih}`);
}

// 3) 위쪽 끝 펼침(아래 모서리 = 작업 영역 위 + 160): 창은 메인이 막고, 내용물을 창에 맞추는 건 렌더러(roomAbove)
const top = steps.top;
if (top) {
  const z = top.after;
  console.log(`  info 위쪽 끝 펼침: 창 ${z.b.width}×${z.b.height} @ y ${z.b.y}, 말풍선 높이 ${z.bubble ? f1(z.bubble.h) : "-"}, 작업 영역 위 ${z.wa.y}`);
  check(z.open, `위쪽 끝 ${z.pid}: 말풍선이 펼쳐짐`);
  check(nameBottom(z) <= z.ih + TOL, `위쪽 끝 펼침: 이름표 아래 끝 ${f1(nameBottom(z))} ≤ 창 높이 ${z.ih}`, true);
  check(!z.bubble || z.bubble.t >= -TOL, `위쪽 끝 펼침: 말풍선 위 끝 ${z.bubble ? f1(z.bubble.t) : "-"} ≥ 0(창 안)`, true);
}

// 4) 오른쪽 끝에서 창이 넓어져도(쪽지) 캐릭터가 화면 제자리 — 렌더러가 shiftX만큼 캐릭터 열을 옮겨야 한다
const right = steps.right;
if (right) {
  const { before: a, after: z } = right;
  const msg = `오른쪽 끝 ${z.pid}: 창 폭 ${a.b.width}→${z.b.width}, 창 x ${a.b.x}→${z.b.x}`;
  if (!a.face || !z.face) check(false, `${msg}: 얼굴 요소가 없다`);
  else if (z.b.width <= a.b.width) console.log(`  skip ${msg}: 창이 넓어지지 않았다(쪽지 없음)`);
  else
    check(near(face(a).x, face(z).x), `${msg} — 얼굴 화면 x ${f1(face(a).x)} → ${f1(face(z).x)} 그대로`, true);
}

// 5) 숨김 토글: 숨김 → 캐릭터 전부 안 보이고 허브는 보임, 보임 → 전부 보이고 좌표 그대로
const hide = steps.hide;
if (!hide) check(false, "숨김 토글: 허브 창이 없다");
else {
  const where = (s) => `${s.b.x},${bottomOf(s.b)}`;
  const at = Object.fromEntries(hide.before.map((s) => [s.pid, where(s)]));
  const chars = hide.hidden.filter(isChar);
  check(
    chars.every((s) => !s.visible) && hide.hidden.filter((s) => !isChar(s)).every((s) => s.visible),
    `숨김: 캐릭터 ${chars.length}개 전부 isVisible false, 허브 true`,
  );
  check(hide.shown.every((s) => s.visible), `보임: 창 ${hide.shown.length}개 전부 isVisible true`);
  check(
    hide.shown.every((s) => !(s.pid in at) || at[s.pid] === where(s)),
    "보임: 숨기기 전과 좌표(왼쪽 x, 아래 모서리) 같음",
  );
}

// 6) 모든 단계에서 보이는 창은 그 화면의 작업 영역 안
const snaps = Object.values(steps).flatMap((d) =>
  Object.values(d).flatMap((v) => (Array.isArray(v) ? v : v?.b ? [v] : [])),
);
const out = snaps.filter((s) => s.visible && !inside(s.b, s.wa));
check(
  !out.length,
  `창이 작업 영역 안 (측정 ${snaps.length}회${out.length ? `, 벗어남: ${out.map((s) => `${s.pid} ${JSON.stringify(s.b)} ⊄ ${JSON.stringify(s.wa)}`).join(" / ")}` : ""})`,
);

console.log(fails.length ? `\n실패 ${fails.length}개:\n- ${fails.join("\n- ")}` : "\n전부 통과");
process.exit(fails.length ? 1 : 0);
