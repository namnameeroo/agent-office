// 파일·프로세스·git 읽기. ~/.claude 아래는 읽기만 하고, *.key 파일과 메시징 소켓은 열지 않는다.
import {
  readdirSync,
  readFileSync,
  existsSync,
  statSync,
  openSync,
  fstatSync,
  readSync,
  closeSync,
} from "node:fs";
import { join, basename, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { summarizeTranscript, buildOffice } from "./office.mjs";
import { extractLinks, mergeLinks } from "./links.mjs";

// ponytail: pid 재사용은 procStart 비교로 막을 수 있지만 v1은 생존만 본다
export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false; // 0·음수는 프로세스 그룹을 가리킨다
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

// 읽는 세션 종류. bg = `claude agents`·`claude --bg`·`/bg`로 띄운 백그라운드 세션(내부 형식, 2.1.322 실측).
// 허용 목록이라 daemon·모르는 kind는 계속 빠진다. 형식이 바뀌면 bg가 예전처럼 빠지기만 한다
const KINDS = new Set(["interactive", "bg"]);

export function listTerminals(claudeDir) {
  const dir = join(claudeDir, "sessions");
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files.flatMap((f) => {
    try {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
      if (
        !KINDS.has(d.kind) ||
        typeof d.cwd !== "string" ||
        typeof d.sessionId !== "string"
      )
        return [];
      if (!isAlive(d.pid)) return [];
      const { pid, sessionId, cwd, name, status, statusUpdatedAt } = d;
      return [
        {
          pid,
          sessionId,
          cwd,
          name,
          status,
          waitingFor: d.waitingFor ?? null,
          statusUpdatedAt,
          // bg에만 붙인다: 대화형 객체는 이전과 한 글자도 같게(칠판 클릭 경로 보장, ADR 0007)
          ...(d.kind === "bg" && {
            kind: "bg",
            jobId: typeof d.jobId === "string" && /^[\w-]{1,64}$/.test(d.jobId) ? d.jobId : null,
          }),
        },
      ];
    } catch {
      return []; // 쓰는 중이거나 깨진 파일은 이번 회차만 건너뛴다
    }
  });
}

const transcriptCache = new Map();
export function findTranscript(claudeDir, sessionId) {
  if (!/^[\w-]+$/.test(sessionId)) return null;
  const key = `${claudeDir}\0${sessionId}`;
  const hit = transcriptCache.get(key);
  if (hit && existsSync(hit)) return hit;
  let dirs;
  try {
    dirs = readdirSync(join(claudeDir, "projects"));
  } catch {
    return null;
  }
  for (const d of dirs) {
    const p = join(claudeDir, "projects", d, `${sessionId}.jsonl`);
    if (existsSync(p)) {
      transcriptCache.set(key, p);
      return p;
    }
  }
  return null;
}

// ponytail: 오래 안 쓴 항목부터 지우는 200개 상한. 팀장·팀원이 그보다 많으면 상한을 올린다
const tailCache = new Map();
const TAIL_CACHE_MAX = 200;

// ponytail: 끝 1MB만 본다. 제목이 그보다 앞에만 있으면 터미널 이름으로 대체된다. 필요하면 증분 tail로 올린다
export function readTail(path, maxBytes = 1_048_576) {
  const fd = openSync(path, "r");
  try {
    const { size, mtimeMs } = fstatSync(fd);
    const key = `${maxBytes}:${size}:${mtimeMs}`;
    const hit = tailCache.get(path);
    tailCache.delete(path);
    if (hit?.key === key) {
      tailCache.set(path, hit);
      return hit.records;
    }
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    const n = readSync(fd, buf, 0, buf.length, start);
    let text = buf.subarray(0, n).toString("utf8");
    if (start > 0) text = text.slice(text.indexOf("\n") + 1); // 잘린 첫 줄은 버린다
    const records = [];
    for (const l of text.split("\n")) {
      try {
        const o = JSON.parse(l);
        if (o && typeof o === "object") records.push(o);
      } catch {
        // 빈 줄, 쓰는 중인 마지막 줄
      }
    }
    tailCache.set(path, { key, records });
    if (tailCache.size > TAIL_CACHE_MAX)
      tailCache.delete(tailCache.keys().next().value);
    return records;
  } finally {
    closeSync(fd);
  }
}

const startCache = new Map();
export function readSessionStart(path) {
  if (startCache.has(path)) return startCache.get(path);
  let fd;
  try {
    fd = openSync(path, "r");
  } catch {
    return null;
  }
  try {
    const buf = Buffer.alloc(65_536);
    const n = readSync(fd, buf, 0, buf.length, 0);
    for (const l of buf.subarray(0, n).toString("utf8").split("\n")) {
      try {
        const t = Date.parse(JSON.parse(l).timestamp);
        if (!Number.isNaN(t)) {
          startCache.set(path, t);
          return t;
        }
      } catch {
        // 타임스탬프 없는 줄, 잘린 줄
      }
    }
    return null;
  } finally {
    closeSync(fd);
  }
}

export function readTeam(transcriptPath) {
  const dir = join(transcriptPath.replace(/\.jsonl$/, ""), "subagents");
  let files;
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  return files.flatMap((f) => {
    const m = /^agent-(.+)\.meta\.json$/.exec(f);
    if (!m) return [];
    try {
      const meta = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const finished = meta.finished === true;
      const log = join(dir, `agent-${m[1]}.jsonl`);
      let mtimeMs = statSync(join(dir, f)).mtimeMs;
      let records = [];
      if (existsSync(log)) {
        mtimeMs = statSync(log).mtimeMs;
        // 퇴근한 팀원은 말풍선이 없으니 기록을 읽지 않는다
        if (!finished) records = readTail(log, 262_144);
      }
      return [
        {
          agentId: m[1],
          agentType: meta.agentType,
          description: meta.description,
          finished,
          mtimeMs,
          records,
        },
      ];
    } catch {
      return [];
    }
  });
}

const zoneCache = new Map();
export function zoneOf(cwd) {
  if (zoneCache.has(cwd)) return zoneCache.get(cwd);
  let z;
  try {
    const common = execFileSync(
      "git",
      ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        stdio: "pipe",
        timeout: 2000,
        encoding: "utf8",
      },
    ).trim();
    const zone = basename(dirname(common));
    z = { zone, worktree: basename(cwd) === zone ? null : basename(cwd) };
  } catch {
    z = { zone: basename(cwd), worktree: null }; // git 없음, 레포 아님, 삭제된 cwd
  }
  zoneCache.set(cwd, z);
  return z;
}

// sessionId → 그 세션에서 한 번이라도 본 링크. 기록 끝 1MB 밖으로 밀려나도 칩이 남는다
const linkCache = new Map();

export function collectOffice(claudeDir, now, opts = {}) {
  const terminals = listTerminals(claudeDir);
  const live = new Set(terminals.map((t) => t.sessionId));
  for (const sid of linkCache.keys()) if (!live.has(sid)) linkCache.delete(sid);
  const inputs = terminals.map((terminal) => {
    const zone = zoneOf(terminal.cwd);
    const sid = terminal.sessionId;
    const empty = {
      terminal,
      zone,
      summary: summarizeTranscript([], terminal.cwd),
      team: [],
      sessionStart: null,
      links: linkCache.get(sid) ?? [],
    };
    try {
      const path = findTranscript(claudeDir, sid);
      if (!path) return empty;
      const records = readTail(path);
      const summary = summarizeTranscript(records, terminal.cwd);
      const links = mergeLinks(
        linkCache.get(sid),
        extractLinks(records, summary.branch, opts),
      );
      linkCache.set(sid, links);
      return {
        terminal,
        zone,
        summary,
        team: readTeam(path),
        sessionStart: readSessionStart(path),
        links,
      };
    } catch {
      return empty; // 기록을 못 읽어도 팀장은 이름과 상태로 남는다
    }
  });
  return buildOffice(inputs, now);
}
