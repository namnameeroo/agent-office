// 캐릭터 창 기하. 순수 함수만(Electron 없음) — node --test 대상. 좌표는 DIP, 앵커 = 창의 왼쪽 아래 모서리.
export const PET_W = 80;
export const PET_H = 70; // 기본 창 높이(얼굴 44 + 이름표 16 + 여백)
export const SLOT = 128; // 접힌 칸 폭 126 이하(말풍선 108·이름표 112 + 여백)
export const ROW_H = 170; // 둘째 줄부터 올라가는 높이(두 줄 말풍선 + 표지판 + 두 줄 이름표까지 약 158 + 12)
export const MARGIN = 24;
export const MAX_W = 460;

const floorY = (wa) => wa.y + wa.height - PET_H;

// 새 캐릭터 자리: 바닥 왼쪽부터 128px 칸 중 비어 있는 첫 칸. 줄이 차면 ROW_H 위 줄, 셋째 줄까지 차면 첫 칸에 겹친다
export function placeNew(taken, wa) {
  const slots = Math.max(1, Math.floor((wa.width - MARGIN) / SLOT));
  for (let r = 0; r < 3; r++) {
    const y = floorY(wa) - ROW_H * r;
    for (let k = 0; k < slots; k++) {
      const x = wa.x + MARGIN + SLOT * k;
      const busy = taken.some(
        (t) => Math.abs(t.x - x) < SLOT && Math.abs(t.y - y) < ROW_H / 2,
      );
      if (!busy) return { x, y };
    }
  }
  return { x: wa.x + MARGIN, y: floorY(wa) };
}

export const FACE_X = 64; // 창 왼쪽에서 캐릭터 중심까지(칸 padding 6 + 116/2, mini.css)

// 아래 모서리가 bottom인 창이 위로 자랄 수 있는 높이: 작업 영역의 60%, 그리고 작업 영역 위 끝까지
const maxHeight = (bottom, wa) =>
  Math.min(Math.floor(wa.height * 0.6), bottom - wa.y);

// 내용물 크기(w, h)에 맞춘 창 사각형. 왼쪽 아래를 고정하되 화면을 벗어나면 안으로 민다
export function fitBounds(anchor, w, h, wa, min = { w: PET_W, h: PET_H }) {
  const width = Math.min(Math.max(min.w, Math.round(w)), MAX_W);
  const x = Math.min(Math.max(anchor.x, wa.x), wa.x + wa.width - width);
  const bottom = Math.min(
    Math.max(anchor.y + PET_H, wa.y + PET_H),
    wa.y + wa.height,
  );
  const height = Math.min(Math.max(min.h, Math.round(h)), maxHeight(bottom, wa));
  return { x, y: bottom - height, width, height };
}

// pet:fit이 렌더러에 돌려주는 값(r = fitBounds 결과).
// shiftX: 오른쪽 끝에 걸려 창이 앵커보다 왼쪽으로 밀린 px → 렌더러가 캐릭터 열을 그만큼 오른쪽으로 옮기면 캐릭터가 화면 제자리.
// roomAbove: 창이 지금 아래 모서리에서 위로 자랄 수 있는 높이(작업 영역 위 끝, 60% 상한 중 작은 쪽) → 펼친 말풍선 최대 높이의 기준
export function fitRoom(anchor, r, wa) {
  return {
    shiftX: Math.max(0, anchor.x - r.x),
    roomAbove: maxHeight(r.y + r.height, wa),
  };
}

// 이 캐릭터가 어느 디스플레이에 있는지 고르는 기준점(창이 경계에 걸치면 캐릭터 중심이 있는 쪽)
export const petCenter = (a) => ({ x: a.x + FACE_X, y: a.y + PET_H / 2 });

// 80×60 캐릭터가 작업 영역 안에 있게
export function clampTo(wa, anchor) {
  return {
    x: Math.min(Math.max(anchor.x, wa.x), wa.x + wa.width - PET_W),
    y: Math.min(Math.max(anchor.y, wa.y), floorY(wa)),
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

// 자동 정렬: 주어진 순서대로 바닥 왼쪽부터 SLOT 간격, 줄이 차면 ROW_H 위 줄. pid → 앵커
export function arrangeAll(pids, wa) {
  const slots = Math.max(1, Math.floor((wa.width - MARGIN) / SLOT));
  const out = {};
  pids.forEach((pid, i) => {
    out[pid] = {
      x: wa.x + MARGIN + SLOT * (i % slots),
      y: floorY(wa) - ROW_H * Math.floor(i / slots),
    };
  });
  return out;
}
