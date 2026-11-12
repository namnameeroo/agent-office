// npm run smoke: 개발용 Electron을 빈 포트·임시 userData로 미니 모드에 띄워 캐릭터 창 불변식을 단언한다.
// 측정은 desktop/debug.mjs(AGENT_OFFICE_SMOKE=1)의 [smoke] 줄. 사용자가 띄운 앱(4545)·저장된 캐릭터 위치는 건드리지 않는다.
// 종료 코드 0 = 전부 통과(살아 있는 세션이 없으면 캐릭터 단언은 건너뛰고 0), 1 = 실패. [렌더러] 표시는 렌더러가
// pet:fit의 { shiftX, roomAbove }를 써야 통과하는 단언이다. 첫 캐릭터의 응답은 debug.mjs가 긴 마크다운으로 바꿔 넣는다(실데이터와 무관하게 펼침을 잰다).
// 기본 브라우저 열기·클립보드 쓰기는 smoke 앱 안에서 가로채 기록만 한다(사용자 화면·클립보드를 건드리지 않음)
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
  // 펼친 전문의 마크다운: 요소로 그려지고, 응답 글 속 태그·javascript: 링크는 요소가 되지 않는다
  const md = ex.md;
  check(
    !!md && md.strong >= 1 && md.code >= 1 && md.li === 2 && md.pre === 1 && md.h === 1 && md.a === 1 && md.bad === 0,
    `펼침 마크다운: 굵게·코드·목록 2·코드 블록·제목·링크 1, 태그·javascript: 링크는 글자 (${JSON.stringify(md && { ...md, link: undefined })})`,
  );
  check(
    md?.link?.href === "https://example.com/smoke-doc" && md.link.target === "_blank" && /noopener/.test(md.link.rel),
    `펼침 링크: http(s)만 <a target=_blank rel=noopener> (${JSON.stringify(md?.link ?? null)})`,
  );
  check(
    ex.link.opened.includes("https://example.com/smoke-doc") && ex.link.stillOpen,
    `링크 클릭: 메인이 기본 브라우저로 넘김(openExternal ${JSON.stringify(ex.link.opened)}), 말풍선은 펼친 채 ${ex.link.stillOpen}`,
  );
  check(
    !!ex.copy.menu?.includes("응답 복사") && ex.copy.same,
    `우클릭 "응답 복사": 메뉴 [${ex.copy.menu?.join(", ")}] · 클립보드 = 전문 ${ex.copy.same}`,
  );
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
  const { before: a, after: z, drag } = right;
  const waRight = a.wa.x + a.wa.width;
  check(
    a.anchor.x === waRight - 128 && a.anchor.x - a.b.x === 0,
    `오른쪽 끝 접힘: 앵커 x ${a.anchor.x} = 작업 영역 오른쪽 ${waRight} - 128, shiftX(앵커 - 창 x) ${a.anchor.x - a.b.x} = 0`,
  );
  const msg = `오른쪽 끝 ${z.pid}: 창 폭 ${a.b.width}→${z.b.width}, 창 x ${a.b.x}→${z.b.x}`;
  if (!a.face || !z.face) check(false, `${msg}: 얼굴 요소가 없다`);
  else if (z.b.width <= a.b.width) console.log(`  skip ${msg}: 창이 넓어지지 않았다(쪽지 없음)`);
  else {
    check(near(face(a).x, face(z).x), `${msg} — 얼굴 화면 x ${f1(face(a).x)} → ${f1(face(z).x)} 그대로`, true);
    check(
      !!z.name && z.name.l + z.name.w <= z.iw + TOL && (!z.bubble || z.bubble.l + z.bubble.w <= z.iw + TOL),
      `오른쪽 끝 쪽지: 옮긴 이름표·말풍선 오른쪽 끝 ${f1(z.name.l + z.name.w)}·${z.bubble ? f1(z.bubble.l + z.bubble.w) : "-"} ≤ 창 폭 ${z.iw}`,
      true,
    );
  }
  // 밀린 상태(쪽지)에서 얼굴을 잡고 끌기 시작: 얼굴이 마우스만큼만 움직인다(잡은 점을 앵커 기준으로 안 바꾸면 shiftX만큼 튄다)
  if (drag?.during?.face) {
    const d = drag.during;
    check(
      near(face(d).x, face(z).x + drag.dx) && near(face(d).y, face(z).y),
      `오른쪽 끝 끌기 시작(shiftX ${z.anchor.x - z.b.x}): 얼굴 화면 x ${f1(face(z).x)} → ${f1(face(d).x)} (마우스 ${drag.dx}), y ${f1(face(z).y)} → ${f1(face(d).y)}`,
      true,
    );
  } else if (z.face) check(false, "오른쪽 끝 끌기: 측정이 없다");
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
  // 숨긴 동안 캐릭터 창은 상태를 묻지 않고(document.hidden), 다시 보이면 곧바로 묻는다. 요청은 자기 pid만
  const by = (list) => Object.fromEntries(list.map((x) => [x.pid, x]));
  const [a1, b1] = [by(hide.polls.h1), by(hide.polls.s1)];
  const h0 = hide.polls.h0.filter((x) => a1[x.pid] && b1[x.pid]); // 측정 중 닫힌 창은 뺀다
  const s1 = h0.map((x) => b1[x.pid]);
  if (h0.length) {
    check(
      h0.every((x) => x.hidden && a1[x.pid].hidden),
      `숨김: 캐릭터 창 document.hidden ${h0.map((x) => `${x.pid}:${x.vis}`).join(" ")}`,
    );
    check(
      h0.every((x) => a1[x.pid].n === x.n),
      `숨김 3초 동안 상태 요청 0 (${h0.map((x) => `${x.pid}:${x.n}→${a1[x.pid].n}`).join(" ")})`,
    );
    check(
      h0.every((x) => b1[x.pid].n > a1[x.pid].n && !b1[x.pid].hidden),
      `보임 0.9초 안에 상태 요청 재개 (${h0.map((x) => `${x.pid}:${a1[x.pid].n}→${b1[x.pid].n}`).join(" ")})`,
    );
    check(
      s1.every((x) => x.last === `/api/state?pid=${x.pid}`),
      `캐릭터 창은 자기 세션만 받는다 (${[...new Set(s1.map((x) => x.last.replace(/\d+$/, "N")))].join(", ")})`,
    );
  }
}

// 6) 허브 끌기(공용 drag.mjs): 마우스만큼 움직이고, 끈 뒤의 click이 큰 사무실을 열지 않는다
const hd = steps.hubdrag;
if (hd)
  check(
    hd.after.x === hd.before.x + hd.dx && hd.after.y === hd.before.y && !hd.office,
    `허브 끌기: 창 x ${hd.before.x} → ${hd.after.x} (마우스 ${hd.dx}), 큰 사무실 열림 ${hd.office}`,
  );

// 7) 모든 단계에서 보이는 창은 그 화면의 작업 영역 안
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
