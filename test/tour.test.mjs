import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOffice, summarizeTranscript } from "../lib/office.mjs";
import { createHistory } from "../lib/history.mjs";
import { extractLinks } from "../lib/links.mjs";
import { FRESH_MS } from "../public/common.mjs";
import { tourState, TOUR_PID, liveBadge } from "../public/tour.mjs";

const NOW = Date.parse("2026-10-29T05:00:00Z");
const keys = (o) => Object.keys(o).sort();
// public/tower.mjs isFable과 같은 식. tower.mjs는 불러오면 바로 canvas를 만들어 node에서 import할 수 없다
const isFable = (d) => d.model?.includes("fable") ?? false;

// 기준 모양: 실제 수집과 같은 길(buildOffice → createHistory, extractLinks)로 만든다.
// API가 바뀌면 이 테스트가 깨져 튜토리얼 예시 데이터도 고치게 된다(스펙 2026-10-29-tutorial §4.2)
function reference() {
  const terminal = {
    pid: 1,
    sessionId: "s",
    cwd: "/r",
    name: "r",
    status: "busy",
    waitingFor: null,
    statusUpdatedAt: NOW,
  };
  const team = [
    {
      description: "일함",
      agentType: "Explore",
      finished: false,
      mtimeMs: NOW,
      records: [],
    },
    {
      description: "끝남",
      agentType: "Explore",
      finished: true,
      mtimeMs: NOW,
      records: [],
    },
  ];
  const office = buildOffice(
    [
      {
        terminal,
        zone: { zone: "r", worktree: null },
        summary: summarizeTranscript([], "/r"),
        team,
        sessionStart: NOW,
        links: [],
      },
    ],
    NOW,
  );
  const h = createHistory();
  h.update(office.desks, NOW);
  const { events, gone } = h.update([], NOW + 1);
  const [desk] = office.desks;
  return {
    desk,
    working: desk.team.find((m) => m.working),
    retired: desk.team.find((m) => !m.working),
    event: events[0],
    gone: gone[0],
    link: extractLinks([], "feat/SHOP-1")[0],
  };
}

test("tourState: /api/state와 같은 모양", () => {
  const ref = reference();
  const s = tourState(NOW);
  assert.deepEqual(keys(s), [
    "counts",
    "desks",
    "events",
    "generatedAt",
    "gone",
    "lastEventAt",
  ]);
  for (const d of [...s.desks])
    assert.deepEqual(keys(d), keys(ref.desk), d.title);
  for (const g of s.gone) assert.deepEqual(keys(g), keys(ref.gone), g.title);
  for (const e of s.events) assert.deepEqual(keys(e), keys(ref.event));
  for (const d of [...s.desks, ...s.gone]) {
    for (const m of d.team)
      assert.deepEqual(
        keys(m),
        keys(m.working ? ref.working : ref.retired),
        m.name,
      );
    for (const l of d.links) assert.deepEqual(keys(l), keys(ref.link), l.label);
  }
  const counts = { waiting: 0, working: 0, resting: 0, dormant: 0 };
  for (const d of s.desks) counts[d.state]++;
  assert.deepEqual(s.counts, counts);
});

test("tourState: 7단계가 가리킬 것이 모두 있다(스펙 §4.1)", () => {
  const s = tourState(NOW);
  const byPid = (pid) => s.desks.find((d) => d.pid === pid);
  const zones = new Set(
    s.desks.filter((d) => d.state !== "dormant").map((d) => d.zone),
  );
  assert.ok(zones.size >= 2, "층 2개 이상");

  const lead = byPid(TOUR_PID.lead);
  assert.equal(lead.state, "working");
  assert.ok(isFable(lead), "Fable 팀장");
  assert.ok(lead.bubble && lead.doing);
  const ducks = lead.team.slice(0, 3).filter((m) => m.working && m.doing);
  assert.ok(ducks.length >= 2, "말풍선이 그려지는 팀원 2명 이상");
  assert.ok(
    ducks.some(isFable) && ducks.some((m) => !isFable(m)),
    "Fable 오리와 아닌 오리",
  );
  const kinds = new Set(lead.links.map((l) => l.kind));
  for (const k of ["PR", "Jira", "artifact"]) assert.ok(kinds.has(k), k);

  const wait = byPid(TOUR_PID.wait);
  assert.equal(wait.state, "waiting");
  assert.equal(wait.reason, "permission");
  assert.ok(
    NOW - wait.since >= 5 * 60e3 && NOW - wait.since < 15 * 60e3,
    "5분 단계",
  );

  const resting = s.desks.filter((d) => d.state === "resting");
  assert.ok(
    resting.some((d) => NOW - d.since < FRESH_MS),
    "방금 끝남",
  );
  assert.ok(
    resting.some((d) => NOW - d.since >= FRESH_MS),
    "휴식",
  );
  const dormant = s.desks.filter((d) => d.state === "dormant");
  assert.ok(
    dormant.length >= 2 && dormant.some((d) => d.staleDays),
    "휴면 2팀, 답 대기 1",
  );
  assert.ok(s.gone.length >= 1, "퇴근");
  assert.ok(
    s.events.length >= 3 && s.events.every((e) => NOW - e.at < 2 * 3600e3),
    "최근 2시간 로그",
  );
});

test("liveBadge: 튜토리얼을 끝내고 실제 사무실에 왔을 때 배지(T51)", () => {
  const desk = { pid: 1 };
  assert.equal(
    liveBadge({ desks: [desk, desk, desk], offlineSince: null }),
    "● 실제 데이터 · 터미널 3개",
  );
  assert.equal(
    liveBadge({ desks: [], offlineSince: null }),
    "● 실제 데이터 · 아직 떠 있는 터미널 없음 — claude를 실행하면 방이 생긴다",
  );
  // 서버에 닿지 못하면 desks가 비어 있어도 "터미널 없음"이라고 하지 않는다
  assert.equal(
    liveBadge({ desks: [], offlineSince: NOW }),
    "● 실제 화면 · 서버에 닿지 못했다",
  );
});
