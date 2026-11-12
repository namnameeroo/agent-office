// 화면 정적 파일(public/) 경로. 허용한 모양만 통과시키고 나머지는 null이라 경로 이동이 생기지 않는다.
const TYPES = {
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
};

export function resolveStatic(pathname) {
  if (pathname === "/")
    return {
      file: new URL("../public/index.html", import.meta.url),
      type: "text/html; charset=utf-8",
    };
  let m = /^\/([\w-]+)\.(mjs|css)$/.exec(pathname);
  if (m)
    return {
      file: new URL(`../public/${m[1]}.${m[2]}`, import.meta.url),
      type: TYPES[m[2]],
    };
  // 미니 모드(하단 띠)는 별도 페이지다. index.html·style.css·app.mjs를 싣지 않는다
  if (pathname === "/mini")
    return {
      file: new URL("../public/mini.html", import.meta.url),
      type: "text/html; charset=utf-8",
    };
  if (pathname === "/favicon.svg")
    return {
      file: new URL("../public/favicon.svg", import.meta.url),
      type: "image/svg+xml",
    };
  m = /^\/fonts\/([\w-]+)\.woff2$/.exec(pathname);
  if (m)
    return {
      file: new URL(`../public/fonts/${m[1]}.woff2`, import.meta.url),
      type: "font/woff2",
    };
  return null;
}
