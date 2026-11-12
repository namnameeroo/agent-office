// 캐릭터 창 기하. 순수 함수만(Electron 없음) — node --test 대상. 좌표는 DIP, 앵커 = 창의 왼쪽 아래 모서리.
// 앵커 y + PET_H = 발밑(이름표 아래 + 5). 위로 자라는 창은 아래 끝이 발밑, 아래로 자라는 창(화면 위쪽 절반)은 위 끝이 발밑 - base
export const PET_W = 80;
export const PET_H = 70; // 기본 창 높이(얼굴 44 + 이름표 16 + 여백)
export const SLOT = 128; // 접힌 칸 폭 126 이하(말풍선 108·이름표 112 + 여백)
export const ROW_H = 170; // 둘째 줄부터 올라가는 높이(두 줄 말풍선 + 표지판 + 두 줄 이름표까지 약 158 + 12)
export const MARGIN = 24;
export const MAX_W = 460;
// 얼굴·두 줄 이름표 칸(칸 위 padding 8 + 얼굴 44 + 2 + 이름표 33 + 발밑 여백 5, mini.css). 아래로 자라는 창의 위 끝 = 발밑 - base.
// base는 렌더러가 재서 보낸다(이름표가 한 줄이면 80). 이 값은 첫 응답 전 대신 쓰는 값이자 위 정렬 첫 줄의 기준
export const BASE_H = 92;

const floorY = (wa) => wa.y + wa.height - PET_H;
// 위 정렬 첫 줄 = 캐릭터 앵커의 위 한계: 아래로 자라는 창의 위 끝(발밑 - BASE_H)이 작업 영역 위 끝
const ceilY = (wa) => wa.y + BASE_H - PET_H;

// 같은 줄(세로 반 줄 안)에서 가로 w 안이면 겹친다
const near = (a, b, w) =>
  Math.abs(a.x - b.x) < w && Math.abs(a.y - b.y) < ROW_H / 2;

// 캐릭터 중심이 그 화면 작업 영역의 위쪽 절반이면 창이 위 끝을 고정하고 아래로 자란다(말풍선·표지판·쪽지가 얼굴 아래)
export const growsDown = (anchor, wa) =>
  petCenter(anchor).y < wa.y + wa.height / 2;

// 새 캐릭터 자리. from(기준 캐릭터)이 있으면 그 바로 오른쪽 칸부터 같은 줄을 오른쪽으로, 없으면 바닥(down이면 위 첫 줄) 왼쪽 칸부터.
// taken(열린 창·허브·예약 자리)과 겹치면 다음 칸, 줄 끝이면 ROW_H 위(down이면 아래) 줄 왼쪽부터. 맨 오른쪽 칸은 접힌 창(SLOT 폭)이 화면 안.
// 셋째 줄까지 차면: from이 있었으면 바닥(down이면 위 첫 줄) 왼쪽부터 다시(기준 왼쪽 빈칸), 그래도 없으면 그 첫 칸에 겹친다
export function placeNew(taken, wa, from, down = false) {
  const left = wa.x + MARGIN;
  const right = wa.x + wa.width - SLOT;
  const dy = down ? ROW_H : -ROW_H;
  const y0 = from ? from.y : down ? ceilY(wa) : floorY(wa);
  for (let r = 0; r < 3; r++) {
    const y = y0 + dy * r;
    if (down ? y > floorY(wa) : y < wa.y) break;
    for (let x = r === 0 && from ? from.x + SLOT : left; x <= right; x += SLOT)
      if (!taken.some((t) => near(t, { x, y }, SLOT))) return { x, y };
  }
  return from ? placeNew(taken, wa, undefined, down) : { x: left, y: y0 };
}

// 가장 낮은 줄(맨 아래 캐릭터와 반 줄 안)에서 가장 오른쪽 캐릭터. top이면 가장 높은 줄. 없으면 undefined
function lastInRow(anchors, top = false) {
  const s = top ? -1 : 1;
  const edge = Math.max(...anchors.map((a) => s * a.y));
  return anchors
    .filter((a) => edge - s * a.y < ROW_H / 2)
    .reduce((m, a) => (m && m.x >= a.x ? m : a), undefined);
}

const inArea = (c, wa) =>
  c.x >= wa.x && c.x < wa.x + wa.width && c.y >= wa.y && c.y < wa.y + wa.height;

// 캐릭터 창을 만들 때의 자리 → { anchor, fresh }. fresh(새로 놓음)면 메인이 바로 저장해 예약한다.
// saved(이 세션의 저장 자리)는 그대로 쓰되, 다른 열린 캐릭터가 그 자리(반 칸 안)에 있으면(옛 중복 저장) 새로 놓는다.
// 새 자리: 가장 낮은 줄의 가장 오른쪽 캐릭터 바로 오른쪽, 그 캐릭터의 화면. 캐릭터가 없으면 허브 화면, 허브도 없으면 주 모니터 바닥 왼쪽부터.
// 가장 낮은 줄도 그 화면 위쪽 절반이면(위 정렬) 뒤집는다: 그 화면의 가장 높은 줄의 가장 오른쪽 바로 오른쪽, 줄이 차면 아래 줄.
// pets: 열린 캐릭터 앵커(허브 제외), hub: 허브 앵커, reserved: 살아 있는 다른 세션(휴면 포함)의 저장 자리,
// areaAt(앵커) → 그 캐릭터가 있는 화면의 작업 영역, primary: 주 모니터 작업 영역
export function spotFor({ saved, pets, hub, reserved, areaAt, primary }) {
  if (saved) {
    const a = clampTo(areaAt(saved), saved);
    if (!pets.some((p) => near(p, a, SLOT / 2))) return { anchor: a, fresh: false };
  }
  let from = lastInRow(pets);
  const wa = from ? areaAt(from) : hub ? areaAt(hub) : primary;
  const down = !!from && growsDown(from, wa);
  if (down) from = lastInRow(pets.filter((p) => inArea(petCenter(p), wa)), true);
  const taken = [...pets, hub, ...reserved].filter(Boolean);
  return { anchor: placeNew(taken, wa, from, down), fresh: true };
}

export const FACE_X = 64; // 창 왼쪽에서 캐릭터 중심까지(칸 padding 6 + 116/2, mini.css)

// 아래 끝이 bottom인 창이 위로 / 위 끝이 top인 창이 아래로 자랄 수 있는 높이: 작업 영역의 60%, 그리고 작업 영역 끝까지
const maxHeight = (bottom, wa) =>
  Math.min(Math.floor(wa.height * 0.6), bottom - wa.y);
const maxBelow = (top, wa) =>
  Math.min(Math.floor(wa.height * 0.6), wa.y + wa.height - top);

// 내용물 크기(w, h)에 맞춘 창 사각형. 화면을 벗어나면 안으로 민다. 기본은 왼쪽 아래(발밑)를 고정하고 위로 자란다.
// base(창 위 끝 → 발밑, 렌더러가 잰 얼굴·이름표 칸)를 주면 위 끝을 발밑 - base에 고정하고 아래로 자란다 → 얼굴·이름표는 두 방향에서 같은 화면 자리
export function fitBounds(anchor, w, h, wa, min = { w: PET_W, h: PET_H }, base) {
  const width = Math.min(Math.max(min.w, Math.round(w)), MAX_W);
  const x = Math.min(Math.max(anchor.x, wa.x), wa.x + wa.width - width);
  const want = Math.max(min.h, Math.round(h));
  if (base != null) {
    const top = Math.max(anchor.y + PET_H - base, wa.y);
    return { x, y: top, width, height: Math.min(want, maxBelow(top, wa)) };
  }
  const bottom = Math.min(
    Math.max(anchor.y + PET_H, wa.y + PET_H),
    wa.y + wa.height,
  );
  const height = Math.min(want, maxHeight(bottom, wa));
  return { x, y: bottom - height, width, height };
}

// pet:fit이 렌더러에 돌려주는 값(r = fitBounds 결과).
// shiftX: 오른쪽 끝에 걸려 창이 앵커보다 왼쪽으로 밀린 px → 렌더러가 캐릭터 열을 그만큼 오른쪽으로 옮기면 캐릭터가 화면 제자리.
// 위로 자라는 창: roomAbove = 지금 아래 끝에서 위로 자랄 수 있는 높이(작업 영역 위 끝, 60% 상한 중 작은 쪽) → 펼친 말풍선 최대 높이의 기준.
// 아래로 자라는 창(down): down true, roomBelow = 위 끝에서 아래로 자랄 수 있는 높이, footY = 창 위 끝에서 발밑까지(끌기의 잡은 점 기준)
export function fitRoom(anchor, r, wa, down = false) {
  const shiftX = Math.max(0, anchor.x - r.x);
  if (!down) return { shiftX, roomAbove: maxHeight(r.y + r.height, wa) };
  return {
    shiftX,
    down: true,
    roomBelow: maxBelow(r.y, wa),
    footY: anchor.y + PET_H - r.y,
  };
}

// 이 캐릭터가 어느 디스플레이에 있는지 고르는 기준점(창이 경계에 걸치면 캐릭터 중심이 있는 쪽)
export const petCenter = (a) => ({ x: a.x + FACE_X, y: a.y + PET_H / 2 });

// 앵커를 작업 영역 안으로. 캐릭터 창의 오른쪽 한계는 접힌 창 폭 SLOT(128) → 접힌 창은 오른쪽 끝에서도 밀리지 않아
// shiftX = 0(밀린 채로 캐릭터 열을 옮기면 얼굴이 화면 밖으로 나간다). 위 한계는 위 정렬 첫 줄(ceilY): 아래로 자라는 창의 위 끝이
// 작업 영역 위 끝에 막혀 얼굴이 발밑에서 밀리면 다음 끌기 시작에 튄다. 허브(hub)는 PET_W, 위로만 자라 위 한계는 작업 영역 위 끝
export function clampTo(wa, anchor, hub = false) {
  return {
    x: Math.min(Math.max(anchor.x, wa.x), wa.x + wa.width - (hub ? PET_W : SLOT)),
    y: Math.min(Math.max(anchor.y, hub ? wa.y : ceilY(wa)), floorY(wa)),
  };
}

// 저장된 위치 중 지금 책상 목록(휴면 포함)에 있는 pid만 남긴다. 깨진 항목(숫자 아님)도 버린다
export function prunePositions(positions, pids) {
  const keep = new Set(pids.map(String));
  const out = {};
  for (const [pid, p] of Object.entries(positions ?? {}))
    if (keep.has(pid) && Number.isFinite(p?.x) && Number.isFinite(p?.y))
      out[pid] = { x: p.x, y: p.y };
  return out;
}

// 자동 정렬: 주어진 순서대로 바닥 왼쪽부터 SLOT 간격, 줄이 차면 ROW_H 위 줄. side "top"이면 위 첫 줄(ceilY)부터, 줄이 차면 아래 줄. pid → 앵커
export function arrangeAll(pids, wa, side = "bottom") {
  const slots = Math.max(1, Math.floor((wa.width - MARGIN) / SLOT));
  const [y0, dy] = side === "top" ? [ceilY(wa), ROW_H] : [floorY(wa), -ROW_H];
  const out = {};
  pids.forEach((pid, i) => {
    out[pid] = {
      x: wa.x + MARGIN + SLOT * (i % slots),
      y: y0 + dy * Math.floor(i / slots),
    };
  });
  return out;
}
