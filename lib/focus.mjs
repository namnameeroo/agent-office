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
