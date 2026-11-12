// 1초 갱신에도 클릭·포커스·스크롤·텍스트 선택이 유지되도록, 노드를 key로 재사용하고 글자는 바뀔 때만 쓴다(스펙 §5).
export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

// 같은 글자를 다시 쓰면 텍스트 노드가 바뀌어 드래그 선택이 풀린다
export function setText(node, text) {
  const s = String(text ?? "");
  if (node.textContent !== s) node.textContent = s;
}

// 속성·클래스도 값이 다를 때만 쓴다. 1초마다 같은 값을 다시 써도 레이아웃·포커스가 흔들리지 않게
export function setAttr(node, name, value) {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}
export function setClass(node, className) {
  if (node.className !== className) node.className = className;
}

// parent의 key 있는 자식을 items 순서로 맞춘다. key 없는 자식(canvas 등)은 맨 앞에 그대로 둔다
export function sync(parent, items, keyOf, make, update) {
  const old = new Map();
  let base = 0;
  for (const n of [...parent.children]) {
    if (n.dataset.key === undefined) base++;
    else old.set(n.dataset.key, n);
  }
  const want = new Set(items.map((it) => String(keyOf(it))));
  for (const [k, n] of old) if (!want.has(k)) n.remove();
  items.forEach((it, j) => {
    const key = String(keyOf(it));
    let n = old.get(key);
    if (!n) {
      n = make(it);
      n.dataset.key = key;
    }
    update(n, it);
    const at = parent.children[base + j];
    if (at !== n) parent.insertBefore(n, at ?? null);
  });
}
