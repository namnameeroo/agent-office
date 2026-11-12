// 칠판을 누르면 그 세션이 도는 터미널을 앞으로 가져온다(ADR 0003). 포커스만 옮기고 입력은 보내지 않는다.
// 명령은 execFile(셸 없음)에 고정 인자로만 넘기고, 세션에서 읽은 값은 모양을 검사한 뒤 쓴다.
import { execFile } from "node:child_process";

const run = (cmd, args) =>
  new Promise((done) =>
    execFile(cmd, args, { timeout: 5000 }, (err, stdout) =>
      done({ err, out: String(stdout ?? "") }),
    ),
  );

// `ps eww` 한 줄(명령줄 뒤에 환경 변수)에서 고른 키만 꺼낸다. 뒤에 나온 값(환경 변수)이 이긴다.
// 공백이 없는 값만 쓴다. 나머지 환경 변수(토큰 등)는 읽고 버린다
export function envOf(line, keys) {
  const out = {};
  for (const tok of line.split(/\s+/)) {
    const i = tok.indexOf("=");
    if (i > 0 && keys.includes(tok.slice(0, i)))
      out[tok.slice(0, i)] = tok.slice(i + 1);
  }
  return out;
}

// 터미널 종류: Orca = 터미널 식별자로 그 탭까지, Ghostty = 폴더·제목으로 창을 골라서, 그 밖 = 앱만 앞으로
export function targetOf(env) {
  const h = env.ORCA_TERMINAL_HANDLE;
  if (h && /^term_[0-9a-f-]{36}$/.test(h)) return { app: "Orca", handle: h };
  if (env.TERM_PROGRAM === "ghostty") return { app: "Ghostty" };
  const b = env.__CFBundleIdentifier;
  if (b && /^[A-Za-z0-9.-]+$/.test(b))
    return { app: env.TERM_PROGRAM || b, bundle: b };
  return null;
}

export const parseGhosttyList = (out) =>
  out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, dir, ...name] = line.split("\t");
      return { id, dir, name: name.join("\t") };
    });

// Ghostty 창 제목 = Claude Code가 붙인 세션 제목 앞에 상태 기호(✳ ◑ 등)와 공백
const bare = (name) => name.replace(/^[^\p{L}\p{N}]+\s+/u, "");
// 같은 폴더에서 제목이 같은 창 하나. 제목이 안 맞으면 그 폴더 창이 하나일 때만(엉뚱한 창으로 가지 않게)
export function pickGhostty(terms, { cwd, title }) {
  const here = terms.filter((t) => t.dir === cwd);
  const same = here.filter((t) => title && bare(t.name) === title);
  if (same.length === 1) return same[0].id;
  return here.length === 1 ? here[0].id : null;
}

// 구분자는 tell 밖에서 만든다. Ghostty 사전에 tab(탭 객체)이 있어 tell 안의 tab은 글자 "tab"이 된다
const GHOSTTY_LIST = `set sep to character id 9
tell application "Ghostty"
set out to ""
repeat with t in every terminal
set out to out & (id of t) & sep & (working directory of t) & sep & (name of t) & linefeed
end repeat
return out
end tell`;
const GHOSTTY_FOCUS = `on run argv
tell application "Ghostty"
repeat with t in every terminal
if (id of t) is (item 1 of argv) then
focus t
activate
return "ok"
end if
end repeat
end tell
return "missing"
end run`;

// 결과: { ok, app, partial? }(partial = 창까지는 못 고르고 앱만 앞으로) 또는 { ok: false, app?, reason }
export async function focusTerminal(desk) {
  const ps = await run("ps", ["eww", "-o", "command=", "-p", String(desk.pid)]);
  if (ps.err) return { ok: false, reason: "세션 프로세스를 찾지 못했다" };
  const t = targetOf(
    envOf(ps.out, [
      "ORCA_TERMINAL_HANDLE",
      "TERM_PROGRAM",
      "__CFBundleIdentifier",
    ]),
  );
  if (!t) return { ok: false, reason: "어느 터미널 앱인지 알 수 없다" };
  if (t.handle) {
    const r = await run("orca", [
      "terminal",
      "switch",
      "--terminal",
      t.handle,
      "--json",
    ]);
    let res = null;
    try {
      res = JSON.parse(r.out);
    } catch {}
    if (r.err || res?.ok === false || res?.error)
      return {
        ok: false,
        app: t.app,
        reason: "Orca에서 그 터미널로 전환하지 못했다",
      };
    await run("open", ["-b", "com.stablyai.orca"]);
    return { ok: true, app: t.app };
  }
  if (t.app === "Ghostty") {
    const l = await run("osascript", ["-e", GHOSTTY_LIST]);
    if (l.err)
      return {
        ok: false,
        app: t.app,
        reason: "Ghostty 창 목록을 읽지 못했다(자동화 권한 확인)",
      };
    const id = pickGhostty(parseGhosttyList(l.out), desk);
    if (id && /^[0-9A-Fa-f-]{36}$/.test(id)) {
      const f = await run("osascript", ["-e", GHOSTTY_FOCUS, id]);
      if (!f.err && f.out.trim() === "ok") return { ok: true, app: t.app };
    }
    await run("open", ["-b", "com.mitchellh.ghostty"]);
    return {
      ok: true,
      app: t.app,
      partial: "같은 폴더 창이 여러 개라 Ghostty만 앞으로 가져왔다",
    };
  }
  const o = await run("open", ["-b", t.bundle]);
  if (o.err) return { ok: false, app: t.app, reason: `${t.app}을 열지 못했다` };
  return {
    ok: true,
    app: t.app,
    partial: `${t.app} 앱만 앞으로 가져왔다(창은 고르지 못함)`,
  };
}

// 백그라운드 세션(ADR 0007): 붙은 터미널이 없고 env는 supervisor를 띄운 터미널 것이라 탭은 고르지 않는다(엉뚱한 탭).
// 다시 붙는 명령을 클립보드에 넣고(pbcopy, 고정 인자 + stdin) 그 터미널 앱만 앞으로 가져온다. 입력은 보내지 않는다.
// exec(cmd, args, input?)는 테스트에서 가짜로 바꾼다. 위 focusTerminal(대화형)은 이 함수를 쓰지 않는다
const execIn = (cmd, args, input) =>
  new Promise((done) => {
    const c = execFile(cmd, args, { timeout: 5000 }, (err, stdout) =>
      done({ err, out: String(stdout ?? "") }),
    );
    if (input !== undefined) c.stdin.end(input);
  });
const APP_BUNDLE = { Orca: "com.stablyai.orca", Ghostty: "com.mitchellh.ghostty" };

// 그 세션을 보여 주는 클라이언트 프로세스: 실행 파일이 claude이고 첫 인자가 agents·attach인 줄만(다른 명령줄에 섞인 글자는 무시)
const CLIENT_RE = /^(?:\S*\/)?claude (agents|attach)(?: (\S+))?(?:\s|$)/;
const CLIENT_PGREP = "^([^ ]*/)?claude (agents|attach)( |$)";
// pgrep -lf 출력("pid 명령줄") → [{ pid, kind, id }]
export function parseClients(out) {
  return out.split("\n").flatMap((line) => {
    const m = line.match(/^(\d+) (.*)$/);
    const c = m && m[2].match(CLIENT_RE);
    return c ? [{ pid: Number(m[1]), kind: c[1], id: c[2] ?? null }] : [];
  });
}
// ps etime([[dd-]hh:]mm:ss) → 초
export function etimeSec(s) {
  const [d, hms] = s.includes("-") ? s.split("-") : ["0", s];
  return Number(d) * 86400 + hms.split(":").reduce((a, n) => a * 60 + Number(n), 0);
}

// 터미널 고르기 순서(클릭할 때만 돈다, 약 0.1초): ① 이 잡에 붙은 `claude attach <jobId>`의 터미널(복사 없음)
// ② 가장 최근에 띄운 `claude agents`(agent view)의 터미널 + 명령 복사 ③ supervisor를 띄운 터미널 앱 + 명령 복사.
// ①②는 그 클라이언트 프로세스를 대화형과 같은 focusTerminal로 옮긴다(그 프로세스 env가 실제 터미널 것이라 Orca면 탭까지)
export async function attachHelp(desk, exec = execIn, focus = focusTerminal) {
  if (!desk.jobId) return { ok: false, reason: "백그라운드 세션이라 붙은 터미널이 없다" };
  const cmd = `claude attach ${desk.jobId}`;
  const found = parseClients(
    (await exec("pgrep", ["-U", String(process.getuid()), "-lf", CLIENT_PGREP])).out,
  );
  let copied = null;
  const copy = async () => (copied ??= !(await exec("pbcopy", [], cmd)).err);
  if (found.length) {
    const age = new Map(
      (await exec("ps", ["-o", "pid=,etime=", "-p", found.map((c) => c.pid).join(",")])).out
        .trim()
        .split("\n")
        .map((l) => l.trim().split(/\s+/))
        .filter(([p, e]) => p && e)
        .map(([p, e]) => [Number(p), etimeSec(e)]),
    );
    const newest = (cs) => cs.sort((a, b) => (age.get(a.pid) ?? 1e9) - (age.get(b.pid) ?? 1e9))[0];
    const cwdOf = async (pid) =>
      (await exec("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"])).out.match(/^n(.+)$/m)?.[1] ?? null;
    const tryClient = async (c) =>
      c && focus({ pid: c.pid, cwd: await cwdOf(c.pid), title: desk.title });
    const attached = await tryClient(
      newest(found.filter((c) => c.kind === "attach" && c.id === desk.jobId)),
    );
    if (attached?.ok)
      return { ok: true, app: attached.app, partial: `이미 붙어 있는 ${attached.app} 터미널로 옮겼다` };
    await copy();
    const view = await tryClient(newest(found.filter((c) => c.kind === "agents")));
    if (view?.ok)
      return {
        ok: true,
        app: view.app,
        partial: copied
          ? `복사함: ${cmd} · ${view.app}의 agent view로 옮겼다(목록에서 고르거나 새 탭에서 ⌘V)`
          : `복사하지 못했다: ${cmd} · ${view.app}의 agent view로 옮겼다(목록에서 고르거나 직접 입력)`,
      };
  }
  await copy();
  const ps = await exec("ps", ["eww", "-o", "command=", "-p", String(desk.pid)]);
  const t = ps.err
    ? null
    : targetOf(envOf(ps.out, ["ORCA_TERMINAL_HANDLE", "TERM_PROGRAM", "__CFBundleIdentifier"]));
  const bundle = t && (APP_BUNDLE[t.app] ?? t.bundle);
  const opened = bundle && !(await exec("open", ["-b", bundle])).err;
  const where = opened ? `${t.app}에서 새 탭을 열고` : "터미널을 열고";
  return {
    ok: true,
    ...(opened && { app: t.app }),
    partial: copied
      ? `복사함: ${cmd} · ${where} 붙여넣기(⌘V)`
      : `복사하지 못했다: ${cmd} · ${where} 직접 입력`,
  };
}
