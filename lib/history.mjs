// 상태 변화 로그와 퇴근한 팀장 보관(스펙 §3.2·§4). 서버 메모리에만 둔다. 순수 JS, IO 없음.
export const LOG_KEEP_MS = 2 * 3600e3;

// ponytail: 서버를 재시작하면 로그와 퇴근 기록이 사라진다(스펙 §4가 받아들인 한계). 남겨야 하면 파일에 쓴다
export function createHistory({ keepMs = LOG_KEEP_MS } = {}) {
  let prev = new Map(); // pid → 직전 수집의 Desk
  let events = [];
  let gone = [];
  let nextId = 0;
  let lastEventAt = null;

  // 이벤트에는 그때의 팀 이름·폴더를 박제한다. pid가 재사용돼도 옛 줄의 이름이 바뀌지 않는다
  const log = (d, from, to, at, now) => {
    lastEventAt = Math.max(lastEventAt ?? at, at);
    if (at < now - keepMs) return;
    events.push({
      id: nextId++,
      at,
      pid: d.pid,
      title: d.title,
      zone: d.zone,
      from,
      to,
      reason: to === "gone" ? null : (d.reason ?? null),
      note: to === "resting" ? (d.bubble ?? null) : null, // 작업 끝남 줄에 마지막 말풍선
    });
  };

  return {
    update(desks, now) {
      const cur = new Map(desks.map((d) => [d.pid, d]));
      gone = gone.filter((g) => !cur.has(g.pid)); // 다시 나타난 pid는 새 팀장이다
      for (const d of desks) {
        const from = prev.get(d.pid)?.state ?? null;
        // 휴면으로 바뀌는 건 시간이 지난 것뿐이라 쌓지 않는다
        if (d.state === from || d.state === "dormant") continue;
        const at = d.since != null && d.since <= now ? d.since : now;
        log(d, from, d.state, at, now);
      }
      for (const [pid, d] of prev) {
        if (cur.has(pid)) continue;
        gone.push({ ...d, goneAt: now });
        log(d, d.state, "gone", now, now);
      }
      prev = cur;
      events = events
        .filter((e) => e.at >= now - keepMs)
        .sort((a, b) => a.at - b.at || a.id - b.id);
      gone = gone.filter((g) => g.goneAt >= now - keepMs);
      return { events: [...events], gone: [...gone], lastEventAt };
    },
  };
}
