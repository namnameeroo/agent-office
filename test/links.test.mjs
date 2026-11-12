import { test } from "node:test";
import assert from "node:assert/strict";
import { extractLinks, mergeLinks } from "../lib/links.mjs";

const NOW = Date.parse("2026-10-27T05:00:00Z");
const t = (s) => new Date(NOW + s * 1000).toISOString();
const use = (s, id, name, input) => ({
  type: "assistant",
  timestamp: t(s),
  message: { content: [{ type: "tool_use", id, name, input }] },
});
const res = (s, id, content, is_error = false) => ({
  type: "user",
  timestamp: t(s),
  message: {
    content: [{ type: "tool_result", tool_use_id: id, content, is_error }],
  },
});
const PR = "https://github.com/acme/petshop-client/pull/412";

test("extractLinks: gh pr create 결과의 PR만", () => {
  assert.deepEqual(
    extractLinks(
      [
        use(0, "a", "Bash", { command: "gh pr create --title x" }),
        res(1, "a", `${PR}\n`),
        use(2, "b", "Bash", { command: "gh pr view 409" }),
        res(3, "b", "…/pull/409"),
        use(4, "c", "Bash", { command: "gh pr create" }),
        res(5, "c", [{ type: "text", text: "https://github.com/o/r/pull/7" }]), // 배열 형식
        use(6, "d", "Bash", { command: "gh pr create" }),
        res(7, "d", "https://github.com/o/r/pull/8", true),
      ],
      null,
    ),
    [
      {
        kind: "PR",
        label: "PR #7",
        url: "https://github.com/o/r/pull/7",
        at: NOW + 5e3,
      },
      { kind: "PR", label: "PR #412", url: PR, at: NOW + 1e3 },
    ],
  );
});

test("extractLinks: Jira = 브랜치 키 + Jira 도구 입력 + 생성 결과, 검색·parent 제외", () => {
  const ls = extractLinks(
    [
      use(0, "g", "mcp__atlassian__getJiraIssue", {
        issueIdOrKey: "PROJ-1234",
      }),
      res(1, "g", "{}"),
      use(2, "s", "mcp__atlassian__searchJiraIssuesUsingJql", {
        jql: "key = PROJ-9",
        issueIdOrKey: "PROJ-9",
      }),
      res(3, "s", "{}"),
      use(4, "c", "mcp__atlassian__createJiraIssue", { parent: "PROJ-1" }),
      res(5, "c", '{"id":"1","key":"PROJ-1300"}'),
    ],
    "feat/PROJ-1251-health-retry",
    { jiraBase: "https://x.atlassian.net/" },
  );
  assert.deepEqual(
    ls.map((l) => [l.label, l.url, l.at]),
    [
      ["PROJ-1300", "https://x.atlassian.net/browse/PROJ-1300", NOW + 5e3],
      ["PROJ-1234", "https://x.atlassian.net/browse/PROJ-1234", NOW + 1e3],
      ["PROJ-1251", "https://x.atlassian.net/browse/PROJ-1251", 0],
    ],
  );
  assert.equal(extractLinks([], "feat/PROJ-1251")[0].url, null); // jiraBase 없으면 주소 없음
});

test("extractLinks: artifact, 중복은 하나(늦은 at)", () => {
  const A = "https://claude.ai/code/artifact/ab-12";
  assert.deepEqual(
    extractLinks(
      [
        use(0, "a", "Artifact", { file_path: "/tmp/x/release-notes.html" }),
        res(1, "a", `published ${A}`),
        use(2, "b", "Artifact", { file_path: "/tmp/x/release-notes.html" }),
        res(3, "b", `updated ${A}`),
      ],
      null,
    ),
    [
      {
        kind: "artifact",
        label: "artifact: release-notes",
        url: A,
        at: NOW + 3e3,
      },
    ],
  );
});

test("extractLinks: 이상한 기록에도 죽지 않는다", () => {
  assert.deepEqual(
    extractLinks(
      [
        { type: "assistant", message: { content: "text" } },
        use(0, "a", "Bash", undefined),
        res(1, "a", null),
        { type: "user", message: { content: [{ type: "tool_result" }] } },
        null,
      ],
      null,
    ),
    [],
  );
});

test("mergeLinks: 한 번 본 링크는 남고, 종류마다 최신 5개", () => {
  const pr = (n, at) => ({ kind: "PR", label: `PR #${n}`, url: `u${n}`, at });
  const old = [pr(1, 10)];
  assert.deepEqual(mergeLinks(old, []), old); // 기록 끝 밖으로 밀려나도 유지
  const many = mergeLinks(
    old,
    [2, 3, 4, 5, 6, 7].map((n) => pr(n, n * 10)),
  );
  assert.deepEqual(
    many.map((l) => l.label),
    ["PR #7", "PR #6", "PR #5", "PR #4", "PR #3"],
  );
});
