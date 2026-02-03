const d = "data:application/wasm;base64,AGFzbQEAAAABCgJgAABgAnx8AXwCLwELLi9saWJfYmcuanMfX193YmluZGdlbl9pbml0X2V4dGVybnJlZl90YWJsZQAAAwIBAQQFAW8AgAEFAwEAEQYJAX8BQYCAwAALBzsEBm1lbW9yeQIAA2FkZAABFV9fd2JpbmRnZW5fZXh0ZXJucmVmcwEAEF9fd2JpbmRnZW5fc3RhcnQAAAoJAQcAIAAgAaALC8oHAgBBgIDAAAugByBpbmRleCBvdXQgb2YgYm91bmRzOiB0aGUgbGVuIGlzIMASIGJ1dCB0aGUgaW5kZXggaXMgwABsaWJyYXJ5L2NvcmUvc3JjL2ZtdC9udW0ucnMAL2hvbWUvd2F5bmV2YW5zb24vLmNhcmdvL3JlZ2lzdHJ5L3NyYy9pbmRleC5jcmF0ZXMuaW8tMTk0OWNmOGM2YjViNTU3Zi93YXNtLWJpbmRnZW4tMC4yLjEwOC9zcmMvZXh0ZXJucmVmLnJzAGxpYnJhcnkvYWxsb2Mvc3JjL3Jhd192ZWMvbW9kLnJzAC9ydXN0L2RlcHMvZGxtYWxsb2MtMC4yLjExL3NyYy9kbG1hbGxvYy5ycwBsaWJyYXJ5L3N0ZC9zcmMvYWxsb2MucnMAFW1lbW9yeSBhbGxvY2F0aW9uIG9mIMANIGJ5dGVzIGZhaWxlZAAAUwAQAGwAAAB/AAAAEQAAAFMAEABsAAAAjAAAABEAAAAMkRtBRc1DSn6J8happJYRbV3L1ixQ62N4QaZXcRuLuQwBEAAYAAAAcAEAAAkAAAADAAAADAAAAAQAAAAEAAAABQAAAAYAAAAHAAAAEAAAAAQAAAAIAAAACQAAAAoAAAALAAAAAAAAAAgAAAAEAAAADAAAAA0AAAAOAAAADwAAAAAAAAAIAAAABAAAABAAAABhc3NlcnRpb24gZmFpbGVkOiBwc2l6ZSA+PSBzaXplICsgbWluX292ZXJoZWFkAADhABAAKgAAALEEAAAJAAAAYXNzZXJ0aW9uIGZhaWxlZDogcHNpemUgPD0gc2l6ZSArIG1heF9vdmVyaGVhZAAA4QAQACoAAAC3BAAADQAAAAMAAAAMAAAABAAAABEAAABjYXBhY2l0eSBvdmVyZmxvdwAAAMAAEAAgAAAAHAAAAAUAAAAwMDAxMDIwMzA0MDUwNjA3MDgwOTEwMTExMjEzMTQxNTE2MTcxODE5MjAyMTIyMjMyNDI1MjYyNzI4MjkzMDMxMzIzMzM0MzUzNjM3MzgzOTQwNDE0MjQzNDQ0NTQ2NDc0ODQ5NTA1MTUyNTM1NDU1NTY1NzU4NTk2MDYxNjI2MzY0NjU2NjY3Njg2OTcwNzE3MjczNzQ3NTc2Nzc3ODc5ODA4MTgyODM4NDg1ODY4Nzg4ODk5MDkxOTI5Mzk0OTU5Njk3OTg5OTcAEAAbAAAAVwIAAAUAAABSZWZDZWxsIGFscmVhZHkgYm9ycm93ZWQAQaCHwAALGAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAABZBG5hbWUACQhsaWIud2FzbQEGAQEDYWRkBRgBABVfX3diaW5kZ2VuX2V4dGVybnJlZnMHEgEAD19fc3RhY2tfcG9pbnRlcgkRAgAHLnJvZGF0YQEFLmRhdGEAcAlwcm9kdWNlcnMCCGxhbmd1YWdlAQRSdXN0AAxwcm9jZXNzZWQtYnkDBXJ1c3RjHTEuOTMuMCAoMjU0YjU5NjA3IDIwMjYtMDEtMTkpBndhbHJ1cwYwLjI0LjQMd2FzbS1iaW5kZ2VuBzAuMi4xMDgAlAEPdGFyZ2V0X2ZlYXR1cmVzCCsLYnVsay1tZW1vcnkrD2J1bGstbWVtb3J5LW9wdCsWY2FsbC1pbmRpcmVjdC1vdmVybG9uZysKbXVsdGl2YWx1ZSsPbXV0YWJsZS1nbG9iYWxzKxNub250cmFwcGluZy1mcHRvaW50Kw9yZWZlcmVuY2UtdHlwZXMrCHNpZ24tZXh0", l = async (A = {}, t) => {
  let a;
  if (t.startsWith("data:")) {
    const e = t.replace(/^data:.*?base64,/, "");
    let n;
    if (typeof Buffer == "function" && typeof Buffer.from == "function")
      n = Buffer.from(e, "base64");
    else if (typeof atob == "function") {
      const s = atob(e);
      n = new Uint8Array(s.length);
      for (let c = 0; c < s.length; c++)
        n[c] = s.charCodeAt(c);
    } else
      throw new Error("Cannot decode base64-encoded data URL");
    a = await WebAssembly.instantiate(n, A);
  } else {
    const e = await fetch(t), n = e.headers.get("Content-Type") || "";
    if ("instantiateStreaming" in WebAssembly && n.startsWith("application/wasm"))
      a = await WebAssembly.instantiateStreaming(e, A);
    else {
      const s = await e.arrayBuffer();
      a = await WebAssembly.instantiate(s, A);
    }
  }
  return a.instance.exports;
};
function g(A, t) {
  return i.add(A, t);
}
function m() {
  const A = i.__wbindgen_externrefs, t = A.grow(4);
  A.set(0, void 0), A.set(t + 0, void 0), A.set(t + 1, null), A.set(t + 2, !0), A.set(t + 3, !1);
}
let i;
function o(A) {
  i = A;
}
URL = globalThis.URL;
const b = await l({ "./lib_bg.js": { __wbindgen_init_externref_table: m } }, d), r = b.memory, w = b.add, W = b.__wbindgen_externrefs, M = b.__wbindgen_start, Z = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  __wbindgen_externrefs: W,
  __wbindgen_start: M,
  add: w,
  memory: r
}, Symbol.toStringTag, { value: "Module" }));
o(Z);
M();
export {
  g as add
};
