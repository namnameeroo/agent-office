// 세션 기록에서 링크 칩(PR·Jira·artifact)을 찾는다(스펙 §4). 순수 함수만 둔다. IO 없음.
import { basename, extname } from "node:path";

export const LINKS_PER_KIND = 5;

const JIRA_KEY = /[A-Z][A-Z0-9]+-\d+/;
const CREATED_KEY = /"key"\s*:\s*"([A-Z][A-Z0-9]+-\d+)"/;
const PR_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)/;
const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/([\w-]+)/;

// tool_result.content는 문자열이거나 [{ type: "text", text }]다
const textOf = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .map((c) => (c?.type === "text" ? (c.text ?? "") : ""))
          .join("\n")
      : "";

// 같은 kind+label은 하나로, 가장 늦은 at을 남기고 최신순
function dedupe(links) {
  const m = new Map();
  for (const l of links) {
    const k = `${l.kind}\0${l.label}`;
    if (!m.has(k) || m.get(k).at < l.at) m.set(k, l);
  }
  return [...m.values()].sort((a, b) => b.at - a.at);
}

export function extractLinks(records, branch, { jiraBase } = {}) {
  const base = jiraBase?.replace(/\/+$/, "");
  const jira = (key, at) => ({
    kind: "Jira",
    label: key,
    url: base ? `${base}/browse/${key}` : null,
    at,
  });
  const found = [];
  const branchKey = branch?.match(JIRA_KEY)?.[0];
  if (branchKey) found.push(jira(branchKey, 0)); // 브랜치 키는 가장 오래된 것으로 친다
  const uses = new Map(); // tool_use id → tool_use
  for (const r of records) {
    // 형식이 이상한 레코드 하나 때문에 수집 전체가 무너지지 않게 그 레코드만 건너뛴다
    try {
      const content = r.message?.content;
      if (!Array.isArray(content)) continue;
      const at = Date.parse(r.timestamp) || 0;
      for (const b of content) {
        if (b?.type === "tool_use") {
          uses.set(b.id, b);
          continue;
        }
        if (b?.type !== "tool_result" || b.is_error === true) continue;
        const u = uses.get(b.tool_use_id);
        if (!u) continue;
        const name = u.name ?? "";
        const input = u.input ?? {};
        const text = textOf(b.content);
        // 주소만 언급한 기록은 빼고, 이 세션이 gh pr create로 만든 PR만
        if (
          name === "Bash" &&
          String(input.command ?? "").includes("gh pr create")
        ) {
          const m = text.match(PR_URL);
          if (m)
            found.push({ kind: "PR", label: `PR #${m[1]}`, url: m[0], at });
        }
        if (name === "Artifact") {
          const m = text.match(ARTIFACT_URL);
          const file = basename(String(input.file_path ?? ""));
          const label =
            input.title ||
            file.slice(0, file.length - extname(file).length) ||
            m?.[1];
          if (m)
            found.push({
              kind: "artifact",
              label: `artifact: ${label}`,
              url: m[0],
              at,
            });
        }
        // 검색 결과와 상위 에픽(parent)은 언급일 뿐이라 뺀다
        if (
          name.startsWith("mcp__") &&
          name.includes("Jira") &&
          !/search/i.test(name)
        ) {
          if (typeof input.issueIdOrKey === "string" && input.issueIdOrKey)
            found.push(jira(input.issueIdOrKey, at));
        }
        if (name.endsWith("createJiraIssue")) {
          const m = text.match(CREATED_KEY);
          if (m) found.push(jira(m[1], at));
        }
      }
    } catch {
      // 건너뜀
    }
  }
  return dedupe(found);
}

// 서버가 한 번 본 링크는 그 세션 동안 남긴다. 종류마다 최신 LINKS_PER_KIND개
export function mergeLinks(prev = [], next) {
  const n = {};
  return dedupe([...prev, ...next]).filter(
    (l) => (n[l.kind] = (n[l.kind] ?? 0) + 1) <= LINKS_PER_KIND,
  );
}
