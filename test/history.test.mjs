import { test } from "node:test";
import assert from "node:assert/strict";
import { createHistory } from "../lib/history.mjs";

const NOW = Date.parse("2026-10-27T05:00:00Z"),
  M = 60e3,
  H = 3600e3;
const desk = (pid, state, since, o = {}) => ({
  pid,
  title: `t${pid}`,
  zone: "z",
  state,
  since,
  reason: null,
  bubble: null,
  ...o,
});

test("첫 수집: 휴면 아닌 팀장마다 지금 상태로 바뀐 순간 하나, 2시간 넘은 건 lastEventAt에만", () => {
  const h = createHistory();
  const r = h.update(
    [
      desk(1, "working", NOW - 6 * M),
      desk(2, "dormant", NOW - 5 * 24 * H),
      desk(3, "resting", NOW - 3 * H),
    ],
    NOW,
  );
  assert.deepEqual(
    r.events.map((e) => [e.id, e.pid, e.from, e.to, e.at]),
    [[0, 1, null, "working", NOW - 6 * M]],
  );
  assert.equal(
    createHistory().update([desk(3, "resting", NOW - 3 * H)], NOW).lastEventAt,
    NOW - 3 * H,
  );
});

test("전환·끝남 말풍선·같은 상태 반복", () => {
  const h = createHistory();
  h.update([desk(1, "working", NOW - M)], NOW);
  h.update(
    [desk(1, "waiting", NOW + 10e3, { reason: "permission" })],
    NOW + 10e3,
  );
  h.update(
    [desk(1, "waiting", NOW + 10e3, { reason: "permission" })],
    NOW + 11e3,
  ); // 늘지 않는다
  const r = h.update(
    [desk(1, "resting", NOW + 20e3, { bubble: "목록 API 3개 정리 완료" })],
    NOW + 20e3,
  );
  assert.deepEqual(
    r.events.map((e) => [e.from, e.to, e.reason, e.note]),
    [
      [null, "working", null, null],
      ["working", "waiting", "permission", null],
      ["waiting", "resting", null, "목록 API 3개 정리 완료"],
    ],
  );
});

test("휴면 전환은 안 쌓고, 휴면에서 깨면 쌓는다. 2시간 지난 이벤트는 지워도 lastEventAt은 남는다", () => {
  const h = createHistory();
  h.update([desk(1, "resting", NOW)], NOW);
  let r = h.update([desk(1, "dormant", NOW + 8 * H)], NOW + 8 * H);
  assert.deepEqual([r.events, r.lastEventAt], [[], NOW]);
  r = h.update([desk(1, "working", NOW + 8 * H + M)], NOW + 8 * H + M);
  assert.deepEqual(
    r.events.map((e) => [e.from, e.to]),
    [["dormant", "working"]],
  );
});

test("퇴근: gone 보관, 2시간 뒤 정리, 이벤트에 이름 박제, pid 재사용", () => {
  const h = createHistory();
  h.update([desk(1, "working", NOW - M)], NOW);
  let r = h.update([], NOW + 20e3);
  assert.deepEqual(
    [r.gone[0].pid, r.gone[0].goneAt, r.events.at(-1).to, r.events.at(-1).from],
    [1, NOW + 20e3, "gone", "working"],
  );
  r = h.update(
    [desk(1, "working", NOW + 30e3, { title: "새 세션" })],
    NOW + 30e3,
  );
  assert.deepEqual(r.gone, []);
  assert.deepEqual(
    r.events.map((e) => [e.title, e.from]),
    [
      ["t1", null],
      ["t1", "working"],
      ["새 세션", null],
    ],
  );
  r = h.update([], NOW + 40e3);
  assert.equal(h.update([], NOW + 40e3 + 2 * H + 1).gone.length, 0);
});

test("since가 없거나 미래면 now, id는 겹치지 않는다", () => {
  const h = createHistory();
  h.update([desk(1, "working", NOW)], NOW);
  const r = h.update(
    [desk(1, "waiting", null), desk(2, "working", NOW + H)],
    NOW + 1e3,
  );
  assert.deepEqual(
    r.events.slice(1).map((e) => e.at),
    [NOW + 1e3, NOW + 1e3],
  );
  assert.equal(new Set(r.events.map((e) => e.id)).size, r.events.length);
});
