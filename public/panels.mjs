// 우측 요약(집계·펼친 목록·로그)과 하단 상세(스펙 §3.2·§3.3). wireframes/office-v2.html에서 옮겼다.
// DOM은 key로 노드를 재사용하는 sync와 바뀐 값만 쓰는 setText로만 맞춘다(§5)
import { el, setText, setAttr, setClass, sync } from "./dom.mjs";
import {
  STATES,
  NAME,
  LOG_MS,
  ago,
  elapsed,
  hm,
  hms,
  mdhm,
  eventText,
  recentLinks,
  chips,
  boardNote,
  floorTag,
} from "./common.mjs";
import { ph, isFable } from "./tower.mjs";

// items = [{ key, make(), update(node) }]를 parent 안에 key 순서대로 맞춘다
const put = (parent, items) =>
  sync(
    parent,
    items,
    (it) => it.key,
    (it) => it.make(),
    (node, it) => it.update(node),
  );
const button = (cls) => {
  const b = el("button", cls);
  b.type = "button";
  return b;
};
// 같은 내용의 줄은 같은 key. 내용이 겹치면 순번을 붙인다
const keyed = (xs, keyOf) => {
  const seen = new Map();
  return xs.map((x) => {
    const k = keyOf(x);
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return { x, key: n ? `${k}#${n}` : k };
  });
};

// root = #side. 집계 4칸, 펼친 목록, 로그
export function renderSide(
  root,
  { desks, gone, events, lastEventAt, sel, pick, seenAt, now },
) {
  const c = Object.fromEntries(STATES.map(([k]) => [k, 0]));
  for (const d of desks) c[d.state]++;
  sync(
    root.querySelector("#counts"),
    STATES,
    ([k]) => k,
    ([k, name, hint]) => {
      const t = button("count");
      t.dataset.action = "pick";
      t.dataset.state = k;
      t.append(el("b"), el("span", null, name), el("small", null, hint));
      return t;
    },
    (t, [k]) => {
      setClass(t, `count${k === "waiting" && c[k] ? " hot" : ""}`);
      setAttr(t, "aria-expanded", String(pick === k));
      setText(t.firstChild, c[k]);
    },
  );

  // 집계 칸을 누르면 그 상태의 팀 목록. 오래된 순(나를 기다림이면 오래 기다린 순)
  const box = root.querySelector("#pick");
  box.hidden = !pick;
  const list = pick
    ? desks.filter((d) => d.state === pick).sort((a, b) => a.since - b.since)
    : [];
  put(
    box,
    !pick
      ? []
      : [
          {
            key: "h",
            // 제목 · 안내(T39: 안내는 한 단계 낮은 위계라 흐리고 가늘게)
            make: () => {
              const h = el("h3");
              h.append(el("span"), el("span", "hint", "누르면 그 자리로 이동"));
              return h;
            },
            update: (h) =>
              setText(h.firstChild, `${NAME[pick]} ${list.length}`),
          },
          ...(list.length
            ? list.map((d) => ({
                key: `p:${d.pid}`,
                make: () => {
                  const b = button("prow");
                  b.dataset.pid = d.pid;
                  b.append(el("span", "n"), el("span", "z"), el("span", "t"));
                  return b;
                },
                update: (b) => {
                  setClass(b, `prow${d.pid === sel ? " sel" : ""}`);
                  setText(b.children[0], d.title);
                  setText(b.children[1], d.zone);
                  setText(b.children[2], boardNote(d, now));
                },
              }))
            : [
                {
                  key: "none",
                  make: () => el("p", "empty pad", "없음"),
                  update: () => {},
                },
              ]),
        ],
  );

  // 로그: 응답의 events로 통째로 맞춘다. key = 이벤트 id. 서버가 재시작해 id가 다시 0부터 시작해도
  // update가 줄 내용을 그 이벤트로 다시 쓰므로 옛 줄과 섞이지 않는다. 이름은 이벤트에 박제된 e.title
  const recent = events
    .filter((e) => now - e.at < LOG_MS)
    .sort((a, b) => b.at - a.at);
  const fresh = recent.filter((e) => e.at > seenAt).length;
  setText(root.querySelector("#log-new"), fresh ? `새 ${fresh}` : "");
  const left = new Set(
    gone.filter((g) => !desks.some((d) => d.pid === g.pid)).map((g) => g.pid),
  );
  const rows = [];
  let divided = false;
  for (const e of recent) {
    // 마지막으로 본 시점 구분선: 그 뒤에 생긴 줄과 이미 본 줄 사이
    if (fresh && !divided && e.at <= seenAt) {
      rows.push({
        key: "seen",
        make: () => el("li", "seen"),
        update: (li) => setText(li, `여기까지 봄 · ${hm(seenAt)}`),
      });
      divided = true;
    }
    rows.push({
      key: `e:${e.id}`,
      make: () => {
        const li = el("li");
        const b = button("lrow");
        b.append(el("span", "n"), el("time"), el("span", "x"), el("span", "z"));
        li.append(b);
        return li;
      },
      update: (li) => {
        const b = li.firstChild;
        const off = left.has(e.pid);
        b.dataset.pid = e.pid;
        setClass(b, `lrow${e.pid === sel ? " sel" : ""}${off ? " gone" : ""}`);
        setAttr(
          b,
          "title",
          `${hms(e.at)} · ${e.title} · ${eventText(e)} · ${e.zone}`,
        );
        const [n, t, x, z] = b.children;
        setText(n, off ? `${e.title} (퇴근)` : e.title);
        setText(t, hm(e.at));
        setText(x, eventText(e));
        setText(z, e.zone);
      },
    });
  }
  if (!recent.length)
    rows.push({
      key: "empty",
      make: () => el("li", "empty pad"),
      update: (li) =>
        setText(
          li,
          `최근 2시간 변화 없음${lastEventAt ? ` · 마지막 변화 ${ago(lastEventAt, now)}` : ""}`,
        ),
    });
  put(root.querySelector("#log"), rows);
}

// root = #detail. 선택한 팀(또는 퇴근한 팀의 마지막 모습)의 머리줄과 세 칸
export function renderDetail(root, { desks, gone, sel, folded, now }) {
  const d = desks.find((x) => x.pid === sel) ?? gone.find((x) => x.pid === sel);
  const toggle = {
    key: "fold",
    make: () => {
      const b = button("fold-btn");
      b.dataset.action = "fold";
      return b;
    },
    update: (b) => {
      setText(b, folded ? "펼치기 ▴" : "접기 ▾");
      setAttr(b, "aria-expanded", String(!folded));
    },
  };
  const span = (key, cls, text) => ({
    key,
    make: () => el("span", cls),
    update: (s) => setText(s, text),
  });
  const head = !d
    ? [span("none", "empty", "팀을 누르면 상세가 여기에 나온다"), toggle]
    : [
        {
          key: "face",
          make: () => el("span", "portrait"),
          // F는 하단을 낮게 쓰려고 초상화를 36px(2배 픽셀)로 그린다. 그림이 바뀔 때만 다시 넣는다
          update: (s) => {
            const fig = `${d.goneAt ? "gone" : d.state}:${d.pid}:${isFable(d)}`;
            if (s.dataset.fig === fig) return;
            s.dataset.fig = fig;
            s.replaceChildren(
              ph(36, "팀장", d.goneAt ? "gone" : d.state, d.pid, isFable(d)),
            );
          },
        },
        {
          key: "chip",
          make: () => el("span"),
          update: (s) => {
            setClass(s, `chip ${d.goneAt ? "gone" : d.state}`);
            setText(s, d.goneAt ? "퇴근" : NAME[d.state]);
          },
        },
        // 층 이름표(건물 층 라벨과 같은 글꼴) · 제목 · 경로 · branch 칩. 폴더와 branch가 섞이지 않게 모양을 나눈다
        span("floor", "ftag", floorTag(desks, d)),
        {
          key: "title",
          make: () => el("h2"),
          update: (h) => setText(h, d.title),
        },
        span(
          "path",
          "muted path",
          (d.cwd ?? "").replace(/^\/Users\/[^/]+/, "~"),
        ),
        ...(d.branch ? [span("branch", "bchip", `⎇ ${d.branch}`)] : []),
        span(
          "when",
          "muted",
          d.goneAt
            ? `${hm(d.goneAt)} 퇴근 · 퇴근 직전 모습`
            : `${elapsed(d.since, now)}${d.sessionStart ? ` · 세션 시작 ${mdhm(d.sessionStart)}` : ""}`,
        ),
        ...(d.links?.length
          ? [
              {
                key: "links",
                make: () => el("span", "chips"),
                update: (s) => chips(recentLinks(d.links), s),
              },
            ]
          : []),
        toggle,
      ];

  const items = [
    {
      key: "head",
      make: () => el("div", "dhead"),
      update: (h) => put(h, head),
    },
  ];
  if (d && !folded)
    items.push({
      key: "cols",
      make: () => el("div", "dcols"),
      update: (c) => put(c, columns(d, now)),
    });
  put(root, items);
}

// 세 칸: 마지막 요청(내가 한 말) · 팀장이 한 말 · 팀원. 칸마다 내용이 없으면 "기록 없음"으로 바꿔 끼운다
function columns(d, now) {
  const col = (key, title, body, cls = "dcol") => ({
    key,
    make: () => {
      const s = el("section", cls);
      s.append(el("h3"));
      return s;
    },
    update: (s) => {
      setText(s.firstChild, title);
      // 제목(key 없음)은 맨 앞에 두고 내용 한 칸만 key로 맞춘다
      put(s, [body]);
    },
  });
  const empty = (text) => ({
    key: "empty",
    make: () => el("p", "empty", text),
    update: () => {},
  });
  // 팀장이 나에게 한 말 첫 줄(최신이 위). 도구 명령 원문은 읽기 어려워 보여주지 않는다
  const talk = keyed(d.talk ?? [], (t) => `${t.at}|${t.text}`);
  const mems = keyed(d.team, (m) => `${m.name}|${m.agentType}`);
  return [
    col(
      "prompt",
      "마지막 요청",
      d.lastPrompt
        ? {
            key: "q",
            make: () => el("blockquote", "prompt"),
            update: (q) => setText(q, d.lastPrompt),
          }
        : empty("기록 없음"),
      "dcol ask", // 내가 보낸 말이라 인용 블록으로 다른 칸(팀장 쪽 정보)과 구분한다
    ),
    col(
      "talk",
      "팀장이 한 말",
      talk.length
        ? {
            key: "list",
            make: () => el("ol", "talk"),
            update: (ol) =>
              sync(
                ol,
                talk,
                (r) => r.key,
                () => {
                  const li = el("li");
                  li.append(el("time"), el("span", "x"));
                  return li;
                },
                (li, { x: t }) => {
                  setText(li.children[0], hm(t.at));
                  setText(li.children[1], t.text);
                  setAttr(li, "title", `${hms(t.at)} · ${t.text}`);
                },
              ),
          }
        : empty("기록 없음"),
    ),
    col(
      "mems",
      `팀원 ${d.team.length}`,
      mems.length
        ? {
            key: "list",
            make: () => el("ul", "mems"),
            update: (ul) =>
              sync(
                ul,
                mems,
                (r) => r.key,
                () => {
                  const li = el("li");
                  li.append(el("span", "n"), el("span", "muted"));
                  return li;
                },
                (li, { x: m }) => {
                  // F는 이름과 지금 하는 일을 한 줄에 놓는다(넘치면 말줄임)
                  setClass(li, m.working ? "" : "muted");
                  setText(
                    li.children[0],
                    `${m.name} (${m.agentType}) · ${m.working ? "진행 중" : `퇴근 ${ago(m.endedAt, now)}`}`,
                  );
                  li.children[1].hidden = !(m.working && m.bubble);
                  setText(li.children[1], m.working ? (m.bubble ?? "") : "");
                },
              ),
          }
        : empty("팀원 없음"),
    ),
  ];
}
