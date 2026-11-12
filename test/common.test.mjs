import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickScale,
  floorTag,
  layoutLinks,
  LINK_ROW_MAX,
  overlay,
} from "../public/common.mjs";

test("pickScale: dpr 2면 0.5 단위, dpr 1이면 정수, 2~4로 자른다", () => {
  const tower = { W: 496, H: 244 }; // 실데이터 5단·2칸
  assert.equal(pickScale({ availW: 1492, availH: 692, ...tower, dpr: 2 }), 2.5);
  assert.equal(pickScale({ availW: 1492, availH: 692, ...tower, dpr: 1 }), 2);
  assert.equal(pickScale({ availW: 5000, availH: 5000, ...tower, dpr: 2 }), 4);
  assert.equal(pickScale({ availW: 600, availH: 300, ...tower, dpr: 2 }), 2);
});

test("floorTag: 건물과 같은 층 번호(폴더 이름순, 위층이 큰 번호), 휴면 B1, 퇴근은 폴더만", () => {
  const desks = [
    { pid: 1, zone: "b", state: "working" },
    { pid: 2, zone: "a", state: "resting" },
    { pid: 3, zone: "c", state: "dormant" },
  ];
  assert.equal(floorTag(desks, desks[1]), "2F · a");
  assert.equal(floorTag(desks, desks[0]), "1F · b");
  assert.equal(floorTag(desks, desks[2]), "B1 · c");
  assert.equal(
    floorTag(desks, { zone: "z", state: "working", goneAt: 1 }),
    "z",
  );
});

test("layoutLinks: 종류별로 모으고 칸 사이 1·종류 사이 2, 넘치는 칸은 종류마다 +N", () => {
  const l = (kind, n) => ({ kind, label: `${kind} ${n}`, url: null, at: n });
  const w = (x) => (x.kind === "artifact" ? 6 : 20);
  assert.deepEqual(
    layoutLinks([l("Jira", 2), l("PR", 1), l("artifact", 1)], w).map((c) => [
      c.kind,
      c.x,
      c.w,
    ]),
    [
      ["PR", 0, 20],
      ["Jira", 22, 20],
      ["artifact", 44, 6],
    ],
  );
  // 다 못 넣으면 종류마다 최신부터 번갈아 한 칸씩: PR 2칸·Jira 1칸 + 각 종류의 나머지 수
  const cells = layoutLinks(
    ["PR", "Jira"].flatMap((k) => [4, 3, 2, 1].map((n) => l(k, n))),
    w,
  );
  assert.ok(cells.at(-1).x + cells.at(-1).w <= LINK_ROW_MAX);
  assert.deepEqual(
    cells.map((c) => (c.more ? `${c.kind} +${c.more}` : c.link.label)),
    ["PR 4", "PR 3", "PR +2", "Jira 4", "Jira +3"],
  );
  assert.deepEqual(layoutLinks([], w), []);
});

test("layoutLinks: 종류마다 첫 칸은 꼭 넣고, 글자 그대로 안 들어가면 짧은 글자(short)로", () => {
  const l = (kind, label) => ({ kind, label, url: null, at: 1 });
  // 실데이터: PR #1344(27) + DATADEV-44(46) + artifact(6) = 83 > 80. Jira 번호만이면 22
  const w = (x, short) =>
    x.kind === "Jira" ? (short ? 22 : 46) : x.kind === "PR" ? 27 : 6;
  const cells = layoutLinks(
    [l("artifact", "a"), l("Jira", "DATADEV-44"), l("PR", "PR #1344")],
    w,
  );
  assert.deepEqual(
    cells.map((c) => [c.link.label, c.short]),
    [
      ["PR #1344", true],
      ["DATADEV-44", true],
      ["a", true],
    ],
  );
  assert.ok(cells.at(-1).x + cells.at(-1).w <= LINK_ROW_MAX);
  // 넉넉하면 글자 그대로
  assert.equal(layoutLinks([l("Jira", "DP-311")], w)[0].short, false);
});

test("overlay: 덮개는 dy째 줄부터 겹치고, 덮개의 '.'과 덮개보다 긴 부분은 아래 그림이 보인다", () => {
  const body = ["....", "OSSO", "OSSO", "OCCO"];
  assert.deepEqual(overlay(body, 1, ["H..H", "Oh"]), [
    "....",
    "HSSH",
    "OhSO",
    "OCCO",
  ]);
  // 빈 줄("")은 그 줄을 그대로 둔다(bob 옆모습 덮개, T45)
  assert.deepEqual(overlay(body, 1, ["H..H", "", "HH"]), [
    "....",
    "HSSH",
    "OSSO",
    "HHCO",
  ]);
  // 덮개가 왼쪽(dx < 0)·위(dy < 0)·오른쪽으로 나가면 그만큼 그림을 넓힌다(twin·perm, T47). 원점은 (dx, dy)만큼 옮겨진다
  assert.deepEqual(overlay(["OO", "OO"], -1, ["T...", "H..H"], -1), [
    "T...",
    "HOOH",
    ".OO.",
  ]);
  // 덮개가 그림 아래로 넘치면 넘친 줄은 버린다
  assert.deepEqual(overlay(body, 3, ["HH..", "HHHH"]), [
    "....",
    "OSSO",
    "OSSO",
    "HHCO",
  ]);
});
