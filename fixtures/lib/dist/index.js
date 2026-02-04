const d = "data:application/wasm;base64,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", M = async (A = {}, e) => {
  let a;
  if (e.startsWith("data:")) {
    const t = e.replace(/^data:.*?base64,/, "");
    let n;
    if (typeof Buffer == "function" && typeof Buffer.from == "function")
      n = Buffer.from(t, "base64");
    else if (typeof atob == "function") {
      const s = atob(t);
      n = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++)
        n[i] = s.charCodeAt(i);
    } else
      throw new Error("Cannot decode base64-encoded data URL");
    a = await WebAssembly.instantiate(n, A);
  } else {
    const t = await fetch(e), n = t.headers.get("Content-Type") || "";
    if ("instantiateStreaming" in WebAssembly && n.startsWith("application/wasm"))
      a = await WebAssembly.instantiateStreaming(t, A);
    else {
      const s = await t.arrayBuffer();
      a = await WebAssembly.instantiate(s, A);
    }
  }
  return a.instance.exports;
};
function m(A, e) {
  return b.add(A, e);
}
function y() {
  const A = b.__wbindgen_externrefs, e = A.grow(4);
  A.set(0, void 0), A.set(e + 0, void 0), A.set(e + 1, null), A.set(e + 2, !0), A.set(e + 3, !1);
}
let b;
function w(A) {
  b = A;
}
URL = globalThis.URL;
const c = await M({ "./bruv_bg.js": { __wbindgen_init_externref_table: y } }, d), r = c.memory, o = c.add, W = c.__wbindgen_externrefs, l = c.__wbindgen_start, Z = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  __wbindgen_externrefs: W,
  __wbindgen_start: l,
  add: o,
  memory: r
}, Symbol.toStringTag, { value: "Module" }));
w(Z);
l();
export {
  m as add
};
