import { test } from "node:test";
import assert from "node:assert/strict";
import {
  placeNew,
  fitBounds,
  clampTo,
  prunePositions,
  arrangeAll,
  fitRoom,
  petCenter,
} from "../desktop/pets.mjs";

const WA = { x: 0, y: 25, width: 1440, height: 875 };
// 바닥 줄 앵커 y = 25 + 875 - PET_H(70) = 830

test("placeNew: 바닥 왼쪽부터 128px 칸, 찬 칸은 건너뜀", () => {
  assert.deepEqual(placeNew([], WA), { x: 24, y: 830 });
  assert.deepEqual(placeNew([{ x: 24, y: 830 }], WA), { x: 152, y: 830 });
  // x=30 캐릭터는 128px 안의 칸(24·152)을 모두 가린다. 다른 줄(y 차이 50 이상)의 152는 칸을 차지하지 않는다
  assert.deepEqual(
    placeNew(
      [
        { x: 30, y: 830 },
        { x: 152, y: 500 },
      ],
      WA,
    ),
    { x: 280, y: 830 },
  );
});

test("placeNew: 바닥 줄이 차면 ROW_H(170) 위 둘째 줄, 셋째 줄까지 차면 첫 칸에 겹침", () => {
  const row = (y) =>
    Array.from({ length: 11 }, (_, k) => ({ x: 24 + 128 * k, y }));
  assert.deepEqual(placeNew(row(830), WA), { x: 24, y: 660 });
  assert.deepEqual(placeNew([...row(830), ...row(660)], WA), {
    x: 24,
    y: 490,
  });
  assert.deepEqual(placeNew([...row(830), ...row(660), ...row(490)], WA), {
    x: 24,
    y: 830,
  });
});

test("fitBounds: 왼쪽 아래 고정, 오른쪽 끝에서는 왼쪽으로 밀림, 상한", () => {
  // 최소 80×70. 앵커 y는 창 아래 - PET_H(70)
  assert.deepEqual(fitBounds({ x: 100, y: 830 }, 80, 60, WA), {
    x: 100,
    y: 830,
    width: 80,
    height: 70,
  });
  assert.deepEqual(fitBounds({ x: 100, y: 830 }, 200, 96, WA), {
    x: 100,
    y: 804,
    width: 200,
    height: 96,
  });
  assert.deepEqual(fitBounds({ x: 1400, y: 830 }, 460, 70, WA), {
    x: 980,
    y: 830,
    width: 460,
    height: 70,
  });
  const big = fitBounds({ x: 0, y: 830 }, 500, 2000, WA);
  assert.equal(big.width, 460);
  assert.equal(big.height, 525);
  assert.equal(big.y + big.height, 900); // 아래 모서리 유지
});

test("clampTo: 화면 밖 위치를 안으로", () => {
  assert.deepEqual(clampTo(WA, { x: -50, y: 5000 }), { x: 0, y: 830 });
  assert.deepEqual(clampTo(WA, { x: 2000, y: 0 }), { x: 1360, y: 25 });
});

test("prunePositions: 지금 책상 목록(휴면 포함)에 없는 pid만 지운다", () => {
  const pos = {
    1: { x: 24, y: 830 },
    2: { x: 200, y: 830 },
    3: { x: 1, y: 1 },
  };
  const out = prunePositions(pos, [1, 2]);
  assert.deepEqual(out, { 1: { x: 24, y: 830 }, 2: { x: 200, y: 830 } });
  assert.notEqual(out, pos); // 새 객체
});

test("prunePositions: 깨진 항목(숫자 아님)은 버린다", () => {
  assert.deepEqual(
    prunePositions({ 1: { x: "a", y: 5 }, 2: { x: 3, y: 4 } }, [1, 2]),
    { 2: { x: 3, y: 4 } },
  );
});

test("arrangeAll: pid 순서대로 바닥 왼쪽부터 128px 간격, 줄이 차면 위 줄", () => {
  const out = arrangeAll([3, 1, 2], WA);
  assert.deepEqual(out, {
    3: { x: 24, y: 830 },
    1: { x: 152, y: 830 },
    2: { x: 280, y: 830 },
  });
  const many = arrangeAll(Array.from({ length: 12 }, (_, i) => i + 1), WA);
  assert.deepEqual(many[12], { x: 24, y: 830 - 170 }); // 11칸 뒤 12번째는 둘째 줄
  assert.deepEqual(arrangeAll([], WA), {});
});

test("fitBounds: min을 0으로 주면(허브) 내용물 크기 그대로, 아래 모서리 유지", () => {
  assert.deepEqual(fitBounds({ x: 100, y: 830 }, 48, 48, WA, { w: 0, h: 0 }), {
    x: 100,
    y: 852,
    width: 48,
    height: 48,
  });
});

// 측정된 화면(메뉴 막대 38, 1512×944 작업 영역). 바닥 줄 앵커 y = 38 + 944 - 70 = 912
const WA2 = { x: 0, y: 38, width: 1512, height: 944 };

test("fitBounds·fitRoom: 위쪽 캐릭터에서 긴 말풍선을 펼쳐도 창이 작업 영역 위로 안 나간다", () => {
  const a = { x: 300, y: 200 };
  const r = fitBounds(a, 436, 565, WA2);
  assert.deepEqual(r, { x: 300, y: 38, width: 436, height: 232 }); // 전: y -295
  assert.deepEqual(fitRoom(a, r, WA2), { shiftX: 0, roomAbove: 232 });
});

test("fitRoom: 오른쪽 끝에서 창이 앵커보다 밀린 만큼 shiftX — 창 x + shiftX(캐릭터 자리)는 폭이 바뀌어도 그대로", () => {
  const a = { x: 1400, y: 912 };
  const narrow = fitBounds(a, 128, 70, WA2);
  const wide = fitBounds(a, 248, 70, WA2); // 쪽지
  assert.equal(narrow.x, 1384);
  assert.equal(wide.x, 1264);
  assert.equal(fitRoom(a, narrow, WA2).shiftX, 16);
  assert.equal(fitRoom(a, wide, WA2).shiftX, 136);
  const free = { x: 100, y: 912 };
  assert.equal(fitRoom(free, fitBounds(free, 248, 70, WA2), WA2).shiftX, 0);
});

test("fitRoom: roomAbove는 창 아래 모서리에서 작업 영역 위 끝까지, 단 창 상한(작업 영역 60%)을 넘지 않는다", () => {
  const a = { x: 24, y: 912 };
  const r = fitBounds(a, 128, 100, WA2);
  assert.equal(r.y + r.height, 982);
  assert.equal(fitRoom(a, r, WA2).roomAbove, 566); // floor(944 × 0.6). 위 끝까지는 944
  // 허브(min 0)도 같은 규칙
  const hub = { x: 300, y: 100 };
  const h = fitBounds(hub, 96, 400, WA2, { w: 0, h: 0 });
  assert.deepEqual(h, { x: 300, y: 38, width: 96, height: 132 });
  assert.equal(fitRoom(hub, h, WA2).roomAbove, 132);
});

test("보조 모니터: 그 화면의 작업 영역으로 맞추면 주 모니터로 밀리지 않는다(왼쪽·위로 어긋난 음수 좌표)", () => {
  const LEFT = { x: -1920, y: -200, width: 1920, height: 1055 };
  const a = { x: -800, y: 700 };
  assert.deepEqual(clampTo(WA2, a), { x: 0, y: 700 }); // 전: 주 모니터 기준이라 끌어도 x 0에 막혔다
  assert.deepEqual(clampTo(LEFT, a), a);
  const r = fitBounds(a, 436, 2000, LEFT);
  assert.deepEqual(r, { x: -800, y: 137, width: 436, height: 633 }); // 상한 floor(1055 × 0.6)
  assert.deepEqual(fitRoom(a, r, LEFT), { shiftX: 0, roomAbove: 633 });
  // 그 화면의 오른쪽 끝(= 주 모니터와의 경계)에서도 밀림 계산은 같다
  const edge = { x: -100, y: 700 };
  const w = fitBounds(edge, 248, 70, LEFT);
  assert.equal(w.x, -248);
  assert.equal(fitRoom(edge, w, LEFT).shiftX, 148);
  // 위쪽 끝: 작업 영역 위(-200)를 넘지 않는다
  const top = { x: -800, y: -150 };
  const t = fitBounds(top, 300, 600, LEFT);
  assert.equal(t.y, -200);
  assert.equal(fitRoom(top, t, LEFT).roomAbove, 120);
});

test("petCenter: 디스플레이를 고르는 기준점 = 캐릭터 중심(창 왼쪽 + 64, 바닥 칸 가운데). 경계에 걸치면 중심이 있는 화면", () => {
  assert.deepEqual(petCenter({ x: 300, y: 912 }), { x: 364, y: 947 });
  assert.ok(petCenter({ x: -50, y: 700 }).x > 0); // 창 왼쪽은 왼쪽 모니터, 캐릭터 중심은 주 모니터
});
