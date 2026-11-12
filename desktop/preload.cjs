// 렌더러(sandbox)가 메인에 시킬 수 있는 일만 노출한다. 그 밖은 전부 HTTP(/api/state, /api/focus)로 한다.
// fit·dragTo·dragEnd·menu는 캐릭터 창(미니 모드 2, ADR 0006)에서, arrange·newTerminal은 본부(허브) 창에서만 뜻이 있다. 메인이 보낸 창을 검증한다.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentOffice", {
  openOffice: () => ipcRenderer.invoke("office:open"),
  openMini: () => ipcRenderer.invoke("mini:open"),
  // fit·dragTo → { shiftX, roomAbove } | false(desktop/pets.mjs fitRoom). shiftX: 오른쪽 끝에 걸려 창이 앵커보다 왼쪽으로 밀린 px
  // (캐릭터 열을 그만큼 오른쪽으로). roomAbove: 창이 아래 모서리에서 위로 자랄 수 있는 높이(펼친 말풍선 최대 높이의 기준)
  fit: (w, h, opts) => ipcRenderer.invoke("pet:fit", w, h, opts ?? {}),
  dragTo: (x, y) => ipcRenderer.invoke("pet:drag", x, y),
  // 메인이 스스로 창을 옮겼을 때(허브 정렬·디스플레이 변경) 같은 값을 보낸다
  onRoom: (cb) => ipcRenderer.on("pet:room", (_e, room) => cb(room)),
  dragEnd: () => ipcRenderer.invoke("pet:drag-end"),
  menu: (pid, info) => ipcRenderer.invoke("pet:menu", pid, info ?? {}),
  arrange: () => ipcRenderer.invoke("hub:arrange"),
  newTerminal: () => ipcRenderer.invoke("hub:terminal"),
  togglePets: () => ipcRenderer.invoke("hub:pets"), // → 지금 숨김인지(boolean)
});
