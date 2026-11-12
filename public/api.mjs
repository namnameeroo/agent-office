// 서버 호출만 모은 모듈. 큰 창(app.mjs)과 미니 모드(mini.mjs)가 같은 계약을 쓴다. DOM 접근 없음.

// pid를 주면 desks를 그 세션 하나로 거른다(캐릭터 창). counts 등은 전체 기준 그대로
export async function fetchState(pid) {
  const r = await fetch(pid == null ? "/api/state" : `/api/state?pid=${pid}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(1500),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// 그 세션의 터미널을 앞으로(ADR 0003). 되면 null, 앱만 앞으로 왔거나 실패하면 화면에 띄울 이유 문구
export async function requestFocus(pid) {
  try {
    const r = await fetch("/api/focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid }),
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    return j.ok ? (j.partial ?? null) : (j.reason ?? `HTTP ${r.status}`);
  } catch {
    return "서버에 닿지 못했다";
  }
}
