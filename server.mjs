// 로컬 HTTP 서버: 1초마다 스스로 사무실을 수집하고, GET /api/state는 마지막 결과를 준다. 화면은 public/. 127.0.0.1에만 바인딩한다.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { collectOffice } from "./lib/sources.mjs";
import { createHistory } from "./lib/history.mjs";
import { resolveStatic } from "./lib/static.mjs";
import { focusTerminal, attachHelp } from "./lib/focus.mjs";

// 플러그인 스킬이 옛 서버를 알아보는 기준. 단일 출처는 package.json
const VERSION = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version;
const PORT = Number(process.env.PORT) || 4545;
const HOST = "127.0.0.1";
const CLAUDE_DIR =
  process.env.AGENT_OFFICE_CLAUDE_DIR || join(homedir(), ".claude");
// Jira 칩 주소(<base>/browse/<키>). 환경 변수 → 설정 파일의 jiraBase → 빈 값(글자 칩만) 순서.
// Dock에서 띄운 앱은 셸 환경 변수를 못 받으므로 설정 파일(플러그인 setup이 쓰는 그 파일)을 읽는다
const JIRA_BASE = process.env.AGENT_OFFICE_JIRA_BASE ?? configJiraBase();
function configJiraBase() {
  const dir =
    process.env.AGENT_OFFICE_HOME || join(homedir(), ".config", "agent-office");
  try {
    const base = JSON.parse(readFileSync(join(dir, "config.json"), "utf8")).jiraBase;
    return typeof base === "string" ? base : ""; // 숫자 등이 들어오면 링크 추출이 세션 요약째 실패한다
  } catch {
    return ""; // 파일 없음·깨짐 = 설정 안 함
  }
}
// DNS 리바인딩 차단: 다른 도메인 이름으로 들어온 요청에는 세션 기록을 주지 않는다
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

// 탭이 닫혀 있어도 상태 변화가 로그에 남도록 수집 주기는 서버가 정한다(ADR 0002 #5)
const history = createHistory();
let latest = null;
function tick() {
  try {
    const now = Date.now();
    const office = collectOffice(CLAUDE_DIR, now, { jiraBase: JIRA_BASE });
    latest = {
      version: VERSION,
      ...office,
      ...history.update(office.desks, now),
    };
  } catch (e) {
    console.error("수집 실패:", e); // 마지막 결과를 유지한다
  }
}
tick();
setInterval(tick, 1000);

const server = createServer((req, res) => {
  const send = (code, type, body, headers = {}) => {
    res.writeHead(code, {
      "Content-Type": type,
      "Cache-Control": "no-store",
      ...headers,
    });
    res.end(body);
  };
  if (!ALLOWED_HOSTS.has(req.headers.host))
    return send(403, "text/plain; charset=utf-8", "forbidden");
  // "//"처럼 호스트가 빈 주소는 URL이 던진다. 잡지 않으면 서버 프로세스가 죽는다
  let url, path;
  try {
    url = new URL(req.url, "http://localhost");
    path = url.pathname;
  } catch {
    return send(400, "text/plain; charset=utf-8", "bad request");
  }
  const json = (code, obj) =>
    send(code, "application/json; charset=utf-8", JSON.stringify(obj));
  // 칠판 → 그 세션의 터미널을 앞으로(ADR 0003). 화면 밖을 움직이는 유일한 API라 같은 화면에서 보낸 POST만 받는다:
  // 다른 사이트의 폼·fetch는 Origin이 달라 막히고, pid는 지금 수집한 세션 것만 쓴다
  if (path === "/api/focus") {
    if (
      req.method !== "POST" ||
      req.headers.origin !== `http://${req.headers.host}`
    )
      return json(403, { ok: false, reason: "forbidden" });
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 256) req.destroy();
    });
    req.on("end", async () => {
      let pid = null;
      try {
        pid = JSON.parse(body).pid;
      } catch {}
      const desk = latest?.desks.find((d) => d.pid === pid);
      if (!desk)
        return json(404, { ok: false, reason: "그 팀장을 찾지 못했다" });
      // 백그라운드 세션은 붙은 터미널이 없고 env는 supervisor를 띄운 터미널 것이라 포커스하면 엉뚱한 탭으로 간다.
      // focusTerminal을 타지 않고 다시 붙는 명령을 복사한 뒤 그 터미널 앱만 앞으로(attachHelp). 대화형은 아래 줄 그대로(ADR 0007)
      if (desk.kind === "bg") return json(200, await attachHelp(desk));
      json(200, await focusTerminal(desk));
    });
    return;
  }
  if (path === "/api/state") {
    // ?pid=N: 캐릭터 창은 자기 세션 하나만 쓴다. desks만 그 pid로 거르고 counts 등 나머지는 전체 기준 그대로
    const pid = url.searchParams.get("pid");
    if (pid !== null && !/^\d+$/.test(pid))
      return json(400, { error: "pid는 숫자여야 한다" });
    if (!latest)
      return send(503, "application/json; charset=utf-8", '{"error":"수집 전"}');
    if (pid === null)
      return send(200, "application/json; charset=utf-8", JSON.stringify(latest));
    return json(200, {
      ...latest,
      desks: latest.desks.filter((d) => d.pid === Number(pid)),
    });
  }
  // 아이콘은 없다. 브라우저가 자동으로 묻는 요청을 404 오류로 남기지 않는다
  if (path === "/favicon.ico") return send(204, "image/x-icon", "");
  const file = resolveStatic(path);
  if (file) {
    let body;
    try {
      body = readFileSync(file.file); // 요청마다 읽어 수정 즉시 반영
    } catch {
      return send(404, "text/plain; charset=utf-8", "not found");
    }
    // 외부 요청 금지를 브라우저가 강제한다. 그래서 인라인 <script>·<style>을 쓰지 않는다.
    // frame-ancestors: 다른 페이지가 이 화면을 iframe에 투명하게 깔아 클릭을 유도하지 못하게(default-src가 대신하지 않는다)
    const csp = file.type.startsWith("text/html")
      ? { "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'" }
      : {};
    return send(200, file.type, body, csp);
  }
  send(404, "text/plain; charset=utf-8", "not found");
});

// 데스크탑 앱(desktop/main.mjs)이 창을 열기 전에 기다리는 신호. node server.mjs로 띄우면 아무도 안 기다려도 된다
export const address = `http://${HOST}:${PORT}`;
export const ready = new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(PORT, HOST, () => {
    console.log(`Agent Office: ${address}`);
    resolve(address);
  });
});
