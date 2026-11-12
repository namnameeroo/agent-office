// 투명 창 끌기(캐릭터 창 mini.mjs · 허브 hub.mjs 공용). 4px 넘게 움직여야 끌기다(그 전에 놓으면 클릭·더블클릭).
// 창 위치는 메인이 앵커(창의 왼쪽 아래 모서리)로 받는다: x = 화면 x - 잡은 점의 앵커 기준 x, bottom = 화면 y + 잡은 점에서 창 아래까지.
// 아래 기준이라 끌던 중 창 높이가 바뀌어도(말풍선) 어긋나지 않는다.
// shiftX(): 창이 오른쪽 끝에 걸려 앵커보다 왼쪽으로 밀린 px(캐릭터 창). 잡은 점을 앵커 기준으로 바꿔야 끌기 시작에 안 튄다.
// onRoom: dragTo가 돌려준 { shiftX, roomAbove }를 받는다
export function draggable({ canStart, shiftX = () => 0, onStart, onEnd, onRoom }) {
  let drag = null; // { gx, gyb, sx, sy, moved }
  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !canStart(e)) return;
    drag = {
      gx: e.clientX - shiftX(),
      gyb: innerHeight - e.clientY,
      sx: e.screenX,
      sy: e.screenY,
      moved: false,
    };
  });
  document.addEventListener("mousemove", (e) => {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.abs(e.screenX - drag.sx) + Math.abs(e.screenY - drag.sy) <= 4)
        return;
      drag.moved = true;
      onStart?.();
    }
    window.agentOffice
      ?.dragTo(e.screenX - drag.gx, e.screenY + drag.gyb)
      .then((room) => onRoom?.(room));
  });
  const end = () => {
    if (!drag) return;
    const { moved } = drag;
    drag = null;
    if (moved) window.agentOffice?.dragEnd();
    onEnd?.(moved);
  };
  document.addEventListener("mouseup", end);
  document.addEventListener("mouseleave", end);
}
