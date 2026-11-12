import { test } from "node:test";
import assert from "node:assert/strict";
import { sync, setText } from "../public/dom.mjs";

// sync가 쓰는 DOM API(children, insertBefore, remove, dataset)만 흉내 낸다
class FakeEl {
  children = [];
  dataset = {};
  parent = null;
  append(n) {
    this.insertBefore(n, null);
  }
  insertBefore(n, ref) {
    n.remove();
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(n);
    else this.children.splice(i, 0, n);
    n.parent = this;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
}

test("sync: 같은 key는 같은 노드, 순서 맞춤, 없어진 key 제거, key 없는 자식 유지", () => {
  const p = new FakeEl(),
    canvas = new FakeEl();
  p.append(canvas);
  const made = [];
  const mk = (it) => {
    const n = new FakeEl();
    made.push(it.id);
    return n;
  };
  const up = (n, it) => {
    n.textContent = it.v;
  };
  sync(
    p,
    [
      { id: "a", v: 1 },
      { id: "b", v: 2 },
    ],
    (it) => it.id,
    mk,
    up,
  );
  const [, a, b] = p.children;
  sync(
    p,
    [
      { id: "b", v: 3 },
      { id: "c", v: 4 },
      { id: "a", v: 5 },
    ],
    (it) => it.id,
    mk,
    up,
  );
  assert.deepEqual(made, ["a", "b", "c"]);
  assert.equal(p.children[0], canvas);
  assert.equal(p.children[1], b);
  assert.equal(p.children[3], a);
  assert.deepEqual(
    p.children.slice(1).map((n) => n.textContent),
    [3, 4, 5],
  );
  sync(p, [{ id: "c", v: 6 }], (it) => it.id, mk, up);
  assert.deepEqual(
    p.children.map((n) => n.dataset.key ?? "canvas"),
    ["canvas", "c"],
  );
});

test("setText: 같은 글자면 쓰지 않는다", () => {
  let writes = 0;
  const n = {
    get textContent() {
      return "x";
    },
    set textContent(v) {
      writes++;
    },
  };
  setText(n, "x");
  setText(n, "y");
  assert.equal(writes, 1);
});
