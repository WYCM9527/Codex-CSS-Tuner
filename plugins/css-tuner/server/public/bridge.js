"use strict";
var __cssTunerBridge = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target2, all) => {
    for (var name in all)
      __defProp(target2, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key2 of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key2) && key2 !== except)
          __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    boot: () => boot
  });

  // src/annotate.ts
  function api() {
    return document.oai?.annotation;
  }
  function inView(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }
  function metadata(input) {
    if (!input) return void 0;
    const out2 = {};
    let n = 0;
    for (const [k, v] of Object.entries(input)) {
      if (n >= 6 || !/^[A-Za-z][A-Za-z0-9 _-]{0,63}$/.test(k)) continue;
      if (typeof v === "string") out2[k] = v.slice(0, 256);
      else if (typeof v === "number" ? Number.isFinite(v) : typeof v === "boolean" || v === null) out2[k] = v;
      else continue;
      n++;
    }
    return n && new TextEncoder().encode(JSON.stringify(out2)).length <= 2048 ? out2 : void 0;
  }
  function annotationAvailable() {
    return typeof api()?.request === "function";
  }
  function installAnnotate(target2) {
    const w = window;
    w.__CSS_TUNER_CAN_ANNOTATE__ = annotationAvailable;
    w.__CSS_TUNER_ANNOTATE__ = (req) => {
      const annotation = api();
      if (typeof annotation?.request !== "function") return { ok: false, reason: "unavailable" };
      try {
        const el = target2(Array.isArray(req.uids) ? req.uids.map(String) : []);
        const options = { initialComment: String(req.comment ?? "").slice(0, 240) };
        const meta = metadata(req.metadata);
        if (meta) options.metadata = meta;
        const res = annotation.request(el, options);
        return res?.accepted ? { ok: true } : { ok: false, reason: "declined" };
      } catch {
        return { ok: false, reason: "error" };
      }
    };
  }

  // ../protocol/src/props.ts
  var PROPS = [
    { prop: "display", section: "layout", kind: "keyword", keywords: ["block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "none"] },
    { prop: "flex-direction", section: "layout", kind: "keyword", keywords: ["row", "row-reverse", "column", "column-reverse"] },
    { prop: "flex-wrap", section: "layout", kind: "keyword", keywords: ["nowrap", "wrap", "wrap-reverse"] },
    { prop: "justify-content", section: "layout", kind: "keyword", keywords: ["normal", "flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly", "stretch"] },
    { prop: "align-items", section: "layout", kind: "keyword", keywords: ["normal", "stretch", "flex-start", "center", "flex-end", "baseline"] },
    { prop: "row-gap", section: "layout", kind: "length" },
    { prop: "column-gap", section: "layout", kind: "length" },
    { prop: "grid-template-columns", section: "layout", kind: "tracks" },
    { prop: "position", section: "position", kind: "keyword", keywords: ["static", "relative", "absolute", "fixed", "sticky"] },
    { prop: "top", section: "position", kind: "length" },
    { prop: "right", section: "position", kind: "length" },
    { prop: "bottom", section: "position", kind: "length" },
    { prop: "left", section: "position", kind: "length" },
    { prop: "z-index", section: "position", kind: "number" },
    { prop: "padding-top", section: "spacing", kind: "length" },
    { prop: "padding-right", section: "spacing", kind: "length" },
    { prop: "padding-bottom", section: "spacing", kind: "length" },
    { prop: "padding-left", section: "spacing", kind: "length" },
    { prop: "margin-top", section: "spacing", kind: "length" },
    { prop: "margin-right", section: "spacing", kind: "length" },
    { prop: "margin-bottom", section: "spacing", kind: "length" },
    { prop: "margin-left", section: "spacing", kind: "length" },
    { prop: "width", section: "size", kind: "length" },
    { prop: "height", section: "size", kind: "length" },
    { prop: "min-width", section: "size", kind: "length" },
    { prop: "max-width", section: "size", kind: "length" },
    { prop: "min-height", section: "size", kind: "length" },
    { prop: "max-height", section: "size", kind: "length" },
    { prop: "font-family", section: "typography", kind: "fontFamily", inherited: true },
    { prop: "font-size", section: "typography", kind: "length", inherited: true },
    { prop: "font-weight", section: "typography", kind: "fontWeight", inherited: true },
    { prop: "line-height", section: "typography", kind: "lineHeight", inherited: true },
    { prop: "letter-spacing", section: "typography", kind: "length", inherited: true },
    { prop: "text-align", section: "typography", kind: "keyword", inherited: true, keywords: ["start", "left", "center", "right", "justify"] },
    { prop: "color", section: "typography", kind: "color", inherited: true },
    { prop: "background-color", section: "fill", kind: "color" },
    { prop: "background-image", section: "fill", kind: "image" },
    // 渐变描边用两层背景叠出来：填充层裁到内边距，描边渐变铺到边框
    { prop: "background-clip", section: "fill", kind: "keyword", keywords: ["border-box", "padding-box", "content-box", "text"] },
    { prop: "background-origin", section: "fill", kind: "keyword", keywords: ["border-box", "padding-box", "content-box"] },
    ...["top", "right", "bottom", "left"].flatMap((side) => [
      { prop: `border-${side}-width`, section: "stroke", kind: "length" },
      { prop: `border-${side}-style`, section: "stroke", kind: "keyword", keywords: ["none", "solid", "dashed", "dotted", "double", "hidden"] },
      { prop: `border-${side}-color`, section: "stroke", kind: "color" }
    ]),
    { prop: "border-top-left-radius", section: "radius", kind: "length" },
    { prop: "border-top-right-radius", section: "radius", kind: "length" },
    { prop: "border-bottom-right-radius", section: "radius", kind: "length" },
    { prop: "border-bottom-left-radius", section: "radius", kind: "length" },
    { prop: "box-shadow", section: "effects", kind: "shadow" },
    { prop: "opacity", section: "effects", kind: "number" }
  ];
  var PROP_NAMES = PROPS.map((p) => p.prop);
  var META = new Map(PROPS.map((p) => [p.prop, p]));
  function propMeta(prop) {
    return META.get(prop);
  }
  var BORDER_WIDTH = ["border-top-width", "border-right-width", "border-bottom-width", "border-left-width"];
  var BORDER_STYLE = ["border-top-style", "border-right-style", "border-bottom-style", "border-left-style"];
  var BORDER_COLOR = ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"];
  var BORDER = [...BORDER_WIDTH, ...BORDER_STYLE, ...BORDER_COLOR];

  // ../protocol/src/values.ts
  var NUM_RE = /^(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/i;
  function parseCssNumber(value) {
    if (value == null) return null;
    const m = NUM_RE.exec(String(value).trim());
    if (!m) return null;
    return { num: parseFloat(m[1]), unit: m[2].toLowerCase() };
  }
  function toPx(value, remBase = 16, emBase = remBase) {
    const n = parseCssNumber(value);
    if (!n) return null;
    switch (n.unit) {
      case "px":
        return n.num;
      case "":
        return n.num === 0 ? 0 : null;
      case "rem":
        return n.num * remBase;
      case "em":
        return n.num * emBase;
      default:
        return null;
    }
  }
  function round(n, digits = 2) {
    const f = 10 ** digits;
    return Math.round(n * f) / f;
  }
  function formatNumber(n, digits = 2) {
    const r = round(n, digits);
    return Object.is(r, -0) ? "0" : String(r);
  }

  // ../protocol/src/color.ts
  var NAMED = {
    transparent: "#0000",
    black: "#000",
    white: "#fff",
    red: "#f00",
    green: "#008000",
    blue: "#00f",
    gray: "#808080",
    grey: "#808080",
    silver: "#c0c0c0",
    yellow: "#ff0",
    orange: "#ffa500",
    purple: "#800080",
    navy: "#000080",
    teal: "#008080"
  };
  var clamp01 = (n) => Math.min(1, Math.max(0, n));
  function toLinear(c) {
    const s = Math.sign(c) || 1;
    const x = Math.abs(c);
    return x <= 0.04045 ? c / 12.92 : s * ((x + 0.055) / 1.055) ** 2.4;
  }
  function fromLinear(c) {
    const s = Math.sign(c) || 1;
    const x = Math.abs(c);
    return x <= 31308e-7 ? c * 12.92 : s * (1.055 * x ** (1 / 2.4) - 0.055);
  }
  function oklabToRgb(L, a, b, alpha = 1) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;
    return {
      r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
      a: alpha
    };
  }
  function rgbToOklab(c) {
    const r = toLinear(c.r);
    const g = toLinear(c.g);
    const b = toLinear(c.b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    ];
  }
  function p3ToRgb(r, g, b, a) {
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    const x = 0.4865709486482162 * lr + 0.26566769316909306 * lg + 0.1982172852343625 * lb;
    const y = 0.2289745640697488 * lr + 0.6917385218365064 * lg + 0.079286914093745 * lb;
    const z = 0.04511338185890264 * lg + 1.043944368900976 * lb;
    return {
      r: fromLinear(3.2409699419045226 * x - 1.537383177570094 * y - 0.4986107602930034 * z),
      g: fromLinear(-0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z),
      b: fromLinear(0.05563007969699366 * x - 0.20397695888897652 * y + 1.0569715142428786 * z),
      a
    };
  }
  function parseHex(hex) {
    const h = hex.slice(1);
    if (!/^[0-9a-f]+$/i.test(h)) return null;
    const expand = h.length <= 4 ? h.split("").map((c) => c + c).join("") : h;
    if (expand.length !== 6 && expand.length !== 8) return null;
    const n = (i) => parseInt(expand.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: expand.length === 8 ? n(6) : 1 };
  }
  function splitArgs(body, legacyAlpha) {
    const [main, alpha] = body.split("/");
    const parts2 = main.replace(/,/g, " ").trim().split(/\s+/).filter(Boolean);
    if (legacyAlpha && alpha === void 0 && parts2.length === 4) return { parts: parts2.slice(0, 3), alpha: parts2[3] };
    return { parts: parts2, alpha: alpha === void 0 ? null : alpha.trim() };
  }
  function num(s, percentScale = 1) {
    if (s === "none") return 0;
    if (s.endsWith("%")) return parseFloat(s) / 100 * percentScale;
    return parseFloat(s);
  }
  function hue(s) {
    if (s === "none") return 0;
    const v = parseFloat(s);
    if (s.endsWith("rad")) return v * 180 / Math.PI;
    if (s.endsWith("grad")) return v * 0.9;
    if (s.endsWith("turn")) return v * 360;
    return v;
  }
  function alphaOf(s) {
    if (s == null) return 1;
    return clamp01(num(s, 1));
  }
  function hslToRgb(h, s, l, a) {
    const k = (n) => (n + h / 30) % 12;
    const f = (n) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return { r: f(0), g: f(8), b: f(4), a };
  }
  function parseColor(input) {
    if (!input) return null;
    const str = input.trim().toLowerCase();
    if (NAMED[str]) return parseHex(NAMED[str]);
    if (str.startsWith("#")) return parseHex(str);
    const m = /^([a-z-]+)\((.*)\)$/.exec(str);
    if (!m) return null;
    const fn = m[1];
    const { parts: parts2, alpha } = splitArgs(m[2], fn === "rgb" || fn === "rgba" || fn === "hsl" || fn === "hsla");
    const a = alphaOf(alpha);
    if (fn === "rgb" || fn === "rgba") {
      if (parts2.length < 3) return null;
      return { r: num(parts2[0], 255) / 255, g: num(parts2[1], 255) / 255, b: num(parts2[2], 255) / 255, a };
    }
    if (fn === "hsl" || fn === "hsla") {
      if (parts2.length < 3) return null;
      return hslToRgb(hue(parts2[0]), num(parts2[1], 100) / 100, num(parts2[2], 100) / 100, a);
    }
    if (fn === "oklch") {
      if (parts2.length < 3) return null;
      const L = num(parts2[0], 1);
      const C = num(parts2[1], 0.4);
      const H = hue(parts2[2]) * Math.PI / 180;
      return oklabToRgb(L, C * Math.cos(H), C * Math.sin(H), a);
    }
    if (fn === "oklab") {
      if (parts2.length < 3) return null;
      return oklabToRgb(num(parts2[0], 1), num(parts2[1], 0.4), num(parts2[2], 0.4), a);
    }
    if (fn === "color") {
      const [space, r, g, b] = parts2;
      if (b === void 0) return null;
      const rgb = [num(r, 1), num(g, 1), num(b, 1)];
      if (space === "srgb") return { r: rgb[0], g: rgb[1], b: rgb[2], a };
      if (space === "srgb-linear") return { r: fromLinear(rgb[0]), g: fromLinear(rgb[1]), b: fromLinear(rgb[2]), a };
      if (space === "display-p3") return p3ToRgb(rgb[0], rgb[1], rgb[2], a);
      return null;
    }
    return null;
  }
  var hex2 = (n) => Math.round(clamp01(n) * 255).toString(16).padStart(2, "0");
  function toHex(c) {
    const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
    return c.a >= 0.999 ? base : base + hex2(c.a);
  }
  function colorDistance(a, b) {
    const [l1, a1, b1] = rgbToOklab(a);
    const [l2, a2, b2] = rgbToOklab(b);
    return Math.hypot(l1 - l2, a1 - a2, b1 - b2) + Math.abs(a.a - b.a);
  }
  function sameColor(a, b, tolerance = 4e-3) {
    const ca = parseColor(a);
    const cb = parseColor(b);
    if (!ca || !cb) return a.trim() === b.trim();
    return colorDistance(ca, cb) < tolerance;
  }
  function overColor(top, under) {
    const a = top.a + under.a * (1 - top.a);
    if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (t2, u) => (t2 * top.a + u * under.a * (1 - top.a)) / a;
    return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a };
  }

  // ../protocol/src/selectors.ts
  function splitTopLevel(s, sep = ",") {
    const out2 = [];
    let depth = 0;
    let quote = null;
    let last = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "\\") {
        i++;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth--;
      else if (ch === sep && depth === 0) {
        out2.push(s.slice(last, i).trim());
        last = i + 1;
      }
    }
    out2.push(s.slice(last).trim());
    return out2.filter(Boolean);
  }
  function resolveNested(parent, sel) {
    if (!parent) return sel;
    return splitTopLevel(sel).map((part2) => part2.includes("&") ? part2.replace(/&/g, `:is(${parent})`) : `:is(${parent}) ${part2}`).join(", ");
  }

  // ../protocol/src/gradient.ts
  var FN = /^(repeating-)?(linear|radial|conic)-gradient\(([\s\S]*)\)$/i;
  var PRELUDE_WORD = /^(to|in|at|from|circle|ellipse|closest-side|closest-corner|farthest-side|farthest-corner)$/i;
  var ANGLE = /^(-?(?:\d+\.?\d*|\.\d+))(deg|grad|rad|turn)$/i;
  var COLOR_FN = /^(?:var|color-mix|light-dark|rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
  var PCT = /^(-?(?:\d+\.?\d*|\.\d+))%$/;
  var SIDE_ANGLE = { top: 0, right: 90, bottom: 180, left: 270 };
  function backgroundLayers(value) {
    const v = value.trim();
    if (!v || v === "none") return [];
    return splitTopLevel(v, ",").map((s) => s.trim()).filter(Boolean);
  }
  function isColorToken(tok) {
    if (COLOR_FN.test(tok) || tok.startsWith("#") || parseColor(tok)) return true;
    return /^[a-z]+$/i.test(tok) && !PRELUDE_WORD.test(tok);
  }
  function pctOf(tok) {
    if (tok === "0" || tok === "0px") return 0;
    const m = PCT.exec(tok);
    return m ? parseFloat(m[1]) : null;
  }
  var words = (s) => splitTopLevel(s.replace(/\s+/g, " ").trim(), " ").filter(Boolean);
  function parseGradient(layer) {
    const m = FN.exec(layer.trim());
    if (!m) return null;
    const args = splitTopLevel(m[3], ",").map((s) => s.replace(/\s+/g, " ").trim());
    if (!args.length) return null;
    let dir = "";
    let interp = "";
    const first = words(args[0]);
    if (first.length && !isColorToken(first[0])) {
      const pre = args.shift();
      const im = /(?:^|\s)in\s+([a-z-]+(?:\s+(?:shorter|longer|increasing|decreasing)\s+hue)?)/i.exec(pre);
      if (im) interp = im[1].toLowerCase();
      dir = (im ? pre.replace(im[0], " ") : pre).replace(/\s+/g, " ").trim();
    }
    const stops = [];
    for (const arg of args) {
      const w = words(arg);
      if (!w.length || w.length > 3 || !isColorToken(w[0])) return null;
      const pos = w.slice(1).map(pctOf);
      if (pos.some((p) => p === null)) return null;
      if (!pos.length) stops.push({ color: w[0], pos: null });
      for (const p of pos) stops.push({ color: w[0], pos: p });
    }
    if (stops.length < 2) return null;
    return { type: m[2].toLowerCase(), repeating: !!m[1], dir, interp, stops };
  }
  function stopPositions(stops) {
    const n = stops.length;
    const out2 = stops.map((s) => s.pos);
    if (!n) return [];
    if (out2[0] === null) out2[0] = 0;
    if (out2[n - 1] === null) out2[n - 1] = 100;
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = out2[i];
      if (p === null) continue;
      if (p < max) out2[i] = max;
      else max = p;
    }
    for (let i = 1; i < n; i++) {
      if (out2[i] !== null) continue;
      let j = i;
      while (out2[j] === null) j++;
      const a = out2[i - 1];
      const b = out2[j];
      for (let k = i; k < j; k++) out2[k] = a + (b - a) * (k - i + 1) / (j - i + 1);
      i = j;
    }
    return out2;
  }
  var toDeg = (n, unit) => {
    const u = unit.toLowerCase();
    return u === "turn" ? n * 360 : u === "rad" ? n * 180 / Math.PI : u === "grad" ? n * 0.9 : n;
  };
  function gradientAngle(g) {
    if (g.type !== "linear") return null;
    const d = g.dir.trim().toLowerCase().replace(/\s+/g, " ");
    if (!d) return 180;
    const a = ANGLE.exec(d);
    if (a) return toDeg(parseFloat(a[1]), a[2]);
    const m = /^to ([a-z]+)(?: ([a-z]+))?$/.exec(d);
    if (!m) return null;
    if (!m[2]) return SIDE_ANGLE[m[1]] ?? null;
    const set = /* @__PURE__ */ new Set([m[1], m[2]]);
    if (set.has("top") && set.has("right")) return 45;
    if (set.has("right") && set.has("bottom")) return 135;
    if (set.has("bottom") && set.has("left")) return 225;
    if (set.has("left") && set.has("top")) return 315;
    return null;
  }
  function dirKey(g) {
    const d = g.dir.trim().toLowerCase().replace(/\s+/g, " ");
    if (g.type === "linear") {
      const corner = /^to ([a-z]+) ([a-z]+)$/.exec(d);
      if (corner) return `to ${[corner[1], corner[2]].sort().join(" ")}`;
      const a = gradientAngle(g);
      return a === null ? d : String((Math.round(a * 1e3) / 1e3 % 360 + 360) % 360);
    }
    const defaults = g.type === "radial" ? /(^|\s)(ellipse|farthest-corner|at center( center)?|at 50% 50%)(?=\s|$)/g : /(^|\s)(from 0deg|at center( center)?|at 50% 50%)(?=\s|$)/g;
    return d.replace(defaults, " ").replace(/\s+/g, " ").trim();
  }
  function isLegacyColor(c) {
    const v = c.trim();
    return /^(?:#|rgba?\(|hsla?\(|hwb\(|var\()/i.test(v) || /^[a-z]+$/i.test(v);
  }
  function defaultInterp(stops) {
    return stops.every((s) => isLegacyColor(s.color)) ? "srgb" : "oklab";
  }
  function effectiveInterp(g) {
    if (!g.interp) return defaultInterp(g.stops);
    return g.interp.trim().toLowerCase().replace(/\s+/g, " ").replace(/ shorter hue$/, "");
  }
  function sameStopColor(a, b) {
    const ca = parseColor(a);
    const cb = parseColor(b);
    if (ca && cb) return ca.a === 0 && cb.a === 0 || sameColor(a, b);
    return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
  }
  function sameGradient(a, b) {
    if (a.type !== b.type || a.repeating !== b.repeating || a.stops.length !== b.stops.length) return false;
    if (dirKey(a) !== dirKey(b) || effectiveInterp(a) !== effectiveInterp(b)) return false;
    const pa = stopPositions(a.stops);
    const pb = stopPositions(b.stops);
    return a.stops.every((s, i) => Math.abs(pa[i] - pb[i]) <= 0.5 && sameStopColor(s.color, b.stops[i].color));
  }
  function sameBackgroundImage(a, b) {
    const la = backgroundLayers(a);
    const lb = backgroundLayers(b);
    if (la.length !== lb.length) return false;
    return la.every((x, i) => {
      const ga = parseGradient(x);
      const gb = parseGradient(lb[i]);
      if (ga && gb) return sameGradient(ga, gb);
      return x.replace(/\s+/g, " ") === lb[i].replace(/\s+/g, " ");
    });
  }

  // ../protocol/src/assets.ts
  function parseSrcset(srcset) {
    const out2 = [];
    const n = srcset.length;
    let i = 0;
    while (i < n) {
      while (i < n && /[\s,]/.test(srcset[i])) i++;
      if (i >= n) break;
      let j = i;
      while (j < n && !/\s/.test(srcset[j])) j++;
      let url = srcset.slice(i, j);
      let desc = "";
      if (url.endsWith(",")) {
        url = url.replace(/,+$/, "");
        i = j;
      } else {
        let k = j;
        let depth = 0;
        for (; k < n; k++) {
          const ch = srcset[k];
          if (ch === "(") depth++;
          else if (ch === ")") depth = Math.max(0, depth - 1);
          else if (ch === "," && depth === 0) break;
        }
        desc = srcset.slice(j, k);
        i = k + 1;
      }
      if (!url) continue;
      const c = { url };
      for (const d of desc.trim().split(/\s+/)) {
        const m = /^(\d+(?:\.\d+)?)([wx])$/i.exec(d);
        if (!m) continue;
        if (m[2].toLowerCase() === "w") c.w = Number(m[1]);
        else c.x = Number(m[1]);
      }
      out2.push(c);
    }
    return out2;
  }
  function largestCandidate(list) {
    if (!list.length) return null;
    const byW = list.filter((c) => c.w !== void 0);
    if (byW.length) return byW.reduce((a, b) => b.w > a.w ? b : a);
    return list.reduce((a, b) => (b.x ?? 1) > (a.x ?? 1) ? b : a);
  }
  function closeParen(s, open) {
    let depth = 0;
    let quote = "";
    for (let i = open; i < s.length; i++) {
      const ch = s[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")" && --depth === 0) return i;
    }
    return s.length;
  }
  function unquote(s) {
    const t2 = s.trim();
    if (t2.startsWith('"') && t2.endsWith('"') || t2.startsWith("'") && t2.endsWith("'")) return t2.slice(1, -1).replace(/\\(.)/g, "$1");
    return t2;
  }
  function splitTop(s) {
    const out2 = [];
    let depth = 0;
    let quote = "";
    let start = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        out2.push(s.slice(start, i));
        start = i + 1;
      }
    }
    out2.push(s.slice(start));
    return out2.map((x) => x.trim()).filter(Boolean);
  }
  var RES_UNITS = { x: 1, dppx: 1, dpi: 1 / 96, dpcm: 2.54 / 96 };
  function setEntry(s) {
    let url = null;
    let rest = s;
    const u = /^url\(/i.exec(s);
    if (u) {
      const end = closeParen(s, 3);
      url = unquote(s.slice(4, end));
      rest = s.slice(end + 1);
    } else if (s.startsWith('"') || s.startsWith("'")) {
      const q = s[0];
      let end = 1;
      while (end < s.length && s[end] !== q) end += s[end] === "\\" ? 2 : 1;
      url = unquote(s.slice(0, end + 1));
      rest = s.slice(end + 1);
    }
    if (!url) return null;
    const m = /(\d+(?:\.\d+)?)(x|dppx|dpi|dpcm)\b/i.exec(rest.replace(/type\([^)]*\)/gi, ""));
    return { url, x: m ? Number(m[1]) * RES_UNITS[m[2].toLowerCase()] : 1 };
  }
  function cssImageUrls(value) {
    const out2 = [];
    if (!value || value === "none") return out2;
    let i = 0;
    while (i < value.length) {
      const rest = value.slice(i, i + 20);
      const set = /^(-webkit-)?image-set\(/i.exec(rest);
      if (set) {
        const open = i + set[0].length - 1;
        const end = closeParen(value, open);
        const best = largestCandidate(splitTop(value.slice(open + 1, end)).map(setEntry).filter((c) => !!c));
        if (best) out2.push(best.url);
        i = end + 1;
        continue;
      }
      if (/^url\(/i.test(rest) && (i === 0 || !/[\w-]/.test(value[i - 1]))) {
        const end = closeParen(value, i + 3);
        const url = unquote(value.slice(i + 4, end));
        if (url) out2.push(url);
        i = end + 1;
        continue;
      }
      i++;
    }
    return out2;
  }
  function unwrapOptimizer(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (!/^https?:$/.test(u.protocol)) return null;
    const resolve = (inner) => {
      if (!inner) return null;
      try {
        return new URL(inner, u.origin).href;
      } catch {
        return null;
      }
    };
    if (/\/_(next|vercel)\/image\/?$/.test(u.pathname)) return resolve(u.searchParams.get("url"));
    if (/\/_image\/?$/.test(u.pathname) && u.searchParams.has("href")) return resolve(u.searchParams.get("href"));
    const ipx = /\/_ipx\/[^/]+\/(.+)$/.exec(u.pathname);
    if (ipx) {
      const path = decodeURIComponent(ipx[1]);
      return resolve(/^https?:\/\//.test(path) ? path : `/${path}`);
    }
    return null;
  }
  var MIME_EXT = {
    "image/png": "png",
    "image/apng": "apng",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/pjpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "image/heic": "heic",
    "image/jxl": "jxl",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/ogg": "ogv",
    "video/quicktime": "mov",
    "video/x-matroska": "mkv",
    "video/mp2t": "ts"
  };
  var KNOWN_EXT = /* @__PURE__ */ new Set([...Object.values(MIME_EXT), "jpeg", "jfif", "tif", "svgz", "m4v", "ogg", "avi"]);
  function extForMime(mime) {
    if (!mime) return null;
    return MIME_EXT[mime.split(";")[0].trim().toLowerCase()] ?? null;
  }
  function sanitizeFileName(s) {
    const clean2 = s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim().replace(/^[.\s-]+|[.\s]+$/g, "");
    if (clean2.length <= 120) return clean2;
    const dot = clean2.lastIndexOf(".");
    const ext = dot > 0 && clean2.length - dot <= 6 ? clean2.slice(dot) : "";
    return clean2.slice(0, 120 - ext.length) + ext;
  }
  function fileNameOf(url) {
    if (/^(data|blob):/i.test(url)) return "";
    let path = url;
    try {
      path = new URL(url).pathname;
    } catch {
      path = url.split(/[?#]/)[0];
    }
    const last = path.split("/").pop() ?? "";
    let name = last;
    try {
      name = decodeURIComponent(last);
    } catch {
    }
    return sanitizeFileName(name);
  }
  function dataUrlMime(url) {
    const m = /^data:([^;,]*)/i.exec(url);
    return m ? m[1].toLowerCase() || "text/plain" : null;
  }

  // ../protocol/src/cssprops.ts
  var ALIASES = {
    "padding-top": ["padding-top", "padding-block-start"],
    "padding-bottom": ["padding-bottom", "padding-block-end"],
    "padding-left": ["padding-left", "padding-inline-start"],
    "padding-right": ["padding-right", "padding-inline-end"],
    "margin-top": ["margin-top", "margin-block-start"],
    "margin-bottom": ["margin-bottom", "margin-block-end"],
    "margin-left": ["margin-left", "margin-inline-start"],
    "margin-right": ["margin-right", "margin-inline-end"],
    top: ["top", "inset-block-start"],
    bottom: ["bottom", "inset-block-end"],
    left: ["left", "inset-inline-start"],
    right: ["right", "inset-inline-end"],
    width: ["width", "inline-size"],
    height: ["height", "block-size"],
    "min-width": ["min-width", "min-inline-size"],
    "max-width": ["max-width", "max-inline-size"],
    "min-height": ["min-height", "min-block-size"],
    "max-height": ["max-height", "max-block-size"],
    "border-top-left-radius": ["border-top-left-radius", "border-start-start-radius"],
    "border-top-right-radius": ["border-top-right-radius", "border-start-end-radius"],
    "border-bottom-right-radius": ["border-bottom-right-radius", "border-end-end-radius"],
    "border-bottom-left-radius": ["border-bottom-left-radius", "border-end-start-radius"]
  };
  var SHORTHANDS = {
    "padding-top": ["padding", "padding-block"],
    "padding-block-start": ["padding-block", "padding"],
    "padding-bottom": ["padding", "padding-block"],
    "padding-block-end": ["padding-block", "padding"],
    "padding-left": ["padding", "padding-inline"],
    "padding-inline-start": ["padding-inline", "padding"],
    "padding-right": ["padding", "padding-inline"],
    "padding-inline-end": ["padding-inline", "padding"],
    "margin-top": ["margin", "margin-block"],
    "margin-block-start": ["margin-block", "margin"],
    "margin-bottom": ["margin", "margin-block"],
    "margin-block-end": ["margin-block", "margin"],
    "margin-left": ["margin", "margin-inline"],
    "margin-inline-start": ["margin-inline", "margin"],
    "margin-right": ["margin", "margin-inline"],
    "margin-inline-end": ["margin-inline", "margin"],
    top: ["inset", "inset-block"],
    bottom: ["inset", "inset-block"],
    left: ["inset", "inset-inline"],
    right: ["inset", "inset-inline"],
    "inset-block-start": ["inset-block", "inset"],
    "inset-block-end": ["inset-block", "inset"],
    "inset-inline-start": ["inset-inline", "inset"],
    "inset-inline-end": ["inset-inline", "inset"],
    "border-top-left-radius": ["border-radius"],
    "border-top-right-radius": ["border-radius"],
    "border-bottom-right-radius": ["border-radius"],
    "border-bottom-left-radius": ["border-radius"],
    "border-start-start-radius": ["border-radius"],
    "border-start-end-radius": ["border-radius"],
    "border-end-end-radius": ["border-radius"],
    "border-end-start-radius": ["border-radius"],
    "row-gap": ["gap"],
    "column-gap": ["gap"],
    "font-family": ["font"],
    "font-size": ["font"],
    "font-weight": ["font"],
    "line-height": ["font"],
    "background-color": ["background"],
    "background-image": ["background"],
    "background-clip": ["background"],
    "background-origin": ["background"],
    "flex-direction": ["flex-flow"],
    "flex-wrap": ["flex-flow"],
    "justify-content": ["place-content"],
    "align-items": ["place-items"],
    "grid-template-columns": ["grid-template", "grid"]
  };
  var BORDER_SIDES = { top: "block-start", right: "inline-end", bottom: "block-end", left: "inline-start" };
  for (const [side, logical] of Object.entries(BORDER_SIDES)) {
    const axis = logical.split("-")[0];
    for (const part2 of ["width", "style", "color"]) {
      const phys = `border-${side}-${part2}`;
      const log = `border-${logical}-${part2}`;
      ALIASES[phys] = [phys, log];
      SHORTHANDS[phys] = [`border-${side}`, `border-${part2}`, "border"];
      SHORTHANDS[log] = [`border-${logical}`, `border-${axis}-${part2}`, `border-${axis}`];
    }
  }
  function aliasesOf(prop) {
    return ALIASES[prop] ?? [prop];
  }
  function shorthandsOf(prop) {
    return SHORTHANDS[prop] ?? [];
  }
  var BOX_SHORTHANDS = {
    padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
    margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
    inset: ["top", "right", "bottom", "left"],
    "border-radius": ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"],
    "padding-inline": ["padding-left", "padding-right"],
    "padding-block": ["padding-top", "padding-bottom"],
    "margin-inline": ["margin-left", "margin-right"],
    "margin-block": ["margin-top", "margin-bottom"],
    "inset-inline": ["left", "right"],
    "inset-block": ["top", "bottom"],
    gap: ["row-gap", "column-gap"],
    ...Object.fromEntries(
      ["width", "style", "color"].flatMap((part2) => [
        [`border-${part2}`, ["top", "right", "bottom", "left"].map((s) => `border-${s}-${part2}`)],
        [`border-inline-${part2}`, [`border-left-${part2}`, `border-right-${part2}`]],
        [`border-block-${part2}`, [`border-top-${part2}`, `border-bottom-${part2}`]]
      ])
    )
  };

  // ../protocol/src/fonts.ts
  var GENERIC_FAMILIES = ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong"];
  var GENERIC = new Set(GENERIC_FAMILIES);
  function unquote2(s) {
    const m = /^(["'])([\s\S]*)\1$/.exec(s.trim());
    return m ? m[2].replace(/\\(.)/g, "$1") : s.trim().replace(/\s+/g, " ");
  }
  function fontFamilies(stack) {
    return splitTopLevel(stack, ",").map(unquote2).filter(Boolean);
  }
  function primaryFamily(stack) {
    return fontFamilies(stack)[0] ?? "";
  }
  function sameFontFamily(a, b) {
    return primaryFamily(a).toLowerCase() === primaryFamily(b).toLowerCase();
  }

  // ../protocol/src/compare.ts
  var COLOR_IN_LAYER = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[\da-f]{3,8}\b|\btransparent\b/i;
  function visibleShadows(v) {
    const layers = splitTopLevel(v, ",").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => {
      if (!l || l === "none") return false;
      const color = COLOR_IN_LAYER.exec(l)?.[0];
      return !color || parseColor(color)?.a !== 0;
    });
    return layers.join(", ") || "none";
  }
  var LAYER_LISTS = /* @__PURE__ */ new Set(["background-clip", "background-origin"]);
  function sameLayerList(a, b) {
    const la = splitTopLevel(a, ",").map((s) => s.trim());
    const lb = splitTopLevel(b, ",").map((s) => s.trim());
    const n = Math.max(la.length, lb.length);
    for (let i = 0; i < n; i++) if (la[i % la.length] !== lb[i % lb.length]) return false;
    return true;
  }
  function sameValue(prop, a, b) {
    if (a === b) return true;
    if (prop === "font-family") return sameFontFamily(a, b);
    if (prop === "box-shadow" || prop === "text-shadow") return visibleShadows(a) === visibleShadows(b);
    if (prop === "background-image") return sameBackgroundImage(a, b);
    if (LAYER_LISTS.has(prop)) return sameLayerList(a, b);
    const kind = propMeta(prop)?.kind;
    if (kind === "color" || parseColor(a) && parseColor(b)) return sameColor(a, b);
    const pa = toPx(a);
    const pb = toPx(b);
    if (pa != null && pb != null) return Math.abs(pa - pb) <= 0.5;
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && String(na) === a.trim() && String(nb) === b.trim()) return Math.abs(na - nb) < 0.01;
    return a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
  }

  // src/next.ts
  var SERVER_URL = /^(?:about|rsc):\/\/React\/[^/]+\/(.+?)(?:\?\d+)?$/;
  function decodeOnce(s) {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }
  function decodeAll(s) {
    for (let i = 0; i < 4; i++) {
      const next = decodeOnce(s);
      if (next === s) break;
      s = next;
    }
    return s;
  }
  function serverModuleUrl(url) {
    const s = SERVER_URL.exec(url);
    if (!s) return null;
    return s[1].includes("%25") ? decodeOnce(s[1]) : s[1];
  }
  function distDirOf(url) {
    const m = SERVER_URL.exec(url);
    const d = m && /^file:\/\/(.+?)\/server\/(?:chunks|app|pages)\//.exec(m[1]);
    if (!d) return null;
    const p = decodeAll(d[1]);
    return /^\/[A-Za-z]:\//.test(p) ? p.slice(1) : p;
  }
  function clientModuleUrl(url, dist) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    const m = /\/_next(\/static\/.+)$/.exec(u.pathname);
    if (!m) return null;
    return `file://${dist.startsWith("/") ? "" : "/"}${dist}${m[1]}${u.search}`;
  }
  function isWebpackModule(url) {
    return url.startsWith("webpack-internal:///") && !url.includes("/node_modules/");
  }
  function webpackCssSources(css) {
    const out2 = /* @__PURE__ */ new Set();
    for (const m of css.matchAll(/!\*{3} css (.+?) \*{3}!/g)) {
      const file = m[1].slice(m[1].lastIndexOf("!") + 1).split("?")[0];
      if (/\.css$/i.test(file) && !file.includes("/node_modules/")) out2.add(file);
    }
    return [...out2];
  }
  function projectRootOf(dist) {
    const std = /^(.*)\/\.next(?:\/dev)?$/.exec(dist);
    if (std) return std[1];
    const parts2 = dist.split("/");
    return parts2.slice(0, parts2.length - (parts2[parts2.length - 1] === "dev" ? 2 : 1)).join("/");
  }
  function joinPath(root2, rel) {
    const out2 = root2.split("/");
    for (const seg of rel.split("/")) {
      if (seg === "..") out2.pop();
      else if (seg && seg !== ".") out2.push(seg);
    }
    return out2.join("/");
  }

  // src/sourcemap.ts
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var B64MAP = {};
  for (let i = 0; i < B64.length; i++) B64MAP[B64[i]] = i;
  function decodeMappings(mappings) {
    const lines = [];
    let srcIdx = 0;
    let srcLine = 0;
    let srcCol = 0;
    for (const lineStr of mappings.split(";")) {
      const segs = [];
      let genCol = 0;
      if (lineStr) {
        for (const segStr of lineStr.split(",")) {
          if (!segStr) continue;
          const vals = [];
          let value = 0;
          let shift2 = 0;
          for (let i = 0; i < segStr.length; i++) {
            const digit = B64MAP[segStr[i]];
            value += (digit & 31) << shift2;
            if (digit & 32) shift2 += 5;
            else {
              const neg = value & 1;
              value >>>= 1;
              vals.push(neg ? -value : value);
              value = 0;
              shift2 = 0;
            }
          }
          genCol += vals[0];
          if (vals.length >= 4) {
            srcIdx += vals[1];
            srcLine += vals[2];
            srcCol += vals[3];
            segs.push([genCol, srcIdx, srcLine, srcCol]);
          } else segs.push([genCol]);
        }
      }
      lines.push(segs);
    }
    return lines;
  }
  var isIndexMap = (m) => Array.isArray(m.sections);
  var decodedOf = /* @__PURE__ */ new WeakMap();
  function originalPosition(map, line2, col) {
    if (isIndexMap(map)) {
      const l0 = line2 - 1;
      const c0 = col - 1;
      let hit = null;
      for (const s of map.sections) {
        if (s.offset.line < l0 || s.offset.line === l0 && s.offset.column <= c0) hit = s;
        else break;
      }
      if (!hit) return null;
      const dl = l0 - hit.offset.line;
      return originalPosition(hit.map, dl + 1, (dl === 0 ? c0 - hit.offset.column : c0) + 1);
    }
    let decoded = decodedOf.get(map);
    if (!decoded) {
      decoded = decodeMappings(map.mappings);
      decodedOf.set(map, decoded);
    }
    const seg = segmentAt(decoded, line2, col);
    if (!seg) return null;
    const ignore = map.ignoreList ?? map.x_google_ignoreList ?? [];
    return { source: (map.sourceRoot ?? "") + map.sources[seg[1]], line: seg[2] + 1, column: seg[3] + 1, ignored: ignore.includes(seg[1]) };
  }
  function sourcesOf(map) {
    if (isIndexMap(map)) return map.sections.flatMap((s) => sourcesOf(s.map));
    return map.sources.map((s) => (map.sourceRoot ?? "") + s);
  }
  function segmentAt(decoded, line2, col) {
    const segs = decoded[line2 - 1];
    if (!segs || !segs.length) return null;
    const col0 = col - 1;
    let best = null;
    for (const s of segs) {
      if (s[0] <= col0) {
        if (s.length >= 4) best = s;
      } else break;
    }
    return best;
  }
  var SOURCE_OBJ = /\{\s*fileName:\s*("(?:[^"\\]|\\.)*"|[\w$]+),\s*lineNumber:\s*(\d+),\s*columnNumber:\s*(\d+)\s*\}/g;
  function jsxLineShift(code, map, fileName) {
    const counts2 = /* @__PURE__ */ new Map();
    let total = 0;
    let line2 = 1;
    let lineStart = 0;
    let at = 0;
    for (const m of code.matchAll(SOURCE_OBJ)) {
      for (; at < m.index; at++) {
        if (code.charCodeAt(at) === 10) {
          line2++;
          lineStart = at + 1;
        }
      }
      if (m[1].startsWith('"') && JSON.parse(m[1]) !== fileName) continue;
      const pos = originalPosition(map, line2, m.index - lineStart + 1);
      if (!pos) continue;
      const d = Number(m[2]) - pos.line;
      counts2.set(d, (counts2.get(d) ?? 0) + 1);
      total++;
    }
    let shift2 = 0;
    let most = 0;
    for (const [d, c] of counts2) {
      if (c > most) {
        shift2 = d;
        most = c;
      }
    }
    return shift2 > 0 && most >= total * 0.6 ? shift2 : 0;
  }
  var SOURCE_MAPPING_RE = /\/\/[#@] sourceMappingURL=(\S+)\s*$/;
  var CSS_SOURCE_MAPPING_RE = /\/\*[#@] sourceMappingURL=(\S+?)\s*\*\/\s*$/;
  function extractMapUrl(code) {
    const m = SOURCE_MAPPING_RE.exec(code) ?? CSS_SOURCE_MAPPING_RE.exec(code);
    return m ? m[1] : null;
  }
  function filePathOf(source) {
    if (!source.startsWith("file://")) return null;
    try {
      const p = decodeURIComponent(new URL(source).pathname);
      return /^\/[A-Za-z]:\//.test(p) ? p.slice(1) : p;
    } catch {
      return null;
    }
  }
  function decodeDataUrl(url) {
    const b64 = url.slice(url.indexOf(",") + 1);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // src/util.ts
  var OWN_ATTR = "data-css-tuner";
  var byEl = /* @__PURE__ */ new WeakMap();
  var byId = /* @__PURE__ */ new Map();
  var seq = 0;
  var DOC = Math.random().toString(36).slice(2, 6);
  function uidOf(el) {
    let u = byEl.get(el);
    if (!u) {
      u = `${DOC}${(++seq).toString(36)}`;
      byEl.set(el, u);
      byId.set(u, new WeakRef(el));
    }
    return u;
  }
  function elOf(uid) {
    const el = byId.get(uid)?.deref();
    return el && el.isConnected ? el : null;
  }
  function isOwnNode(node) {
    if (!node) return false;
    if (node instanceof Element && node.hasAttribute(OWN_ATTR)) return true;
    const root2 = node.getRootNode();
    return root2 instanceof ShadowRoot && root2.host.hasAttribute(OWN_ATTR);
  }
  function isOwnSheet(sheet) {
    return isOwnNode(sheet.ownerNode);
  }
  function stripQuery(url) {
    const q = url.indexOf("?");
    return q < 0 ? url : url.slice(0, q);
  }
  var linkSources = /* @__PURE__ */ new Map();
  function sheetDevId(sheet) {
    const owner = sheet.ownerNode;
    const vite = owner && typeof owner.getAttribute === "function" ? owner.getAttribute("data-vite-dev-id") : null;
    if (vite) return vite;
    return sheet.href ? linkSources.get(stripQuery(sheet.href)) ?? null : null;
  }
  async function loadSheetSources() {
    const hrefs = Array.from(document.styleSheets).map((s) => s.href).filter((h) => !!h && h.startsWith(location.origin) && !linkSources.has(stripQuery(h)));
    let learned = false;
    await Promise.all(
      hrefs.map(async (href) => {
        const key2 = stripQuery(href);
        linkSources.set(key2, null);
        try {
          const text = await (await fetch(href)).text();
          const ref = extractMapUrl(text);
          if (!ref) {
            const files2 = webpackCssSources(text);
            if (files2.length === 1) {
              linkSources.set(key2, files2[0].replace(/^\.\//, "/"));
              learned = true;
            }
            return;
          }
          const json = ref.startsWith("data:") ? decodeDataUrl(ref) : await (await fetch(new URL(ref, href))).text();
          const files = [...new Set(sourcesOf(JSON.parse(json)).map(filePathOf))];
          if (files.length === 1 && files[0] && /\.css$/i.test(files[0])) {
            linkSources.set(key2, files[0]);
            learned = true;
          }
        } catch {
        }
      })
    );
    return learned;
  }
  var twCache = /* @__PURE__ */ new WeakMap();
  function isTailwindSheet(sheet) {
    let v = twCache.get(sheet);
    if (v !== void 0) return v;
    const owner = sheet.ownerNode;
    const text = owner && owner.textContent ? owner.textContent.slice(0, 300) : "";
    v = text.includes("tailwindcss v");
    if (!v) {
      try {
        const names = /* @__PURE__ */ new Set();
        let twVars = false;
        const rules = sheet.cssRules;
        for (let i = 0; i < Math.min(rules.length, 12); i++) {
          const r = rules[i];
          if (typeof CSSLayerStatementRule === "function" && r instanceof CSSLayerStatementRule) r.nameList.forEach((n) => names.add(n));
          else if (typeof CSSLayerBlockRule === "function" && r instanceof CSSLayerBlockRule) names.add(r.name);
          else if (r instanceof CSSStyleRule && /^(\*|::before|::after|::backdrop)/.test(r.selectorText)) {
            for (let j = 0; j < r.style.length; j++) if (r.style[j].startsWith("--tw-")) twVars = true;
          }
        }
        v = names.has("theme") && names.has("utilities") || names.size === 0 && twVars;
      } catch {
        v = false;
      }
    }
    twCache.set(sheet, v);
    return v;
  }
  function labelOf(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = Array.from(el.classList).slice(0, 2);
    for (const c of cls) s += `.${c.length > 24 ? c.slice(0, 23) + "\u2026" : c}`;
    if (el.classList.length > 2) s += "\u2026";
    return s;
  }
  var WHOLE_TEXT = /* @__PURE__ */ new Set(["A", "BUTTON", "LABEL", "H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "TD", "TH", "DT", "DD", "SUMMARY", "FIGCAPTION", "LEGEND", "OPTION", "CAPTION"]);
  var TEXT_NODE = 3;
  function textOf(el) {
    let s = "";
    if (WHOLE_TEXT.has(el.tagName)) s = el.textContent ?? "";
    else for (const n of Array.from(el.childNodes)) if (n.nodeType === TEXT_NODE) s += n.textContent ?? "";
    if (!s.trim()) s = el.getAttribute("alt") || el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || "";
    return clip(s, 30);
  }
  function clip(s, max) {
    const one = s.replace(/\s+/g, " ").trim();
    return one.length > max ? `${one.slice(0, max - 1)}\u2026` : one;
  }
  function unescapeIdent(s) {
    return s.replace(/\\([0-9a-fA-F]{1,6}\s?|[\s\S])/g, (_, esc) => {
      if (/^[0-9a-fA-F]/.test(esc) && esc.trim().length > 0 && /^[0-9a-fA-F]+\s?$/.test(esc)) {
        return String.fromCodePoint(parseInt(esc.trim(), 16));
      }
      return esc;
    });
  }
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // src/assets.ts
  var OPEN = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
  var SKIP = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "HEAD", "IFRAME", "FRAME", "CANVAS", "AUDIO", "OBJECT", "EMBED", "LINK", "META", "SOURCE", "TRACK"]);
  var LAZY_SRC = ["data-src", "data-lazy-src", "data-original", "data-lazy"];
  var LAZY_SET = ["data-srcset", "data-lazy-srcset"];
  var MAX_BLOB = 22 * 1024 * 1024;
  var MAX_ITEMS = 300;
  function abs(u) {
    if (!u) return null;
    try {
      return new URL(u, document.baseURI).href;
    } catch {
      return null;
    }
  }
  function resolveSet(srcset) {
    return parseSrcset(srcset).map((c) => ({ ...c, url: abs(c.url) ?? c.url }));
  }
  function nameFor(url, kind) {
    const fromUrl = url ? fileNameOf(url) : "";
    if (fromUrl) return fromUrl;
    const ext = url?.startsWith("data:") ? extForMime(dataUrlMime(url)) : null;
    return ext ? `${kind}.${ext}` : kind;
  }
  function isPlaceholder(img, shown2) {
    return !shown2 || shown2.startsWith("data:") && shown2.length < 4096 || img.complete && img.naturalWidth <= 2;
  }
  function imageHit(img) {
    let shown2 = img.currentSrc || img.src || "";
    const sets = [];
    const pic = img.parentElement?.tagName === "PICTURE" ? img.parentElement : null;
    if (pic) for (const s of Array.from(pic.querySelectorAll(":scope > source[srcset]"))) sets.push(resolveSet(s.getAttribute("srcset") ?? ""));
    const own2 = img.getAttribute("srcset");
    if (own2) sets.push(resolveSet(own2));
    let set = sets.find((c) => c.some((x) => x.url === shown2)) ?? (own2 ? sets[sets.length - 1] : null);
    if (isPlaceholder(img, shown2)) {
      const lazySet = LAZY_SET.map((a) => img.getAttribute(a)).find(Boolean);
      const lazySrc = abs(LAZY_SRC.map((a) => img.getAttribute(a)).find(Boolean));
      if (lazySet) set = resolveSet(lazySet);
      else if (lazySrc) set = null;
      if (lazySet || lazySrc) shown2 = lazySrc ?? largestCandidate(set ?? [])?.url ?? shown2;
    }
    const pick2 = set ? largestCandidate(set) : null;
    const best = pick2?.url ?? shown2;
    if (!best) return null;
    const url = unwrapOptimizer(best) ?? best;
    return { kind: "image", url, shown: shown2 || null, name: nameFor(url, "image"), el: img, pick: pick2 ?? void 0, shownPick: set?.find((c) => c.url === shown2) };
  }
  function videoHits(v) {
    const out2 = [];
    const src = v.currentSrc || v.src || abs(v.querySelector("source[src]")?.getAttribute("src")) || "";
    if (v.srcObject || src) {
      const streaming = !!v.srcObject || /\.(m3u8|mpd)(?:[?#]|$)/i.test(src);
      out2.push({ kind: "video", url: src || null, shown: src || null, name: nameFor(src || null, "video"), el: v, streaming: streaming || void 0 });
    }
    const poster = abs(v.getAttribute("poster"));
    if (poster) {
      const url = unwrapOptimizer(poster) ?? poster;
      out2.push({ kind: "poster", url, shown: poster, name: nameFor(url, "poster"), el: v });
    }
    return out2;
  }
  function cssHits(el, cs) {
    const urls = cssImageUrls(cs.backgroundImage);
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === "none" || ps.content === "normal" || ps.display === "none") continue;
      urls.push(...cssImageUrls(ps.backgroundImage), ...cssImageUrls(ps.content));
    }
    return urls.map((u) => {
      const shown2 = abs(u) ?? u;
      const url = unwrapOptimizer(shown2) ?? shown2;
      return { kind: "background", url, shown: shown2, name: nameFor(url, "background"), el };
    });
  }
  var ICON_CLASS = /^(?:lucide|fa|bi|ri|ti|mdi|heroicons?|icon|iconify|ph)-[\w-]+$/i;
  function svgNameOf(svg) {
    const use = svg.querySelector("use");
    const ref = use?.getAttribute("href") ?? use?.getAttribute("xlink:href") ?? "";
    const candidates = [
      svg.getAttribute("aria-label"),
      svg.querySelector(":scope > title")?.textContent,
      svg.getAttribute("title"),
      svg.getAttribute("data-icon"),
      ref.includes("#") ? ref.slice(ref.indexOf("#") + 1) : null,
      svg.id,
      Array.from(svg.classList).find((c) => ICON_CLASS.test(c) && !/^fa-(solid|regular|light|thin|duotone|brands|fw|lg|xl|\dx)$/.test(c))
    ];
    for (const c of candidates) {
      const name = c ? sanitizeFileName(c) : "";
      if (name) return `${name}.svg`;
    }
    const r = svg.getBoundingClientRect();
    return Math.max(r.width, r.height) <= 64 ? "icon.svg" : "illustration.svg";
  }
  function svgRoot(el) {
    if (!(el instanceof SVGElement)) return null;
    let s = el instanceof SVGSVGElement ? el : el.ownerSVGElement;
    while (s?.ownerSVGElement) s = s.ownerSVGElement;
    return s;
  }
  function parentOf(el) {
    return el.parentElement ?? (el.parentNode instanceof ShadowRoot ? el.parentNode.host : null);
  }
  var clips = (v) => v === "hidden" || v === "clip";
  var scrolls = (v) => v === "auto" || v === "scroll";
  function childClip(el, cs, r, clip2) {
    if (el === document.documentElement || el === document.body) return clip2;
    const ox = cs.overflowX;
    const oy = cs.overflowY;
    if (ox === "visible" && oy === "visible") return clip2;
    const n = (v) => parseFloat(v) || 0;
    const left = r.left + n(cs.borderLeftWidth);
    const right = r.right - n(cs.borderRightWidth);
    const top = r.top + n(cs.borderTopWidth);
    const bottom = r.bottom - n(cs.borderBottomWidth);
    return {
      left: scrolls(ox) ? -Infinity : clips(ox) ? Math.max(clip2.left, left) : clip2.left,
      right: scrolls(ox) ? Infinity : clips(ox) ? Math.min(clip2.right, right) : clip2.right,
      top: scrolls(oy) ? -Infinity : clips(oy) ? Math.max(clip2.top, top) : clip2.top,
      bottom: scrolls(oy) ? Infinity : clips(oy) ? Math.min(clip2.bottom, bottom) : clip2.bottom
    };
  }
  function initialClip(root2) {
    const chain2 = [];
    for (let p = parentOf(root2); p && p !== document.documentElement; p = parentOf(p)) chain2.unshift(p);
    let clip2 = OPEN;
    for (const p of chain2) {
      const cs = getComputedStyle(p);
      if (cs.display !== "contents") clip2 = childClip(p, cs, p.getBoundingClientRect(), clip2);
    }
    return clip2;
  }
  function visible(cs, r, clip2) {
    return r.width > 0 && r.height > 0 && cs.visibility === "visible" && r.right > clip2.left && r.left < clip2.right && r.bottom > clip2.top && r.top < clip2.bottom;
  }
  function collect(root2, budgetMs) {
    const deadline = performance.now() + budgetMs;
    const byKey = /* @__PURE__ */ new Map();
    const add2 = (f, key2) => {
      const had = byKey.get(key2);
      if (had) had.count++;
      else byKey.set(key2, { ...f, key: key2, count: 1 });
    };
    const start = svgRoot(root2) ?? root2;
    const stack = [[start, initialClip(start)]];
    let n = 0;
    let more = false;
    while (stack.length) {
      if ((++n & 15) === 0 && performance.now() > deadline) {
        more = true;
        break;
      }
      if (byKey.size >= MAX_ITEMS) {
        more = true;
        break;
      }
      const [el, clip2] = stack.pop();
      if (SKIP.has(el.tagName) || isOwnNode(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none") continue;
      const box = cs.display !== "contents";
      const r = el.getBoundingClientRect();
      if (box && visible(cs, r, clip2)) {
        if (el instanceof HTMLImageElement) {
          const f = imageHit(el);
          if (f) add2(f, f.url);
        } else if (el instanceof HTMLVideoElement) {
          for (const f of videoHits(el)) add2(f, f.url ?? `video|${uidOf(el)}`);
        } else if (el instanceof SVGSVGElement) {
          add2({ kind: "svg", url: null, shown: null, name: svgNameOf(el), el }, `svg|${el.outerHTML}`);
        }
        if (!(el instanceof SVGElement)) for (const f of cssHits(el, cs)) add2(f, f.url);
      }
      if (el instanceof SVGElement || el instanceof HTMLVideoElement) continue;
      const next = box ? childClip(el, cs, r, clip2) : clip2;
      const kids2 = el.shadowRoot ? [...Array.from(el.shadowRoot.children), ...Array.from(el.children)] : Array.from(el.children);
      for (let i = kids2.length - 1; i >= 0; i--) stack.push([kids2[i], next]);
    }
    return { hits: [...byKey.values()], more };
  }
  function countAssets(root2) {
    const { hits, more } = collect(root2, 25);
    return { count: hits.length, more };
  }
  var known = /* @__PURE__ */ new Map();
  var listSeq = 0;
  function resourceBytes(url) {
    if (!url) return null;
    if (url.startsWith("data:")) {
      const comma = url.indexOf(",");
      const body = url.slice(comma + 1);
      if (/;base64$/i.test(url.slice(0, comma))) return Math.floor(body.length * 3 / 4) - (body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0);
      try {
        return new TextEncoder().encode(decodeURIComponent(body)).length;
      } catch {
        return null;
      }
    }
    const e = performance.getEntriesByName(url).at(-1);
    return e ? e.decodedBodySize || e.encodedBodySize || null : null;
  }
  function loadImage(url, ms = 1500) {
    return new Promise((resolve) => {
      const im = new Image();
      const timer = setTimeout(() => resolve(null), ms);
      im.onload = () => {
        clearTimeout(timer);
        resolve(im.naturalWidth ? im : null);
      };
      im.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      im.src = url;
    });
  }
  function thumbOf(src, w, h) {
    if (!w || !h) return null;
    const s = Math.min(1, 96 / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * s));
    c.height = Math.max(1, Math.round(h * s));
    try {
      c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL("image/webp", 0.8);
    } catch {
      return null;
    }
  }
  async function readBlob(url) {
    try {
      return await (await fetch(url)).blob();
    } catch {
      return null;
    }
  }
  async function enrich(id, h) {
    const base = { id, kind: h.kind, url: h.url, shown: h.shown, name: h.name, count: h.count, uid: uidOf(h.el) };
    if (h.kind === "svg") {
      const svg = h.el;
      const r = svg.getBoundingClientRect();
      const text = svg.getElementsByTagName("*").length > 400 ? null : svgMarkup(svg, "file");
      return {
        ...base,
        width: Math.round(r.width) || null,
        height: Math.round(r.height) || null,
        bytes: text ? new TextEncoder().encode(text).length : null,
        thumb: text && text.length < 24e3 ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}` : null
      };
    }
    if (h.kind === "video") {
      const v = h.el;
      let streaming = !!h.streaming;
      let bytes = null;
      let name = h.name;
      if (!streaming && h.url?.startsWith("blob:")) {
        const blob = await readBlob(h.url);
        streaming = !blob;
        bytes = blob?.size ?? null;
        if (blob?.type && !name.includes(".")) name = `${name}.${extForMime(blob.type) ?? "bin"}`;
      }
      const frame2 = v.readyState >= 2 ? thumbOf(v, v.videoWidth, v.videoHeight) : null;
      return { ...base, name, streaming: streaming || void 0, width: v.videoWidth || null, height: v.videoHeight || null, bytes, thumb: frame2 };
    }
    const shown2 = h.shown ?? h.url;
    const im = await loadImage(shown2);
    let width = im?.naturalWidth ?? null;
    let height = im?.naturalHeight ?? null;
    if (h.url !== shown2) {
      if (h.pick?.w && width && height) {
        height = Math.round(h.pick.w * height / width);
        width = h.pick.w;
      } else if (h.pick?.x && width && height) {
        const k = h.pick.x / (h.shownPick?.x ?? 1);
        width = Math.round(width * k);
        height = Math.round(height * k);
      } else {
        width = height = null;
      }
    }
    let thumb = im ? thumbOf(im, im.naturalWidth, im.naturalHeight) : null;
    if (!thumb && !shown2.startsWith("blob:")) thumb = shown2.startsWith("data:") && shown2.length > 24e3 ? null : shown2;
    return { ...base, width, height, bytes: resourceBytes(h.url), thumb };
  }
  async function listAssets(root2) {
    const { hits, more } = collect(root2, 1500);
    const seq2 = ++listSeq;
    for (const k of [...known.keys()]) if (Number(k.split(".")[0]) < seq2 - 2) known.delete(k);
    const items = await Promise.all(
      hits.map((h, i) => {
        const id = `${seq2}.${i}`;
        known.set(id, h);
        return enrich(id, h);
      })
    );
    return { items, count: items.length, more };
  }
  function toBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).replace(/^data:[^,]*,/, ""));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  async function assetData(id, as) {
    const h = known.get(id);
    if (!h || !h.el.isConnected) return { error: "gone" };
    if (h.kind === "svg") return { text: svgMarkup(h.el, as), mime: "image/svg+xml" };
    if (h.url?.startsWith("blob:")) {
      const blob = await readBlob(h.url);
      if (!blob) return { error: "streaming" };
      if (blob.size > MAX_BLOB) return { error: "too-large" };
      return { base64: await toBase64(blob), mime: blob.type || void 0 };
    }
    return { error: "unsupported" };
  }
  var SVG_NS = "http://www.w3.org/2000/svg";
  var INHERITED = ["color", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "paint-order"];
  var FONTS = ["font-family", "font-size", "font-weight", "font-style", "letter-spacing"];
  var OWN = ["opacity", "stop-color", "stop-opacity", "flood-color", "flood-opacity", "lighting-color"];
  var INITIAL = {
    fill: "rgb(0, 0, 0)",
    "fill-opacity": "1",
    "fill-rule": "nonzero",
    stroke: "none",
    "stroke-width": "1px",
    "stroke-opacity": "1",
    "stroke-linecap": "butt",
    "stroke-linejoin": "miter",
    "stroke-dasharray": "none",
    "stroke-dashoffset": "0px",
    "paint-order": "normal",
    opacity: "1",
    "stop-color": "rgb(0, 0, 0)",
    "stop-opacity": "1",
    "flood-color": "rgb(0, 0, 0)",
    "flood-opacity": "1",
    "lighting-color": "rgb(255, 255, 255)"
  };
  function srgbColor(value) {
    if (!/^(oklch|oklab|color)\(/i.test(value.trim())) return value;
    const c = parseColor(value);
    if (!c) return value;
    if (c.a >= 0.999) return toHex(c);
    const ch = (n) => Math.round(Math.min(1, Math.max(0, n)) * 255);
    return `rgba(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)}, ${Number(c.a.toFixed(3))})`;
  }
  function localUrl(value, pageUrl) {
    const base = pageUrl.split("#")[0];
    return value.replace(/url\(\s*(["']?)([^"')]*)\1\s*\)/g, (m, _q, u) => {
      const i = u.indexOf("#");
      return i >= 0 && (i === 0 || u.slice(0, i) === base) ? `url("${u.slice(i)}")` : m;
    });
  }
  function idRefs(attr, value) {
    const out2 = [];
    if (attr === "href" && value.startsWith("#")) out2.push(value.slice(1));
    for (const m of value.matchAll(/url\(\s*["']?#([^"')\s]+)["']?\s*\)/g)) out2.push(m[1]);
    return out2;
  }
  function ownValue(e, p) {
    return e.getAttribute(p) || e.style?.getPropertyValue(p) || "";
  }
  function inlineStyles(orig, copy, mode) {
    const a = [orig, ...Array.from(orig.querySelectorAll("*"))];
    const b = [copy, ...Array.from(copy.querySelectorAll("*"))];
    const props = orig.querySelector("text") ? [...INHERITED, ...FONTS] : INHERITED;
    const styles = /* @__PURE__ */ new Map();
    a.forEach((e, i) => {
      const cs = getComputedStyle(e);
      styles.set(e, cs);
      const c = b[i];
      if (!c?.style) return;
      const parent = i === 0 ? null : styles.get(e.parentElement) ?? null;
      for (const p of props) {
        const v = cs.getPropertyValue(p);
        if (!v) continue;
        const own2 = ownValue(e, p);
        const keep = mode === "ref" ? own2.includes("var(") : parent ? !!own2 || v !== parent.getPropertyValue(p) : p === "color" || v !== INITIAL[p];
        if (keep) c.style.setProperty(p, srgbColor(localUrl(v, location.href)));
      }
      for (const p of OWN) {
        const v = cs.getPropertyValue(p);
        if (v && v !== INITIAL[p]) c.style.setProperty(p, srgbColor(localUrl(v, location.href)));
      }
    });
  }
  function sizeFromPage(orig, copy) {
    const fixed = (v) => !!v && /^\s*\d+(\.\d+)?(px)?\s*$/.test(v);
    if (fixed(orig.getAttribute("width")) && fixed(orig.getAttribute("height"))) return;
    const r = orig.getBoundingClientRect();
    if (!r.width || !r.height) return;
    copy.setAttribute("width", String(Math.round(r.width * 100) / 100));
    copy.setAttribute("height", String(Math.round(r.height * 100) / 100));
  }
  function copyRefs(orig, copy, as) {
    const scope = orig.getRootNode();
    const have = new Set(Array.from(copy.querySelectorAll("[id]"), (e) => e.id));
    if (copy.id) have.add(copy.id);
    const defs = document.createElementNS(SVG_NS, "defs");
    const queue = [copy];
    for (let guard3 = 0; queue.length && guard3 < 300; guard3++) {
      const node = queue.shift();
      for (const e of [node, ...Array.from(node.querySelectorAll("*"))]) {
        for (const at of Array.from(e.attributes)) {
          for (const id of idRefs(at.localName, at.value)) {
            if (have.has(id)) continue;
            have.add(id);
            const target2 = scope.getElementById(id) ?? document.getElementById(id);
            if (!(target2 instanceof SVGElement)) continue;
            const dup = target2.cloneNode(true);
            if (as === "file") inlineStyles(target2, dup, "ref");
            defs.appendChild(dup);
            queue.push(dup);
          }
        }
      }
    }
    if (defs.firstChild) copy.insertBefore(defs, copy.firstChild);
  }
  function svgMarkup(svg, as) {
    const copy = svg.cloneNode(true);
    if (as === "file") {
      inlineStyles(svg, copy, "svg");
      sizeFromPage(svg, copy);
    }
    copyRefs(svg, copy, as);
    return new XMLSerializer().serializeToString(copy);
  }

  // src/devtools.ts
  var KEY = "__REACT_DEVTOOLS_GLOBAL_HOOK__";
  var hookOf = () => window[KEY];
  function installHook() {
    const w = window;
    let hook = w[KEY];
    if (hook?.__cssTunerTap) return;
    const own2 = !hook || hook.__cssTuner?.own === true;
    if (!hook) {
      let next = 1;
      const renderers = /* @__PURE__ */ new Map();
      const noop = () => void 0;
      hook = {
        renderers,
        supportsFiber: true,
        inject(internals) {
          const id = next++;
          renderers.set(id, internals);
          return id;
        },
        onScheduleFiberRoot: noop,
        onCommitFiberRoot: noop,
        onPostCommitFiberRoot: noop,
        onCommitFiberUnmount: noop,
        checkDCE: noop
      };
      w[KEY] = hook;
    }
    const tap = { renderers: new Map(hook.renderers ?? []), own: own2, onCommit: null };
    const inject = hook.inject;
    if (typeof inject === "function") {
      hook.inject = function(internals) {
        const id = inject.call(this, internals);
        tap.renderers.set(id, internals);
        return id;
      };
    }
    const commit = hook.onCommitFiberRoot;
    hook.onCommitFiberRoot = function(...args) {
      const r = typeof commit === "function" ? commit.apply(this, args) : void 0;
      try {
        tap.onCommit?.();
      } catch {
      }
      return r;
    };
    hook.__cssTunerTap = tap;
  }
  var tapOf = () => hookOf()?.__cssTunerTap ?? null;
  function reactHooked() {
    const hook = hookOf();
    if (!hook) return false;
    const tap = hook.__cssTunerTap;
    return !tap || !tap.own || tap.renderers.size > 0;
  }
  function overrider() {
    for (const r of tapOf()?.renderers.values() ?? []) if (typeof r.overrideProps === "function") return r;
    return null;
  }
  function canOverride() {
    return !!overrider();
  }
  function replaceProps(fiber, props) {
    const r = overrider();
    if (!r) return false;
    r.overrideProps(fiber, [], props);
    return true;
  }
  function onCommit(fn) {
    const tap = tapOf();
    if (tap) tap.onCommit = fn;
  }

  // src/react-source.ts
  var fiberKey = null;
  function fiberOf(el) {
    if (fiberKey && fiberKey in el) return el[fiberKey];
    for (const k of Object.keys(el)) {
      if (k.startsWith("__reactFiber$")) {
        fiberKey = k;
        return el[k];
      }
    }
    return null;
  }
  function hasReact() {
    return reactHooked() || !!fiberKey;
  }
  var stackOf = (n) => n._debugStack?.stack ?? n.debugStack?.stack;
  var ownerOf = (n) => n._debugOwner ?? n.owner ?? null;
  function nameOf(n) {
    if (!n) return null;
    if (n.type === void 0) return typeof n.name === "string" && n.name ? n.name : null;
    const t2 = n.type;
    if (!t2) return null;
    if (typeof t2 === "string") return t2;
    return t2.displayName || t2.name || null;
  }
  function ownerName(el) {
    const f = fiberOf(el);
    return f ? nameOf(ownerOf(f)) : null;
  }
  var FRAME_RE = /at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;
  var BOTTOM = /react[-_]stack[-_]bottom[-_]frame/;
  var LIB_PATH = /\/node_modules\/|__nextjs-internal-proxy|^\/?\[(?:turbopack|externals)\]/;
  function maybeUser(url) {
    if (SERVER_URL.test(url) || isWebpackModule(url)) return true;
    return url.startsWith(location.origin) && !/\/node_modules\/|\/\.vite\/|\/@vite\/|\/@react-refresh|\/@id\//.test(url);
  }
  var nextDist = null;
  function noteServerFrame(url) {
    if (!nextDist) nextDist = distDirOf(url);
  }
  var framesCache = /* @__PURE__ */ new Map();
  function framesOf(stack) {
    if (!stack) return [];
    let out2 = framesCache.get(stack);
    if (out2) return out2;
    out2 = [];
    let first = true;
    for (const raw of stack.split("\n")) {
      const t2 = raw.trim();
      if (!t2.startsWith("at ")) continue;
      if (BOTTOM.test(t2)) break;
      if (first) {
        first = false;
        continue;
      }
      const m = FRAME_RE.exec(t2);
      if (!m || !maybeUser(m[2])) continue;
      noteServerFrame(m[2]);
      out2.push({ url: m[2], line: +m[3], col: +m[4] });
    }
    if (framesCache.size > 5e3) framesCache.clear();
    framesCache.set(stack, out2);
    return out2;
  }
  var scannedAt = 0;
  function scanForNextDist() {
    if (Date.now() - scannedAt < 2e3) return;
    scannedAt = Date.now();
    const nodes = [document.documentElement, document.body, ...Array.from(document.body?.querySelectorAll("*") ?? []).slice(0, 300)];
    for (const el of nodes) {
      for (let n = el ? fiberOf(el) : null, i = 0; n && i < 8 && !nextDist; n = ownerOf(n), i++) framesOf(stackOf(n));
      if (nextDist) return;
    }
  }
  function jsxFileName(code) {
    const m = /(?:var|const|let)\s+_jsxFileName\s*=\s*("(?:[^"\\]|\\.)*")/.exec(code) ?? /fileName:\s*("(?:[^"\\]|\\.)*")/.exec(code);
    if (!m) return null;
    try {
      const v = JSON.parse(m[1]);
      return v.startsWith("/") || /^[A-Za-z]:[\\/]/.test(v) ? v : null;
    } catch {
      return null;
    }
  }
  async function fetchDirect(url) {
    const code = await (await fetch(url)).text();
    const ref = extractMapUrl(code);
    if (!ref) return null;
    const json = ref.startsWith("data:") ? decodeDataUrl(ref) : await (await fetch(new URL(ref, url))).text();
    return { map: JSON.parse(json), jsxFile: jsxFileName(code) };
  }
  var maps = /* @__PURE__ */ new Map();
  function mapFor(url) {
    let p = maps.get(url);
    if (!p) {
      p = fetchDirect(url).catch(() => null);
      maps.set(url, p);
    }
    return p;
  }
  function basename(p) {
    return p.slice(Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")) + 1);
  }
  async function viaMap(fr) {
    const m = await mapFor(fr.url);
    const pos = m && originalPosition(m.map, fr.line, fr.col);
    if (!m || !pos) return null;
    const abs2 = filePathOf(pos.source);
    let path = abs2;
    if (!path) {
      try {
        path = decodeURIComponent(new URL(pos.source, fr.url).pathname);
      } catch {
        path = pos.source;
      }
    }
    const file = abs2 ?? (m.jsxFile && basename(m.jsxFile) === basename(path) ? m.jsxFile : null);
    return { path, file, line: pos.line, column: pos.column, library: pos.ignored || LIB_PATH.test(path) };
  }
  function nextFileOf(url) {
    const server = serverModuleUrl(url);
    if (server) return server;
    if (isWebpackModule(url)) return url;
    if (!/\/_next\/static\//.test(url)) return null;
    if (!nextDist) scanForNextDist();
    return nextDist ? clientModuleUrl(url, nextDist) : null;
  }
  var batch = [];
  var batchTimer = null;
  function nextTrace(file, line2, col) {
    return new Promise((done) => {
      batch.push({ frame: { file, methodName: "<unknown>", arguments: [], line1: line2, column1: col }, done });
      batchTimer ??= setTimeout(flushTrace, 0);
    });
  }
  async function flushTrace() {
    const items = batch;
    batch = [];
    batchTimer = null;
    for (let i = 0; i < items.length; i += 200) {
      const part2 = items.slice(i, i + 200);
      let out2 = [];
      try {
        const r = await fetch("/__nextjs_original-stack-frames", {
          method: "POST",
          body: JSON.stringify({ frames: part2.map((p) => p.frame), isServer: false, isEdgeServer: false, isAppDirectory: true })
        });
        if (r.ok) out2 = await r.json();
      } catch {
      }
      part2.forEach((p, k) => {
        const f = out2[k]?.status === "fulfilled" ? out2[k].value?.originalStackFrame : null;
        p.done(f && f.file && f.line1 ? f : null);
      });
    }
  }
  async function viaNext(file, fr) {
    const t2 = await nextTrace(file, fr.line, fr.col);
    if (!t2) return null;
    const root2 = nextDist ? projectRootOf(nextDist) : null;
    const abs2 = filePathOf(t2.file) ?? (t2.file.startsWith("/") ? t2.file : root2 ? joinPath(root2, t2.file) : null);
    const path = abs2 ?? t2.file;
    return { path, file: abs2, line: t2.line1 ?? 1, column: t2.column1 ?? 1, library: !!t2.ignored || LIB_PATH.test(path) };
  }
  var resolved = /* @__PURE__ */ new Map();
  function resolveFrame(fr) {
    const key2 = `${fr.url}:${fr.line}:${fr.col}`;
    let p = resolved.get(key2);
    if (!p) {
      const next = nextFileOf(fr.url);
      p = next ? viaNext(next, fr).then((r) => r ?? (next !== fr.url && !SERVER_URL.test(fr.url) && !fr.url.includes("?") ? viaMap(fr) : null)) : viaMap(fr);
      resolved.set(key2, p);
    }
    return p;
  }
  var loadedModules = /* @__PURE__ */ new Map();
  var watchingModules = false;
  function watchModules() {
    if (watchingModules) return;
    watchingModules = true;
    const note = (list) => {
      for (const e of list) {
        const r = e;
        if (r.initiatorType === "fetch" || r.initiatorType === "xmlhttprequest") continue;
        try {
          const u = new URL(r.name);
          if (u.origin === location.origin) loadedModules.set(decodeURIComponent(u.pathname), r.name);
        } catch {
        }
      }
    };
    note(performance.getEntriesByType("resource"));
    try {
      new PerformanceObserver((l) => note(l.getEntries())).observe({ type: "resource" });
    } catch {
    }
  }
  var modulePathOf = /* @__PURE__ */ new Map();
  function moduleUrlOf(fileName) {
    const known2 = modulePathOf.get(fileName);
    const hit = known2 && loadedModules.get(known2);
    if (hit) return hit;
    let best = null;
    let len = 0;
    for (const path of loadedModules.keys()) {
      const p = path.startsWith("/@fs/") ? path.slice(4) : path;
      if (p.length > len && p.length > 1 && fileName.endsWith(p)) {
        best = path;
        len = p.length;
      }
    }
    if (best) {
      modulePathOf.set(fileName, best);
      return loadedModules.get(best);
    }
    return location.origin + "/@fs" + encodeURI(fileName.startsWith("/") ? fileName : "/" + fileName);
  }
  var lineShifts = /* @__PURE__ */ new Map();
  async function lineShiftOf(url, fileName) {
    const code = await (await fetch(url)).text();
    const ref = extractMapUrl(code);
    if (!ref) return 0;
    const map = JSON.parse(ref.startsWith("data:") ? decodeDataUrl(ref) : await (await fetch(new URL(ref, url))).text());
    return jsxLineShift(code, map, fileName);
  }
  function lineShiftFor(fileName) {
    watchModules();
    const url = moduleUrlOf(fileName);
    const key2 = `${url}
${fileName}`;
    let p = lineShifts.get(key2);
    if (!p) {
      if (lineShifts.size > 500) lineShifts.clear();
      p = lineShiftOf(url, fileName).catch(() => 0);
      lineShifts.set(key2, p);
    }
    return p;
  }
  async function ownFrame(n, hops) {
    const s = n._debugSource;
    if (s && s.fileName && !s.fileName.includes("/node_modules/")) {
      const shift2 = await lineShiftFor(s.fileName);
      const line2 = s.lineNumber - shift2 >= 1 ? s.lineNumber - shift2 : s.lineNumber;
      const loc = { path: s.fileName, file: s.fileName, line: line2, column: s.columnNumber ?? 1, library: false };
      return { node: n, url: s.fileName, hops, loc };
    }
    for (const fr of framesOf(stackOf(n))) {
      const loc = await resolveFrame(fr);
      if (loc && !loc.library) return { node: n, url: fr.url, hops, loc };
    }
    return null;
  }
  async function pick(el) {
    let n = fiberOf(el);
    for (let hops = 0; n && hops < 16; hops++) {
      const p = await ownFrame(n, hops);
      if (p) return p;
      n = ownerOf(n);
    }
    return null;
  }
  function toLoc(p) {
    const { loc } = p;
    return { url: stripQuery(p.url), path: loc.path, file: loc.file, line: loc.line, column: loc.column, component: nameOf(ownerOf(p.node)), viaOwner: p.hops > 0 };
  }
  async function sourceOf(el) {
    const p = await pick(el);
    return p ? toLoc(p) : null;
  }
  async function fiberSource(n) {
    const p = await ownFrame(n, 0);
    return p ? toLoc(p) : null;
  }
  async function frameChain(el, depth) {
    const first = await pick(el);
    if (!first) return [];
    const out2 = [{ loc: toLoc(first), callee: null, node: first.node }];
    let n = ownerOf(first.node);
    for (let guard3 = 0; n && out2.length <= depth && guard3 < 16; guard3++) {
      const p = await ownFrame(n, 0);
      if (p) out2.push({ loc: toLoc(p), callee: nameOf(n), node: n });
      n = ownerOf(n);
    }
    return out2;
  }
  async function propsChain(el, depth = 3) {
    const chain2 = await frameChain(el, depth);
    const out2 = [];
    chain2.forEach((c, i) => {
      if (i === 0 && !c.loc.viaOwner) return;
      const props = c.node.memoizedProps ?? c.node.props;
      if (props && typeof props === "object") out2.push({ depth: i, props });
    });
    return out2;
  }
  var reactLocator = {
    owns: (el) => !!fiberOf(el),
    sourceOf,
    chain: async (el, depth) => (await frameChain(el, depth)).map(({ loc, callee }) => ({ loc, callee })),
    ownerName,
    /**
     * 页面渲染完就把所有元素的源码位置解析一遍并缓存：热更新后被复用的 fiber 仍带着旧代码的栈帧，
     * 要趁代码还没变时用当时的 sourcemap 解析（Next.js 的 chunk 地址不随热更新变化）。
     */
    warm: (nodes) => {
      if (!fiberKey && !nodes.slice(0, 40).some((n) => fiberOf(n))) return;
      void Promise.all(nodes.slice(0, 5e3).map((n) => sourceOf(n)));
    }
  };

  // src/locator.ts
  var isLibFile = (path) => /(?:^|[\\/])node_modules[\\/]/.test(path);

  // src/svelte-source.ts
  var metaOf = (el) => el.__svelte_meta ?? null;
  var isAbsolute = (p) => p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p);
  function componentOf(file) {
    return file.replace(/^.*[\\/]/, "").replace(/\.svelte$/, "");
  }
  function toLoc2(l, viaOwner = false) {
    return { url: l.file, path: l.file, file: isAbsolute(l.file) ? l.file : null, line: l.line, column: l.column + 1, component: componentOf(l.file), viaOwner };
  }
  function place(m) {
    if (!m?.loc) return null;
    if (!isLibFile(m.loc.file)) return { loc: toLoc2(m.loc), layer: m.loc, outer: m.parent };
    for (let p = m.parent; p; p = p.parent) {
      if (isLibFile(p.file)) continue;
      return p.type === "component" ? { loc: toLoc2(p, true), layer: p, outer: p.parent } : null;
    }
    return null;
  }
  var svelteLocator = {
    owns: (el) => !!metaOf(el),
    sourceOf: async (el) => place(metaOf(el))?.loc ?? null,
    /**
     * 组件 C 在哪被调用：往外第一个组件层、且它里面那一层还在 C 的文件里。
     * snippet 和插槽内容的渲染路径会穿过别的组件，那些组件层不是 C 的调用处；
     * 调用处在依赖包里（比如 SvelteKit 渲染页面的根组件）就到头了
     */
    chain: async (el, depth) => {
      const first = place(metaOf(el));
      if (!first) return [];
      const out2 = [{ loc: first.loc, callee: null }];
      let file = first.layer.file;
      let inner = first.layer;
      for (let p = first.outer; p && out2.length <= depth; inner = p, p = p.parent) {
        if (p.type !== "component" || inner.file !== file) continue;
        if (isLibFile(p.file)) break;
        out2.push({ loc: toLoc2(p), callee: p.componentTag ?? componentOf(file) });
        file = p.file;
      }
      return out2;
    },
    ownerName: (el) => {
      const loc = metaOf(el)?.loc;
      return loc ? componentOf(loc.file) : null;
    }
  };

  // src/vue-template.ts
  var VOID_TAGS = /* @__PURE__ */ new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  var RAW_TAGS = /* @__PURE__ */ new Set(["script", "style", "textarea", "title"]);
  var TAG_START = /<([A-Za-z][^\s/>]*)/y;
  var SPACE = /\s/;
  function readStartTag(src, lt) {
    TAG_START.lastIndex = lt;
    const m = TAG_START.exec(src);
    if (!m) return null;
    const attrs = /* @__PURE__ */ new Map();
    const n = src.length;
    let p = lt + m[0].length;
    while (p < n) {
      const c = src[p];
      if (c === ">") return { name: m[1], attrs, end: p + 1, selfClosing: false };
      if (c === "/") {
        if (src[p + 1] === ">") return { name: m[1], attrs, end: p + 2, selfClosing: true };
        p++;
        continue;
      }
      if (SPACE.test(c)) {
        p++;
        continue;
      }
      let q = p + 1;
      while (q < n && !SPACE.test(src[q]) && src[q] !== "=" && src[q] !== ">" && src[q] !== "/") q++;
      const name = src.slice(p, q);
      p = q;
      while (p < n && SPACE.test(src[p])) p++;
      if (src[p] !== "=") {
        attrs.set(name, true);
        continue;
      }
      p++;
      while (p < n && SPACE.test(src[p])) p++;
      const quote = src[p];
      if (quote === '"' || quote === "'") {
        const close = src.indexOf(quote, p + 1);
        if (close < 0) return null;
        attrs.set(name, src.slice(p + 1, close));
        p = close + 1;
      } else {
        let r = p;
        while (r < n && !SPACE.test(src[r]) && src[r] !== ">") r++;
        attrs.set(name, src.slice(p, r));
        p = r;
      }
    }
    return null;
  }
  function afterClose(src, name, from) {
    const re = new RegExp(`</${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*>`, "gi");
    re.lastIndex = from;
    const m = re.exec(src);
    return m ? m.index + m[0].length : -1;
  }
  function parseChildren(src, from, root2) {
    const stack = [root2];
    const n = src.length;
    let pos = from;
    while (pos < n) {
      const lt = src.indexOf("<", pos);
      const mustache = src.indexOf("{{", pos);
      if (mustache >= 0 && (lt < 0 || mustache < lt)) {
        const end = src.indexOf("}}", mustache + 2);
        if (end < 0) return false;
        pos = end + 2;
        continue;
      }
      if (lt < 0) return false;
      if (src.startsWith("<!--", lt)) {
        const end = src.indexOf("-->", lt + 4);
        if (end < 0) return false;
        pos = end + 3;
        continue;
      }
      if (src[lt + 1] === "/") {
        const gt = src.indexOf(">", lt + 2);
        if (gt < 0) return false;
        const name = src.slice(lt + 2, gt).trim();
        pos = gt + 1;
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag !== name) continue;
          if (i === 0) return true;
          stack.length = i;
          break;
        }
        continue;
      }
      if (src[lt + 1] === "!") {
        const gt = src.indexOf(">", lt + 2);
        if (gt < 0) return false;
        pos = gt + 1;
        continue;
      }
      const tag2 = readStartTag(src, lt);
      if (!tag2) {
        pos = lt + 1;
        continue;
      }
      const node = { tag: tag2.name, start: lt, attrs: tag2.attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      pos = tag2.end;
      if (tag2.selfClosing || VOID_TAGS.has(tag2.name)) continue;
      if (RAW_TAGS.has(tag2.name)) {
        pos = afterClose(src, tag2.name, pos);
        if (pos < 0) return false;
        continue;
      }
      stack.push(node);
    }
    return false;
  }
  function parseVueTemplate(src) {
    let pos = 0;
    while (pos < src.length) {
      const lt = src.indexOf("<", pos);
      if (lt < 0) return null;
      if (src.startsWith("<!--", lt)) {
        const end = src.indexOf("-->", lt + 4);
        if (end < 0) return null;
        pos = end + 3;
        continue;
      }
      const tag2 = readStartTag(src, lt);
      if (!tag2) {
        pos = lt + 1;
        continue;
      }
      if (tag2.name === "template" && !tag2.selfClosing) {
        const lang = tag2.attrs.get("lang");
        if (typeof lang === "string" && lang !== "html" || tag2.attrs.has("src")) return null;
        const root2 = { tag: "template", start: lt, attrs: tag2.attrs, children: [] };
        return parseChildren(src, tag2.end, root2) ? root2 : null;
      }
      pos = tag2.selfClosing ? tag2.end : afterClose(src, tag2.name, tag2.end);
      if (pos < 0) return null;
    }
    return null;
  }
  function lineColAt(src, offset) {
    let line2 = 1;
    let last = -1;
    for (let i = src.indexOf("\n"); i >= 0 && i < offset; i = src.indexOf("\n", i + 1)) {
      line2++;
      last = i;
    }
    return { line: line2, column: offset - last };
  }

  // src/vue-source.ts
  var FRAGMENT = /* @__PURE__ */ Symbol.for("v-fgt");
  var TEXT = /* @__PURE__ */ Symbol.for("v-txt");
  var COMMENT = /* @__PURE__ */ Symbol.for("v-cmt");
  var STATIC = /* @__PURE__ */ Symbol.for("v-stc");
  var ELEMENT = 1;
  var COMPONENT = 2 | 4;
  var ARRAY_CHILDREN = 16;
  var TELEPORT = 64;
  var SUSPENSE = 128;
  var DEV_ROOT_FRAGMENT = 2048;
  var vnodeOf = (el) => el.__vnode ?? null;
  function kids(v) {
    return v.shapeFlag & ARRAY_CHILDREN && Array.isArray(v.children) ? v.children : [];
  }
  function elementVNodeOf(el) {
    let v = vnodeOf(el);
    for (let guard3 = 0; v && v.shapeFlag & COMPONENT && guard3 < 20; guard3++) {
      let sub = v.component?.subTree ?? null;
      if (sub?.type === FRAGMENT && sub.patchFlag & DEV_ROOT_FRAGMENT) sub = kids(sub).find((c) => c.el === el) ?? null;
      if (!sub || sub.el !== el) return null;
      v = sub;
    }
    return v;
  }
  function counts(v) {
    if (!v || typeof v !== "object") return false;
    const n = v;
    if (n.type === TEXT) return false;
    if (n.type === COMMENT) return n.children === "v-if";
    return true;
  }
  function entriesOf(children) {
    const out2 = [];
    for (const c of children) {
      const last = out2[out2.length - 1];
      if ((c.attrs.has("v-else-if") || c.attrs.has("v-else")) && last && "branches" in last) last.branches.push(c);
      else if (c.attrs.has("v-if")) out2.push({ branches: [c] });
      else out2.push({ node: c });
    }
    return out2;
  }
  var WRAPPER_ATTR = /^(?:v-if|v-else-if|v-else|v-for|v-slot(?::.*)?|#.*)$/;
  function isWrapper(t2) {
    if (t2.tag !== "template") return false;
    for (const k of t2.attrs.keys()) if (WRAPPER_ATTR.test(k)) return true;
    return false;
  }
  function slotNameOf(t2) {
    for (const k of t2.attrs.keys()) {
      if (k === "v-slot") return "default";
      if (k.startsWith("v-slot:")) return k.slice(7);
      if (k.startsWith("#")) return k.slice(1);
    }
    return null;
  }
  var NATIVE_LOOKING = /^[a-z][a-z0-9]*$/;
  var CORE = /* @__PURE__ */ new Set(["component", "transition", "teleport", "suspense", "keepalive"]);
  function sameTag(t2, v) {
    if (typeof v.type === "string") return v.type === t2.tag || t2.tag === "component";
    if (v.shapeFlag & (COMPONENT | TELEPORT | SUSPENSE)) return !NATIVE_LOOKING.test(t2.tag) || CORE.has(t2.tag);
    return false;
  }
  function itemShape(t2, v) {
    if (t2.tag === "slot") return v.type === FRAGMENT;
    if (isWrapper(t2)) return v.type === FRAGMENT || t2.children.length === 1 && sameShape(t2.children[0], v);
    return sameTag(t2, v);
  }
  function sameShape(t2, v) {
    return t2.attrs.has("v-for") ? v.type === FRAGMENT : itemShape(t2, v);
  }
  function pickBranch(branches, v, base) {
    if (typeof v.key === "number") {
      const b = branches[v.key - base];
      if (b && sameShape(b, v)) return b;
    }
    const keyed = branches.find((b) => b.attrs.get("key") === String(v.key));
    if (keyed) return keyed;
    const same = branches.filter((b) => sameShape(b, v));
    return same.length === 1 ? same[0] : null;
  }
  function siblingsOf(...lists) {
    const out2 = { entries: [], bases: [] };
    for (const list of lists) {
      let base = 0;
      for (const e of entriesOf(list)) {
        out2.entries.push(e);
        out2.bases.push(base);
        if ("branches" in e) base += e.branches.length;
      }
    }
    return out2;
  }
  var isFor = (e) => !!e && "node" in e && e.node.attrs.has("v-for");
  function fits(e, v, base) {
    if ("branches" in e) return v.type === COMMENT || !!pickBranch(e.branches, v, base);
    return v.type !== COMMENT && (sameShape(e.node, v) || isFor(e) && itemShape(e.node, v));
  }
  function alignList(ts, vs, a, owner, loose = false) {
    const { entries: entries4, bases } = Array.isArray(ts) ? siblingsOf(ts) : ts;
    let i = 0;
    let flat = null;
    for (const v of vs) {
      if (!counts(v)) continue;
      if (flat && v.type !== FRAGMENT && itemShape(flat, v)) {
        if (!alignOne(flat, v, a, owner)) return false;
        continue;
      }
      flat = null;
      if (v.type === STATIC) {
        for (const el of staticRoots(v)) {
          const e2 = entries4[i++];
          if (!e2 || !("node" in e2) || !mapStatic(el, e2.node, a)) return false;
        }
        continue;
      }
      while (i < entries4.length && (loose || isFor(entries4[i]) && v.type !== FRAGMENT) && !fits(entries4[i], v, bases[i])) i++;
      const e = entries4[i];
      const base = bases[i++];
      if (!e) return false;
      if ("branches" in e) {
        if (v.type === COMMENT) continue;
        const b = pickBranch(e.branches, v, base);
        if (!b || !alignNode(b, v, a, owner)) return false;
        continue;
      }
      if (v.type === COMMENT) return false;
      if (isFor(e) && v.type !== FRAGMENT) {
        if (!alignOne(e.node, v, a, owner)) return false;
        flat = e.node;
        continue;
      }
      if (!alignNode(e.node, v, a, owner)) return false;
    }
    return true;
  }
  function alignNode(t2, v, a, owner) {
    if (t2.attrs.has("v-for")) {
      if (v.type !== FRAGMENT) return false;
      for (const item of kids(v)) if (counts(item) && !alignOne(t2, item, a, owner)) return false;
      return true;
    }
    return alignOne(t2, v, a, owner);
  }
  function alignOne(t2, v, a, owner) {
    if (isWrapper(t2)) return alignList(t2.children, v.type === FRAGMENT ? kids(v) : [v], a, owner);
    if (t2.tag === "slot") {
      if (v.type !== FRAGMENT) return false;
      const own2 = kids(v).filter(counts);
      return own2.length > 0 && own2.every((c) => c.ctx === owner) ? alignList(t2.children, own2, a, owner) : true;
    }
    if (!sameTag(t2, v)) return false;
    if (v.shapeFlag & COMPONENT) {
      if (v.component) {
        a.comps.set(v.component, t2);
        alignSlots(t2, v.component, a, owner);
      }
      return true;
    }
    if (v.el instanceof Element) a.els.set(v.el, t2);
    if (t2.attrs.has("v-html") || t2.attrs.has("v-text")) return true;
    if (v.shapeFlag & ARRAY_CHILDREN) return alignList(t2.children, kids(v), a, owner);
    if (v.el instanceof Element && t2.children.length && v.props && ("innerHTML" in v.props || "textContent" in v.props)) return mapChildren(v.el, t2, a);
    return true;
  }
  function alignSlots(t2, child, a, owner) {
    if (!child.subTree) return;
    const named = /* @__PURE__ */ new Map();
    const order = [];
    const loose = [];
    for (const c of t2.children) {
      const name = c.tag === "template" ? slotNameOf(c) : null;
      if (name) {
        named.set(name, c.children);
        order.push(c.children);
      } else {
        if (!loose.length) order.push(loose);
        loose.push(c);
      }
    }
    if (!named.has("default")) named.set("default", loose);
    const frags = [];
    const direct = [];
    collectSlots(child.subTree, owner, frags, direct, 0);
    for (const f of frags) {
      const list = named.get(f.name);
      if (list) alignList(list, kids(f.v), a, owner);
    }
    if (direct.length) alignList(siblingsOf(...order), direct, a, owner, true);
  }
  function collectSlots(v, owner, frags, direct, depth) {
    if (!v || typeof v !== "object" || depth > 100) return;
    if (v.ctx === owner) {
      if (counts(v)) direct.push(v);
      return;
    }
    if (v.type === FRAGMENT && typeof v.key === "string" && v.key.startsWith("_")) {
      const own2 = kids(v).filter(counts);
      if (own2.length && own2.every((c) => c.ctx === owner)) {
        frags.push({ name: v.key.slice(1), v });
        return;
      }
    }
    if (v.shapeFlag & COMPONENT) {
      if (v.component?.subTree) collectSlots(v.component.subTree, owner, frags, direct, depth + 1);
      return;
    }
    for (const c of kids(v)) collectSlots(c, owner, frags, direct, depth + 1);
  }
  function staticRoots(v) {
    const out2 = [];
    for (let n = v.el; n; n = n.nextSibling) {
      if (n instanceof Element && !isOwnNode(n)) out2.push(n);
      if (n === v.anchor) break;
    }
    return out2;
  }
  function mapStatic(el, t2, a) {
    if (el.localName !== t2.tag && el.localName !== t2.tag.toLowerCase()) return false;
    a.els.set(el, t2);
    return mapChildren(el, t2, a);
  }
  function mapChildren(el, t2, a) {
    const ks = Array.from(el.children).filter((c) => !isOwnNode(c));
    if (ks.length !== t2.children.length) return false;
    return ks.every((k, i) => mapStatic(k, t2.children[i], a));
  }
  function alignRoot(a, inst) {
    const top = a.tpl.root.children;
    const sub = a.subTree;
    const unwrap = sub.type === FRAGMENT && (sub.patchFlag & DEV_ROOT_FRAGMENT || entriesOf(top).length > 1);
    alignList(top, unwrap ? kids(sub) : [sub], a, inst);
  }
  function viteBase() {
    const src = document.querySelector('script[src*="/@vite/client"]')?.getAttribute("src");
    if (src) {
      try {
        return new URL(src.slice(0, src.indexOf("@vite/client")), location.href).pathname;
      } catch {
      }
    }
    return "/";
  }
  async function fetchTemplate(file) {
    try {
      const path = file.startsWith("/") ? file : "/" + file;
      const r = await fetch(`${viteBase()}@fs${encodeURI(path)}?raw`, { cache: "no-store" });
      if (!r.ok) return null;
      const m = /export default\s*("(?:[^"\\]|\\[\s\S])*")/.exec(await r.text());
      if (!m) return null;
      const src = JSON.parse(m[1]);
      const root2 = parseVueTemplate(src);
      return root2 ? { file, src, root: root2 } : null;
    } catch {
      return null;
    }
  }
  var templates = /* @__PURE__ */ new Map();
  function templateOf(inst) {
    const file = inst.type.__file;
    if (!file) return Promise.resolve(null);
    const render = inst.render ?? null;
    let hit = templates.get(file);
    if (!hit || hit.render !== render) {
      hit = { render, p: fetchTemplate(file) };
      templates.set(file, hit);
    }
    return hit.p;
  }
  var alignedCache = /* @__PURE__ */ new WeakMap();
  async function alignedFor(inst, fresh = false) {
    if (!inst.subTree || inst.isUnmounted) return null;
    const render = inst.render ?? null;
    const hit = alignedCache.get(inst);
    if (hit && hit.subTree === inst.subTree && hit.render === render && !(fresh && performance.now() - hit.at > 200)) return hit;
    const tpl = await templateOf(inst);
    if (!tpl || !inst.subTree) return null;
    const a = { tpl, subTree: inst.subTree, render, at: performance.now(), els: /* @__PURE__ */ new Map(), comps: /* @__PURE__ */ new Map() };
    alignRoot(a, inst);
    alignedCache.set(inst, a);
    return a;
  }
  function appInstanceOf(el) {
    return el.__vue_app__?._instance ?? null;
  }
  var isAppComponent = (inst) => !!inst.type.__file && !isLibFile(inst.type.__file);
  async function viaCaller(el, inst) {
    for (let hops = 0; hops < 8; hops++) {
      if (rootElementOf(inst) !== el) return null;
      const parent = inst.vnode.ctx;
      if (!parent) return null;
      if (isAppComponent(parent)) {
        const a = await alignedFor(parent);
        const t2 = a?.comps.get(inst);
        return a && t2 ? { inst: parent, a, t: t2, viaOwner: true } : null;
      }
      inst = parent;
    }
    return null;
  }
  async function locate(el) {
    const v = elementVNodeOf(el);
    if (v?.ctx) {
      if (!isAppComponent(v.ctx)) return viaCaller(el, v.ctx);
      for (const fresh of [false, true]) {
        const a = await alignedFor(v.ctx, fresh);
        const t2 = a?.els.get(el);
        if (a && t2) return { inst: v.ctx, a, t: t2 };
      }
      return null;
    }
    let start = null;
    for (let p = el.parentElement; p && !start; p = p.parentElement) start = vnodeOf(p)?.ctx ?? appInstanceOf(p);
    if (!start) return null;
    for (const fresh of [false, true]) {
      const queue = [start];
      const seen = /* @__PURE__ */ new Set();
      while (queue.length && seen.size < 64) {
        const inst = queue.shift();
        if (seen.has(inst)) continue;
        seen.add(inst);
        const a = await alignedFor(inst, fresh);
        if (!a) continue;
        const t2 = isAppComponent(inst) ? a.els.get(el) : void 0;
        if (t2) return { inst, a, t: t2 };
        queue.push(...a.comps.keys());
      }
    }
    return null;
  }
  function nameOf2(inst) {
    if (!inst) return null;
    const t2 = inst.type;
    return t2.__name || t2.name || (t2.__file ? t2.__file.replace(/^.*[\\/]/, "").replace(/\.vue$/, "") : null);
  }
  function toLoc3(hit) {
    const { file, src } = hit.a.tpl;
    const { line: line2, column } = lineColAt(src, hit.t.start);
    return { url: file, path: file, file, line: line2, column, component: nameOf2(hit.inst), viaOwner: !!hit.viaOwner };
  }
  function rootElementOf(inst) {
    if (inst.type.inheritAttrs === false) return null;
    let root2 = inst.subTree;
    if (root2?.type === FRAGMENT && root2.patchFlag & DEV_ROOT_FRAGMENT) {
      const only = kids(root2).filter(counts);
      root2 = only.length === 1 ? only[0] : null;
    }
    return root2 && root2.shapeFlag & (ELEMENT | COMPONENT) && root2.el instanceof Element ? root2.el : null;
  }
  var vueLocator = {
    owns: (el) => !!vnodeOf(el) || !!el.closest("[data-v-app]"),
    sourceOf: async (el) => {
      const hit = await locate(el);
      return hit ? toLoc3(hit) : null;
    },
    /** 只有组件根元素往外走：元素的类名只可能来自它自己的标签和（透传的）调用处 */
    chain: async (el, depth) => {
      const first = await locate(el);
      if (!first) return [];
      const out2 = [{ loc: toLoc3(first), callee: null }];
      let inst = first.inst;
      while (out2.length <= depth && rootElementOf(inst) === el) {
        const parent = inst.vnode.ctx;
        if (!parent || !isAppComponent(parent)) break;
        const pa = await alignedFor(parent);
        const t2 = pa?.comps.get(inst);
        if (!pa || !t2) break;
        out2.push({ loc: toLoc3({ inst: parent, a: pa, t: t2 }), callee: nameOf2(inst) });
        inst = parent;
      }
      return out2;
    },
    ownerName: (el) => nameOf2(elementVNodeOf(el)?.ctx),
    warm: (nodes) => {
      const seen = /* @__PURE__ */ new Set();
      for (const n of nodes) {
        const inst = elementVNodeOf(n)?.ctx;
        if (inst && !seen.has(inst)) {
          seen.add(inst);
          void templateOf(inst);
        }
      }
    }
  };

  // src/source.ts
  var htmlLocator = {
    owns: () => true,
    sourceOf: async () => null,
    chain: async () => [],
    ownerName: () => null
  };
  var LOCATORS = [reactLocator, vueLocator, svelteLocator];
  function locatorOf(el) {
    return LOCATORS.find((l) => l.owns(el)) ?? htmlLocator;
  }
  function isPlainHtml(el) {
    return locatorOf(el) === htmlLocator;
  }
  function hydrating() {
    const nuxt = document.getElementById("__nuxt");
    if (nuxt && !nuxt.__vue_app__) return true;
    return !!document.querySelector("style[data-sveltekit]");
  }
  async function whenHydrated(timeout = 5e3) {
    const until = performance.now() + timeout;
    while (hydrating() && performance.now() < until) await new Promise((r) => setTimeout(r, 50));
  }
  function sourceOf2(el) {
    return locatorOf(el).sourceOf(el);
  }
  function ownerName2(el) {
    return locatorOf(el).ownerName(el);
  }
  function locKey(s) {
    return `${s.path}:${s.line}:${s.column}`;
  }
  function chainOf(el, depth) {
    return locatorOf(el).chain(el, depth);
  }
  async function chainKeys(el, depth) {
    return (await chainOf(el, depth)).map((c) => locKey(c.loc));
  }
  async function sameChain(el, peers2, depth) {
    if (depth <= 0) return peers2;
    const want = (await chainKeys(el, depth)).slice(1, depth + 1).join("|");
    const keep = await Promise.all(peers2.map(async (p) => p === el || (await chainKeys(p, depth)).slice(1, depth + 1).join("|") === want));
    return peers2.filter((_, i) => keep[i]);
  }
  async function callersOf(el, peers2, depth = 3) {
    const chain2 = (await chainOf(el, depth)).slice(1);
    const out2 = [];
    for (const [i, c] of chain2.entries()) {
      out2.push({ source: c.loc, component: c.callee, same: (await sameChain(el, peers2, i + 1)).length });
    }
    return out2;
  }
  function allElements() {
    return Array.from(document.body.querySelectorAll("*"));
  }
  async function bySource(want) {
    const nodes = allElements();
    const locs = await Promise.all(nodes.map((n) => sourceOf2(n)));
    return nodes.filter((_, i) => {
      const s = locs[i];
      return !!s && locKey(s) === want;
    });
  }
  async function sameSourceElements(el, depth = 0) {
    const target2 = await sourceOf2(el);
    if (!target2) return [el];
    const peers2 = await bySource(locKey(target2));
    if (!peers2.includes(el)) {
      peers2.push(el);
      peers2.sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    }
    return depth > 0 ? sameChain(el, peers2, depth) : peers2;
  }
  async function findBySource(path, line2, column, index = 0) {
    const hits = await bySource(`${path}:${line2}:${column}`);
    return hits[index] ?? hits[0] ?? null;
  }
  var warmTimer = null;
  function warmSources(delay = 600) {
    if (warmTimer) clearTimeout(warmTimer);
    warmTimer = setTimeout(() => {
      warmTimer = null;
      const nodes = allElements();
      for (const l of LOCATORS) l.warm?.(nodes);
    }, delay);
  }

  // src/text.ts
  var EDITING_ATTR = "data-css-tuner-editing";
  var MAX_SEGMENTS = 8;
  function textNodesOf(el) {
    const out2 = [];
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) {
        if (n.data.trim()) out2.push(n);
      } else if (n instanceof Element && n.hasAttribute(EDITING_ATTR)) {
        const t2 = editing?.node ?? Array.from(n.childNodes).find((c) => c.nodeType === Node.TEXT_NODE);
        if (t2) out2.push(t2);
      }
    }
    return out2;
  }
  var held = /* @__PURE__ */ new Map();
  var entries = /* @__PURE__ */ new Map();
  var pendingBase = /* @__PURE__ */ new Map();
  var editing = null;
  var observer = new MutationObserver((records) => {
    for (const r of records) {
      const node = r.target;
      const h = held.get(node);
      if (!h || editing?.node === node) continue;
      h.base = node.data;
      refresh(node);
    }
  });
  function observeHeld() {
    observer.disconnect();
    for (const node of held.keys()) observer.observe(node, { characterData: true });
  }
  function fill(base, value) {
    return /^\s*/.exec(base)[0] + value + /\s*$/.exec(base)[0];
  }
  function baseOf(node) {
    if (editing?.node === node) return held.get(node)?.base ?? editing.original;
    const h = held.get(node);
    if (h) return h.base;
    const p = pendingBase.get(node);
    if (p && Date.now() - p.at < 1e4) return p.base;
    return node.data;
  }
  function refresh(node) {
    const h = held.get(node);
    if (!h) return;
    let value = null;
    for (const e of entries.values()) if (e.nodes.includes(node)) value = e.value;
    if (editing?.node === node) return;
    const next = value === null ? h.base : fill(h.base, value);
    if (node.data !== next) node.data = next;
    if (value === null) held.delete(node);
    observer.takeRecords();
  }
  function hold(el, node) {
    if (held.has(node)) return;
    held.set(node, { el, node, base: baseOf(node) });
    pendingBase.delete(node);
  }
  function hasTextPreview(id) {
    return entries.has(id);
  }
  function textAttached(id) {
    return !!entries.get(id)?.nodes.some((n) => n.isConnected);
  }
  async function previewText(id, target2, value) {
    let e = entries.get(id);
    if (e && JSON.stringify(e.target) !== JSON.stringify(target2)) {
      clearTextPreview(id);
      e = void 0;
    }
    if (!e) {
      const el = elOf(target2.uid);
      const main = el && textNodesOf(el)[target2.segment];
      if (!el || !main) return 0;
      const want = baseOf(main).trim();
      const els = target2.sourceKey ? await sameSourceElements(el, target2.depth ?? 0) : [el];
      const nodes = [];
      for (const x of els) {
        const node = x === el ? main : textNodesOf(x)[target2.segment];
        if (!node || baseOf(node).trim() !== want) continue;
        hold(x, node);
        nodes.push(node);
      }
      e = { target: target2, value, nodes };
      entries.delete(id);
      entries.set(id, e);
    }
    e.value = value;
    for (const node of e.nodes) refresh(node);
    observeHeld();
    return e.nodes.length;
  }
  function clearTextPreview(id) {
    const e = entries.get(id);
    if (!e) return false;
    entries.delete(id);
    for (const node of e.nodes) refresh(node);
    observeHeld();
    return true;
  }
  function commitTextPreview(id, value) {
    const e = entries.get(id);
    if (!e) return;
    entries.delete(id);
    for (const node of e.nodes) {
      const h = held.get(node);
      if (h && value !== null) h.base = fill(h.base, value);
      refresh(node);
    }
    observeHeld();
  }
  function clearAllTexts() {
    const n = entries.size;
    for (const id of Array.from(entries.keys())) clearTextPreview(id);
    return n;
  }
  function reapplyTexts() {
    const moved = /* @__PURE__ */ new Map();
    for (const e of entries.values()) {
      e.nodes = e.nodes.flatMap((node) => {
        if (node.isConnected) return [node];
        if (!moved.has(node)) {
          const h = held.get(node);
          held.delete(node);
          const again2 = h && h.el.isConnected ? textNodesOf(h.el)[e.target.segment] : void 0;
          if (again2) hold(h.el, again2);
          moved.set(node, again2);
        }
        const again = moved.get(node);
        return again ? [again] : [];
      });
      for (const node of e.nodes) refresh(node);
    }
    if (moved.size) observeHeld();
  }
  function hasTextPreviews() {
    return entries.size > 0;
  }
  function setEditing(node, original = "") {
    editing = node ? { node, original } : null;
  }
  function endEditing(node, original, committed) {
    observer.takeRecords();
    if (!held.has(node)) pendingBase.set(node, { base: original, at: Date.now() });
    editing = null;
    if (!committed) refresh(node);
  }
  function childIndex(node, host2) {
    const f = fiberOf(node);
    if (f) {
      const p = f.return;
      return p && (p === host2 || p === host2.alternate || p.alternate === host2) ? f.index ?? null : null;
    }
    const kids2 = host2.memoizedProps?.children;
    return typeof kids2 === "string" || typeof kids2 === "number" ? 0 : null;
  }
  function matching(chain2, text) {
    const out2 = [];
    for (const { depth, props } of chain2) {
      for (const [name, v] of Object.entries(props)) {
        if (name === "children") {
          if (v === text) out2.push({ depth, name, child: 0 });
          else if (Array.isArray(v)) {
            const i = v.indexOf(text);
            if (i >= 0) out2.push({ depth, name, child: i });
          }
        } else if (v === text) out2.push({ depth, name });
      }
    }
    return out2.slice(0, 6);
  }
  function htmlPathOf(el) {
    const path = [];
    for (let e = el; e !== document.documentElement; ) {
      const parent = e.parentElement;
      if (!parent) return null;
      path.unshift(Array.from(parent.children).filter((c) => !isOwnNode(c)).indexOf(e));
      e = parent;
    }
    return path;
  }
  function elementAtPath(path) {
    let el = document.documentElement;
    for (const i of path) el = el ? Array.from(el.children).filter((c) => !isOwnNode(c))[i] ?? null : null;
    return el;
  }
  async function textInfo(el, source) {
    const nodes = textNodesOf(el).slice(0, MAX_SEGMENTS);
    if (!nodes.length) return void 0;
    const host2 = fiberOf(el);
    const chain2 = host2 ? await propsChain(el) : [];
    const segments = nodes.map((node) => {
      const value = baseOf(node);
      return { value, child: host2 && !source?.viaOwner ? childIndex(node, host2) : null, props: matching(chain2, value) };
    });
    return { segments, htmlPath: isPlainHtml(el) ? htmlPathOf(el) : null, lang: document.documentElement.lang || null };
  }
  async function fetchedText(path, segment) {
    try {
      const html = await (await fetch(location.href, { cache: "no-store" })).text();
      let el = new DOMParser().parseFromString(html, "text/html").documentElement;
      for (const i of path) el = el?.children[i] ?? null;
      return el ? textNodesOf(el)[segment]?.data ?? null : null;
    } catch {
      return null;
    }
  }

  // src/edit.ts
  var cur = null;
  var GUARDED = ["keydown", "keyup", "keypress", "pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "auxclick", "contextmenu"];
  function textAt(x, y, scope) {
    const under = (n) => {
      const r = document.createRange();
      r.selectNodeContents(n);
      return Array.from(r.getClientRects()).some((b) => x >= b.left - 2 && x <= b.right + 2 && y >= b.top - 2 && y <= b.bottom + 2);
    };
    const d = document;
    const pos = d.caretPositionFromPoint?.(x, y);
    const range = pos ? null : document.caretRangeFromPoint?.(x, y);
    const node = pos?.offsetNode ?? range?.startContainer;
    if (node && node.nodeType === Node.TEXT_NODE && node.data.trim() && scope.contains(node) && under(node)) {
      return { node, offset: pos?.offset ?? range?.startOffset ?? 0 };
    }
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t2 = n;
      const el = t2.parentElement;
      if (!t2.data.trim() || !el || isOwnNode(el) || el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false) continue;
      if (under(t2)) return { node: t2, offset: t2.length };
    }
    return null;
  }
  function isEditingText() {
    return !!cur;
  }
  var clean = (s) => s.replace(/\s*[\r\n]+\s*/g, " ").trim();
  function beginEdit(node, offset, send) {
    finish(true);
    const parent = node.parentNode;
    if (!parent) return;
    const original = node.data;
    const wrap = document.createElement("span");
    wrap.setAttribute(OWN_ATTR, "");
    wrap.setAttribute(EDITING_ATTR, "");
    wrap.setAttribute("contenteditable", "plaintext-only");
    if (wrap.contentEditable !== "plaintext-only") wrap.setAttribute("contenteditable", "true");
    wrap.spellcheck = false;
    wrap.style.cssText = "outline:1px dashed currentColor;outline-offset:2px;border-radius:2px;cursor:text;user-select:text;-webkit-user-select:text;pointer-events:auto;";
    parent.insertBefore(wrap, node);
    wrap.appendChild(node);
    setEditing(node, original);
    cur = { node, wrap, original, send, live: false, timer: 0 };
    for (const t2 of GUARDED) window.addEventListener(t2, guard, true);
    wrap.addEventListener("input", onInput);
    wrap.addEventListener("blur", onBlur);
    wrap.focus({ preventScroll: true });
    const sel = getSelection();
    if (sel) {
      const r = document.createRange();
      r.setStart(node, Math.min(offset, node.length));
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }
  function guard(e) {
    const c = cur;
    if (!c || !(e.target instanceof Node) || !c.wrap.contains(e.target)) return;
    if (e instanceof KeyboardEvent) {
      if (e.type === "keydown" && !e.isComposing && e.keyCode !== 229) {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }
    } else if (e.type === "click" || e.type === "auxclick") {
      e.preventDefault();
    }
    e.stopImmediatePropagation();
  }
  function onInput() {
    const c = cur;
    if (!c) return;
    clearTimeout(c.timer);
    c.timer = window.setTimeout(() => {
      if (cur !== c) return;
      c.live = true;
      c.send(clean(c.wrap.textContent ?? "") || c.original.trim(), "live");
    }, 150);
  }
  function onBlur() {
    finish(true);
  }
  function finish(commit) {
    const c = cur;
    if (!c) return;
    cur = null;
    clearTimeout(c.timer);
    for (const t2 of GUARDED) window.removeEventListener(t2, guard, true);
    c.wrap.removeEventListener("input", onInput);
    c.wrap.removeEventListener("blur", onBlur);
    const typed = clean(c.wrap.textContent ?? "");
    const value = commit && typed ? typed : c.original.trim();
    const changed = value !== c.original.trim();
    c.node.data = fill(c.original, value);
    if (c.wrap.isConnected) c.wrap.replaceWith(c.node);
    endEditing(c.node, c.original, changed);
    getSelection()?.removeAllRanges();
    if (changed || c.live) c.send(value, "commit");
  }

  // src/specificity.ts
  var ZERO = [0, 0, 0];
  var LEGACY_PSEUDO_ELEMENTS = /* @__PURE__ */ new Set(["before", "after", "first-line", "first-letter"]);
  var FORGIVING = /* @__PURE__ */ new Set(["is", "not", "has", "matches", "any", "-webkit-any"]);
  function isHex(ch) {
    return /[0-9a-f]/i.test(ch);
  }
  function isIdentChar(ch) {
    return /[A-Za-z0-9_-]/.test(ch) || ch.charCodeAt(0) > 127;
  }
  function skipIdent(s, i) {
    while (i < s.length) {
      const ch = s[i];
      if (ch === "\\") {
        i++;
        if (i < s.length && isHex(s[i])) {
          let n = 0;
          while (i < s.length && n < 6 && isHex(s[i])) {
            i++;
            n++;
          }
          if (s[i] === " ") i++;
        } else i++;
        continue;
      }
      if (isIdentChar(ch)) i++;
      else break;
    }
    return i;
  }
  function readGroup(s, i, open, close) {
    let depth = 0;
    const start = i + 1;
    let quote = null;
    for (; i < s.length; i++) {
      const ch = s[i];
      if (ch === "\\") {
        i++;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return [s.slice(start, i), i + 1];
      }
    }
    return [s.slice(start), s.length];
  }
  function compareSpec(a, b) {
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  }
  function add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }
  function maxSpecificity(list) {
    let best = ZERO;
    for (const part2 of splitTopLevel(list)) {
      const s = specificity(part2);
      if (compareSpec(s, best) > 0) best = s;
    }
    return best;
  }
  function specificity(sel) {
    let spec = [0, 0, 0];
    let i = 0;
    while (i < sel.length) {
      const ch = sel[i];
      if (ch === "\\") {
        spec = add(spec, [0, 0, 1]);
        i = skipIdent(sel, i);
      } else if (ch === "#") {
        spec = add(spec, [1, 0, 0]);
        i = skipIdent(sel, i + 1);
      } else if (ch === ".") {
        spec = add(spec, [0, 1, 0]);
        i = skipIdent(sel, i + 1);
      } else if (ch === "[") {
        spec = add(spec, [0, 1, 0]);
        i = readGroup(sel, i, "[", "]")[1];
      } else if (ch === ":") {
        if (sel[i + 1] === ":") {
          spec = add(spec, [0, 0, 1]);
          i = skipIdent(sel, i + 2);
          if (sel[i] === "(") i = readGroup(sel, i, "(", ")")[1];
          continue;
        }
        const end = skipIdent(sel, i + 1);
        const name = sel.slice(i + 1, end).toLowerCase();
        i = end;
        if (LEGACY_PSEUDO_ELEMENTS.has(name)) {
          spec = add(spec, [0, 0, 1]);
        } else if (sel[i] === "(") {
          const [args, next] = readGroup(sel, i, "(", ")");
          i = next;
          if (name === "where") {
          } else if (FORGIVING.has(name)) {
            spec = add(spec, maxSpecificity(args));
          } else if (name === "nth-child" || name === "nth-last-child") {
            spec = add(spec, [0, 1, 0]);
            const of = /\sof\s/i.exec(args);
            if (of) spec = add(spec, maxSpecificity(args.slice(of.index + of[0].length)));
          } else {
            spec = add(spec, [0, 1, 0]);
          }
        } else {
          spec = add(spec, [0, 1, 0]);
        }
      } else if (isIdentChar(ch) && !/[0-9]/.test(ch)) {
        spec = add(spec, [0, 0, 1]);
        i = skipIdent(sel, i);
      } else {
        i++;
      }
    }
    return spec;
  }
  var DYNAMIC_PSEUDO = /:(?:hover|focus|focus-visible|focus-within|active|visited|target|checked|indeterminate|placeholder-shown|autofill|user-invalid|user-valid|open|popover-open)\b/g;
  function staticSelector(sel) {
    return sel.replace(DYNAMIC_PSEUDO, "");
  }

  // src/cascade.ts
  var has = (name) => typeof globalThis[name] === "function";
  function mediaMatches(text) {
    if (!text || text === "all") return true;
    try {
      return matchMedia(text).matches;
    } catch {
      return true;
    }
  }
  function supports(text) {
    try {
      return CSS.supports(text);
    } catch {
      return true;
    }
  }
  function collectRules(skipSheet) {
    const rules = [];
    const layerOrder = /* @__PURE__ */ new Map();
    let order = 0;
    let anon = 0;
    const regLayer = (name) => {
      if (!layerOrder.has(name)) layerOrder.set(name, layerOrder.size);
    };
    const push = (style, rule, selector, fullSelector, path, ctx) => {
      rules.push({
        style,
        rule,
        sheetIndex: ctx.sheetIndex,
        topSheet: ctx.topSheet,
        ownerSheet: ctx.ownerSheet,
        path,
        selector,
        fullSelector,
        branches: splitTopLevel(fullSelector),
        conditions: ctx.conditions,
        layer: ctx.layer,
        layerRank: 0,
        order: order++,
        ordinal: 0,
        active: ctx.active
      });
    };
    const walk = (list, ctx) => {
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        const path = [...ctx.path, i];
        if (r instanceof CSSStyleRule) {
          const full = resolveNested(ctx.parent, r.selectorText);
          push(r.style, r, r.selectorText, full, path, ctx);
          const nested = r.cssRules;
          if (nested && nested.length) walk(nested, { ...ctx, path, parent: full });
        } else if (has("CSSNestedDeclarations") && r instanceof globalThis.CSSNestedDeclarations) {
          if (ctx.parent) push(r.style, r, "&", ctx.parent, path, ctx);
        } else if (r instanceof CSSMediaRule) {
          const text = r.media.mediaText;
          walk(r.cssRules, { ...ctx, path, conditions: [...ctx.conditions, `@media ${text}`], active: ctx.active && mediaMatches(text) });
        } else if (r instanceof CSSSupportsRule) {
          walk(r.cssRules, { ...ctx, path, conditions: [...ctx.conditions, `@supports ${r.conditionText}`], active: ctx.active && supports(r.conditionText) });
        } else if (has("CSSLayerBlockRule") && r instanceof CSSLayerBlockRule) {
          const name = r.name || `<anon-${anon++}>`;
          const full = ctx.layer ? `${ctx.layer}.${name}` : name;
          regLayer(full);
          walk(r.cssRules, { ...ctx, path, conditions: [...ctx.conditions, `@layer ${r.name}`], layer: full });
        } else if (has("CSSLayerStatementRule") && r instanceof CSSLayerStatementRule) {
          for (const n of r.nameList) regLayer(ctx.layer ? `${ctx.layer}.${n}` : n);
        } else if (r instanceof CSSImportRule) {
          let sub = null;
          try {
            sub = r.styleSheet;
            if (sub) void sub.cssRules;
          } catch {
            sub = null;
          }
          if (!sub) continue;
          const media = r.media ? r.media.mediaText : "";
          const lname = r.layerName;
          let layer = ctx.layer;
          if (lname != null) {
            const n = lname || `<anon-${anon++}>`;
            layer = ctx.layer ? `${ctx.layer}.${n}` : n;
            regLayer(layer);
          }
          walk(sub.cssRules, {
            ...ctx,
            ownerSheet: sub,
            path,
            conditions: media ? [...ctx.conditions, `@import ${media}`] : ctx.conditions,
            layer,
            active: ctx.active && mediaMatches(media)
          });
        } else if (has("CSSContainerRule") && r instanceof globalThis.CSSContainerRule) {
          walk(r.cssRules, { ...ctx, path, conditions: [...ctx.conditions, `@container ${r.conditionText}`] });
        }
      }
    };
    const sheets = Array.from(document.styleSheets);
    sheets.forEach((sheet, sheetIndex) => {
      if (sheet.disabled || skipSheet(sheet)) return;
      let list;
      try {
        list = sheet.cssRules;
      } catch {
        return;
      }
      const media = sheet.media ? sheet.media.mediaText : "";
      walk(list, { topSheet: sheet, ownerSheet: sheet, sheetIndex, path: [], conditions: [], layer: null, parent: null, active: mediaMatches(media) });
    });
    const seen = /* @__PURE__ */ new Map();
    for (const r of rules) {
      r.layerRank = r.layer == null ? Infinity : layerOrder.get(r.layer) ?? 0;
      const key2 = `${r.sheetIndex}|${r.fullSelector}|${r.conditions.join("|")}`;
      r.ordinal = seen.get(key2) ?? 0;
      seen.set(key2, r.ordinal + 1);
    }
    return { rules, layerOrder };
  }
  var INTERACTIVE = /:(hover|active|focus|focus-visible|focus-within)(?![\w-])/;
  function matchRules(el, idx) {
    const out2 = [];
    for (const fr of idx.rules) {
      if (!fr.active) continue;
      let best = null;
      for (const branch of fr.branches) {
        if (INTERACTIVE.test(branch)) continue;
        let ok = false;
        try {
          ok = el.matches(branch);
        } catch {
          ok = false;
        }
        if (ok) {
          const s = specificity(branch);
          if (!best || compareSpec(s, best) > 0) best = s;
        }
      }
      if (best) out2.push({ fr, spec: best });
    }
    return out2;
  }
  function namesOf(fr) {
    if (!fr.names) {
      const m = /* @__PURE__ */ new Map();
      for (let i = 0; i < fr.style.length; i++) m.set(fr.style[i], i);
      fr.names = m;
    }
    return fr.names;
  }
  var plain = (style, prop) => ({ value: style.getPropertyValue(prop), priority: style.getPropertyPriority(prop) });
  var plainReader = () => null;
  function readDecl(fr, prop, reader = plainReader) {
    const names = namesOf(fr);
    let best = null;
    for (const alias of aliasesOf(prop)) {
      const got = reader(fr.style, alias);
      if (got === "absent") continue;
      const idx = got?.index ?? names.get(alias);
      if (idx === void 0) continue;
      const r = got ?? plain(fr.style, alias);
      let value = r.value;
      let shorthand = null;
      let important = r.priority === "important";
      if (value === "") {
        for (const sh of shorthandsOf(alias)) {
          const sg = reader(fr.style, sh);
          const s = sg === "absent" ? { value: "", priority: "" } : sg ?? plain(fr.style, sh);
          if (s.value) {
            value = s.value;
            shorthand = sh;
            important = s.priority === "important";
            break;
          }
        }
        if (value === "") continue;
      }
      const d = { value, important, index: idx, via: alias, shorthand };
      if (!best || d.index > best.index) best = d;
    }
    return best;
  }
  function pickWinner(el, matched, prop, reader = plainReader) {
    let best = null;
    const consider = (w, key2) => {
      if (!best) {
        best = { w, key: key2 };
        return;
      }
      for (let i = 0; i < key2.length; i++) {
        if (key2[i] !== best.key[i]) {
          if (key2[i] > best.key[i]) best = { w, key: key2 };
          return;
        }
      }
      best = { w, key: key2 };
    };
    for (const m of matched) {
      const d = readDecl(m.fr, prop, reader);
      if (!d) continue;
      const rank = d.important ? -m.fr.layerRank : m.fr.layerRank;
      consider({ decl: d, fr: m.fr, inline: false }, [d.important ? 1 : 0, 0, rank, m.spec[0], m.spec[1], m.spec[2], m.fr.order, d.index]);
    }
    const inlineStyle = el.style;
    if (inlineStyle && inlineStyle.length) {
      const d = readDecl({ style: inlineStyle }, prop, reader);
      if (d && d.value !== "") consider({ decl: d, fr: null, inline: true }, [d.important ? 1 : 0, 1, 0, 0, 0, 0, Infinity, d.index]);
    }
    return best ? best.w : null;
  }

  // src/drop.ts
  function dropSlot(boxes, x, y, axis) {
    let best = 0;
    let dist = Infinity;
    boxes.forEach((b2, i) => {
      const dx = Math.max(b2.left - x, 0, x - b2.right);
      const dy = Math.max(b2.top - y, 0, y - b2.bottom);
      const d = Math.hypot(dx, dy);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    const b = boxes[best];
    const after = axis === "y" ? y > b.top + b.height / 2 : x > b.left + b.width / 2;
    return best + (after ? 1 : 0);
  }
  function slotLine(boxes, slot, axis) {
    const prev = boxes[slot - 1];
    const next = boxes[slot];
    if (axis === "y") {
      const y = prev && next ? (prev.bottom + next.top) / 2 : prev ? prev.bottom + 2 : next.top - 2;
      const ref2 = next ?? prev;
      return { x: ref2.left, y: y - 1, w: ref2.width, h: 2 };
    }
    const x = prev && next && Math.abs(prev.top - next.top) < Math.min(prev.height, next.height) / 2 ? (prev.right + next.left) / 2 : next ? next.left - 2 : prev.right + 2;
    const ref = next ?? prev;
    return { x: x - 1, y: ref.top, w: 2, h: ref.height };
  }
  var onSameRow = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.height, b.height) / 2;
  function flowOffsets(boxes, order, axis) {
    const out2 = boxes.map(() => [0, 0]);
    const linear = boxes.every((b, k) => k === 0 || onSameRow(boxes[k - 1], b) === (axis === "x"));
    if (!linear) {
      order.forEach((i, k) => {
        out2[i] = [boxes[k].left - boxes[i].left, boxes[k].top - boxes[i].top];
      });
      return out2;
    }
    const lead = (b) => axis === "y" ? b.top : b.left;
    const size = (b) => axis === "y" ? b.height : b.width;
    let pos = lead(boxes[0]);
    for (let k = 0; k < boxes.length; k++) {
      const i = order[k];
      const d = pos - lead(boxes[i]);
      out2[i] = axis === "x" ? [d, 0] : [0, d];
      pos += size(boxes[i]);
      if (k + 1 < boxes.length) pos += lead(boxes[k + 1]) - (lead(boxes[k]) + size(boxes[k]));
    }
    return out2;
  }

  // src/sig.ts
  function charPrint(s) {
    const counts2 = /* @__PURE__ */ new Map();
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      counts2.set(c, (counts2.get(c) ?? 0) + 1);
    }
    let h = 2166136261;
    for (const c of [...counts2.keys()].sort((a, b) => a - b)) {
      h = Math.imul(h ^ c, 16777619);
      h = Math.imul(h ^ counts2.get(c), 16777619);
    }
    return `${s.length}.${(h >>> 0).toString(36)}`;
  }
  var textSig = (tag2, text, extra) => text ? `${tag2}|t:${charPrint(text.replace(/\d/g, ""))}:${charPrint(text)}` : `${tag2}|a:${extra}`;
  var coarse = (sig) => /^[^|]*\|t:[^:]*/.exec(sig)?.[0] ?? sig;
  var coarseUnit = (sig) => sig.split(" + ").map(coarse).join(" + ");
  function sameOrder(got, want) {
    if (got.length !== want.length) return false;
    const cw = want.map(coarseUnit);
    const byCoarse = new Set(cw).size === cw.length;
    const same = (g, k2) => g === want[k2] || byCoarse && coarseUnit(g) === cw[k2];
    const off = got.flatMap((g, k2) => same(g, k2) ? [] : [k2]);
    if (off.length === 0) return true;
    if (off.length > 1 || want.length < 3) return false;
    const k = off[0];
    return !want.some((_, j) => same(got[k], j)) && !got.some((g) => same(g, k));
  }
  function hasRun(sigs, want) {
    const flat = want.flatMap((w) => w.split(" + ")).map(coarse);
    const cs = sigs.map(coarse);
    for (let i = 0; i + flat.length <= cs.length; i++) {
      let off = 0;
      for (let j = 0; j < flat.length && off < 2; j++) if (cs[i + j] !== flat[j]) off++;
      if (off < 2) return true;
    }
    return false;
  }

  // src/order.ts
  var FIXED = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "LINK", "TEMPLATE", "META", "NOSCRIPT", "BASE", "TITLE"]);
  var MAX_KIDS = 300;
  function movableKids(p) {
    return Array.from(p.children).filter((c) => !isOwnNode(c) && !FIXED.has(c.tagName.toUpperCase()));
  }
  var MAX_TEXT = 2e4;
  function textIn(el, max) {
    let text = "";
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n && text.length < max; n = walker.nextNode()) {
      if (!isOwnNode(n.parentElement)) text += baseOf(n);
    }
    return text;
  }
  var extraOf = (el) => el.getAttribute("aria-label") ?? el.getAttribute("alt") ?? el.getAttribute("src") ?? el.getAttribute("href") ?? el.id ?? "";
  var sigOf = (el) => textSig(el.tagName.toLowerCase(), textIn(el, MAX_TEXT).replace(/\s+/g, ""), extraOf(el));
  function shortOf(el) {
    const text = textIn(el, 80).replace(/\s+/g, " ").trim();
    if (!text) return `<${el.tagName.toLowerCase()}>`;
    return text.length > 20 ? `${text.slice(0, 20)}\u2026` : text;
  }
  var hostOf = (f, p) => f.stateNode === p || f.stateNode?.containerInfo === p;
  function pathOf(kid, p) {
    const out2 = [];
    let f = fiberOf(kid);
    for (let guard3 = 0; f && guard3 < 200; guard3++) {
      out2.push(f);
      const up = f.return;
      if (!up) return null;
      if (hostOf(up, p)) return out2.reverse();
      f = up;
    }
    return null;
  }
  var sameFiber = (a, b) => a === b || a.alternate === b;
  var FRAGMENT2 = 7;
  async function unitSource(f, home) {
    let own2 = await fiberSource(f);
    if (!own2 && typeof f.type !== "string") {
      for (let c = f.child; c; c = c.child) {
        if (typeof c.type === "string") {
          own2 = await fiberSource(c);
          break;
        }
      }
    }
    if (!own2 || !home || own2.path === home) return own2;
    let n = ownerOf(f);
    for (let i = 0; n && i < 8; i++, n = ownerOf(n)) {
      const s = await fiberSource(n);
      if (s?.path === home) return s;
    }
    return own2;
  }
  async function reactUnits(p, kids2) {
    const paths = [];
    for (const kid of kids2) {
      const path = pathOf(kid, p);
      if (path) paths.push({ kid, path });
    }
    let depth = 0;
    while (paths.length > 1) {
      const f = paths[0].path[depth];
      if (!paths.every((x) => x.path.length > depth + 1 && sameFiber(x.path[depth], f))) break;
      depth++;
    }
    const out2 = [];
    for (const { kid, path } of paths) {
      const f = path[Math.min(depth, path.length - 1)];
      let u = out2.find((x) => sameFiber(x.fiber, f));
      if (!u) {
        u = { els: [], source: null, name: "", fiber: f };
        out2.push(u);
      }
      u.els.push(kid);
    }
    const host2 = fiberOf(p);
    const home = host2 ? (await fiberSource(host2))?.path ?? null : null;
    await Promise.all(
      out2.map(async (u) => {
        u.source = await unitSource(u.fiber, home);
        u.name = typeof u.fiber.type === "string" ? u.fiber.type : nameOf(u.fiber) ?? "";
      })
    );
    return out2;
  }
  var keyOf = (u) => u.source ? locKey(u.source) : null;
  var plain2 = ({ els, source, name }) => ({ els, source, name });
  async function groupOf(p, mapped) {
    const kids2 = movableKids(p);
    if (kids2.length > MAX_KIDS) return [];
    if (!kids2.some((k) => fiberOf(k))) return kids2.map((el) => ({ els: [el], source: null, name: el.tagName.toLowerCase() }));
    const units = await reactUnits(p, kids2);
    if (mapped) {
      const direct = units.filter((u) => u.fiber.tag !== FRAGMENT2 && keyOf(u) === mapped);
      if (direct.length > 1) return direct.map(plain2);
      const frag = units.find((u) => u.fiber.tag === FRAGMENT2 && keyOf(u) === mapped);
      if (frag) return (await reactUnits(p, frag.els)).filter((u) => keyOf(u) === mapped).map(plain2);
      return direct.map(plain2);
    }
    const merged = [];
    const at = /* @__PURE__ */ new Map();
    for (const u of units) {
      const k = keyOf(u);
      const same = k ? at.get(k) : void 0;
      if (same) same.els.push(...u.els);
      else {
        const copy = { ...plain2(u), els: [...u.els] };
        merged.push(copy);
        if (k) at.set(k, copy);
      }
    }
    return merged;
  }
  var indexIn = (units, el) => units.findIndex((u) => u.els.includes(el));
  function boxOf(u) {
    let l = Infinity, t2 = Infinity, r = -Infinity, b = -Infinity;
    for (const e of u.els) {
      const x = e.getBoundingClientRect();
      if (!x.width && !x.height) continue;
      l = Math.min(l, x.left);
      t2 = Math.min(t2, x.top);
      r = Math.max(r, x.right);
      b = Math.max(b, x.bottom);
    }
    return l === Infinity ? null : new DOMRect(l, t2, r - l, b - t2);
  }
  function layoutOf(p, units) {
    const cs = getComputedStyle(p);
    if (/flex/.test(cs.display)) return { layout: "flex", axis: cs.flexDirection.startsWith("column") ? "y" : "x" };
    const [a, b] = [units[0] && boxOf(units[0]), units[1] && boxOf(units[1])];
    const sameRow = !!a && !!b && Math.abs(b.top - a.top) < Math.min(a.height, b.height) / 2 && b.left !== a.left;
    return { layout: /grid/.test(cs.display) ? "grid" : "flow", axis: sameRow ? "x" : "y" };
  }
  async function orderInfo(el) {
    const p = el.parentElement;
    if (!p || p === document.documentElement || isOwnNode(el) || FIXED.has(el.tagName.toUpperCase())) return void 0;
    const react = !!fiberOf(el);
    let units = await groupOf(p, null);
    let mapped = null;
    const self = units[indexIn(units, el)];
    if (react && self) {
      const k = keyOf(self);
      const all = k ? await groupOf(p, k) : [];
      if (all.length > 1) {
        units = all;
        mapped = k;
      }
    }
    const index = indexIn(units, el);
    if (units.length < 2 || index < 0) return void 0;
    const out2 = units.map((u) => {
      const text = textOf(u.els[0]);
      return {
        uids: u.els.map(uidOf),
        label: u.els.length > 1 ? `${labelOf(u.els[0])} \xD7${u.els.length}` : labelOf(u.els[0]),
        ...text ? { text } : {},
        source: u.source,
        name: u.name,
        sig: u.els.map(sigOf).join(" + ")
      };
    });
    return { units: out2, index, ...layoutOf(p, units), mapped, htmlPath: isPlainHtml(el) ? htmlPathOf(el) : null };
  }
  var unitSig = (u) => u.els.map(sigOf).join(" + ");
  var unitShort = (u) => u.els.map(shortOf).join(" + ");
  async function groupsIn(p, n, mapped) {
    const block2 = await groupOf(p, null);
    if (!mapped) return block2.length === n ? [block2] : [];
    const out2 = [];
    const direct = await groupOf(p, mapped);
    if (direct.length === n) out2.push(direct);
    const keys = new Set(block2.filter((u) => u.els.length > 1 && u.source).map((u) => locKey(u.source)));
    keys.delete(mapped);
    for (const k of keys) {
      const g = await groupOf(p, k);
      if (g.length === n) out2.push(g);
    }
    return out2;
  }
  async function matchIn(p, want, mapped) {
    if (!p?.isConnected) return null;
    for (const g of await groupsIn(p, want.length, mapped)) {
      if (sameOrder(g.map(unitSig), want)) return g;
    }
    return null;
  }
  async function findGroup(want, mapped) {
    const count = want.reduce((n, w) => n + w.split(" + ").length, 0);
    for (const el of document.body.querySelectorAll("*")) {
      if (el.childElementCount < count || isOwnNode(el)) continue;
      if (!hasRun(movableKids(el).map(sigOf), want)) continue;
      const units = await matchIn(el, want, mapped);
      if (units) return { p: el, units };
    }
    return null;
  }
  var styled = (e) => e instanceof HTMLElement || e instanceof SVGElement;
  function layOut(p, units, order, out2) {
    const { layout, axis } = layoutOf(p, units);
    if (layout !== "flow") {
      const slot = /* @__PURE__ */ new Map();
      units.forEach((u, i) => u.els.forEach((e) => slot.set(e, i)));
      let n = 0;
      let k = 0;
      for (const kid of Array.from(p.children)) {
        if (isOwnNode(kid)) continue;
        const i = slot.get(kid);
        if (i === void 0) {
          if (styled(kid)) out2.set(kid, { order: String(n) });
          n++;
          continue;
        }
        if (kid !== units[i].els[0]) continue;
        for (const e of units[order[k++]].els) {
          if (styled(e)) out2.set(e, { order: String(n) });
          n++;
        }
      }
      return;
    }
    const boxes = units.map(boxOf);
    if (boxes.some((b) => !b)) return;
    flowOffsets(boxes, order, axis).forEach(([dx, dy], i) => {
      for (const e of units[i].els) if (styled(e) && (dx || dy)) out2.set(e, shift(e, dx, dy));
    });
  }
  function shift(e, dx, dy) {
    const cs = getComputedStyle(e);
    if (cs.display === "inline") {
      if (cs.position !== "static" && cs.position !== "relative") return {};
      const base = (side) => cs.position === "relative" ? parseFloat(cs.getPropertyValue(side)) || 0 : 0;
      return { position: "relative", ...dy ? { top: `${base("top") + dy}px` } : {}, ...dx ? { left: `${base("left") + dx}px` } : {} };
    }
    const move2 = `translate(${dx}px, ${dy}px)`;
    return { transform: cs.transform && cs.transform !== "none" ? `${move2} ${cs.transform}` : move2 };
  }
  function parentOf2(target2) {
    const el = elOf(target2.uid) ?? (target2.htmlPath ? elementAtPath(target2.htmlPath) : null);
    return el?.parentElement ?? null;
  }
  async function orderDecls(target2, hint) {
    const decls = /* @__PURE__ */ new Map();
    const parents = [];
    const found = elOf(target2.uid) ?? (target2.htmlPath ? elementAtPath(target2.htmlPath) : null);
    const p = found?.parentElement ?? (hint?.isConnected ? hint : null);
    if (!p) return { decls, parents };
    const base = await groupOf(p, target2.mapped);
    if (base.length !== target2.order.length) return { decls, parents };
    layOut(p, base, target2.order, decls);
    parents.push(p);
    const el = found && found.parentElement === p ? found : base[0].els[0];
    if (fiberOf(el)) {
      const shape = base.map(keyOf).join("|");
      for (const peer of await sameSourceElements(el)) {
        const q = peer.parentElement;
        if (!q || parents.includes(q)) continue;
        const units = await groupOf(q, target2.mapped);
        if (units.length === base.length && units.map(keyOf).join("|") === shape) {
          layOut(q, units, target2.order, decls);
          parents.push(q);
        }
      }
    }
    return { decls, parents };
  }
  async function fetchedKids(parentPath) {
    try {
      const html = await (await fetch(location.href, { cache: "no-store" })).text();
      let el = new DOMParser().parseFromString(html, "text/html").documentElement;
      for (const i of parentPath) el = el?.children[i] ?? null;
      if (!el) return null;
      const kids2 = movableKids(el);
      return { sigs: kids2.map(sigOf), shorts: kids2.map(shortOf) };
    } catch {
      return null;
    }
  }
  function arrange(p, want) {
    const kids2 = movableKids(p);
    const sigs = kids2.map(sigOf);
    const used = /* @__PURE__ */ new Set();
    const seq2 = [];
    for (const w of want) {
      let i = sigs.findIndex((s, k) => s === w && !used.has(k));
      if (i < 0) i = sigs.findIndex((s, k) => coarse(s) === coarse(w) && !used.has(k));
      if (i < 0) return false;
      used.add(i);
      seq2.push(kids2[i]);
    }
    if (seq2.length !== kids2.length) return false;
    const marks = kids2.map((k) => {
      const m = document.createComment("");
      p.insertBefore(m, k);
      return m;
    });
    seq2.forEach((e, k) => p.insertBefore(e, marks[k]));
    for (const m of marks) m.remove();
    return true;
  }
  function visibleBoxes(units, order) {
    return order.map((i) => boxOf({ els: units[i].map((u) => elOf(u)).filter((e) => !!e), source: null, name: "" }));
  }

  // src/props.ts
  var HIDDEN = /* @__PURE__ */ new Set(["children", "key", "ref", "className", "class", "style"]);
  var MAX_PROPS = 24;
  var isFiber = (n) => typeof n.tag === "number";
  var rootOf = (f) => {
    let n = f;
    for (let i = 0; n.return && i < 1e4; i++) n = n.return;
    return n;
  };
  function currentFiber(fiber) {
    const alternate = fiber.alternate;
    if (!alternate) return rootOf(fiber).tag === 3 ? fiber : null;
    const mounted = (f) => rootOf(f).tag === 3;
    let a = fiber;
    let b = alternate;
    for (let guard3 = 0; guard3 < 1e4; guard3++) {
      const parentA = a.return;
      if (!parentA) break;
      const parentB = parentA.alternate;
      if (!parentB) {
        const next = parentA.return;
        if (!next) break;
        a = b = next;
        continue;
      }
      if (parentA.child === parentB.child) {
        for (let c = parentA.child; c; c = c.sibling) {
          if (c === a) return mounted(parentA) ? fiber : null;
          if (c === b) return mounted(parentA) ? alternate : null;
        }
        return null;
      }
      if (a.return !== b.return) {
        a = parentA;
        b = parentB;
      } else {
        let found = false;
        for (const [p, q] of [
          [parentA, parentB],
          [parentB, parentA]
        ]) {
          for (let c = p.child; c && !found; c = c.sibling) {
            if (c === a) {
              found = true;
              a = p;
              b = q;
            } else if (c === b) {
              found = true;
              b = p;
              a = q;
            }
          }
          if (found) break;
        }
        if (!found) return null;
      }
      if (a.alternate !== b) return null;
    }
    if (a.tag !== 3) return null;
    return a.stateNode?.current === a ? fiber : alternate;
  }
  async function propsOwner(el) {
    const host2 = fiberOf(el);
    let n = host2 ? ownerOf(currentFiber(host2) ?? host2) : null;
    for (let i = 0; n && i < 16; i++, n = ownerOf(n)) {
      const source = await fiberSource(n);
      if (source) return { node: n, source, direct: i === 0 };
    }
    return null;
  }
  async function sameSite(node, source) {
    const cur2 = currentFiber(node);
    if (!cur2) return [];
    const top = rootOf(cur2);
    const start = top.stateNode?.current ?? top;
    const candidates = [];
    const stack = [start];
    for (let seen = 0; stack.length && seen < 5e4; seen++) {
      const n = stack.pop();
      if (n.type === cur2.type) candidates.push(n);
      if (n.sibling) stack.push(n.sibling);
      if (n.child) stack.push(n.child);
    }
    const want = locKey(source);
    const out2 = [];
    for (const n of candidates) {
      if (n === cur2) out2.push(n);
      else {
        const s = await fiberSource(n);
        if (s && locKey(s) === want) out2.push(n);
      }
    }
    return out2.length ? out2 : [cur2];
  }
  var REACT_ELEMENTS = /* @__PURE__ */ new Set([/* @__PURE__ */ Symbol.for("react.element"), /* @__PURE__ */ Symbol.for("react.transitional.element"), /* @__PURE__ */ Symbol.for("react.portal")]);
  function summaryOf(v) {
    if (v instanceof Promise) return "Promise";
    if (v instanceof Date) return "Date";
    let keys = [];
    try {
      keys = Object.keys(v);
    } catch {
    }
    return keys.length ? `{ ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", \u2026" : ""} }` : "{}";
  }
  function describe(name, v) {
    switch (typeof v) {
      case "string":
        return { name, type: "string", value: v };
      case "number":
        return Number.isFinite(v) ? { name, type: "number", value: v } : { name, type: "object", value: null, summary: String(v) };
      case "boolean":
        return { name, type: "boolean", value: v };
      case "undefined":
        return { name, type: "undefined", value: null };
      case "function":
        return { name, type: "function", value: null, summary: v.name ? `${v.name}()` : "() => \u2026" };
      case "object": {
        if (v === null) return { name, type: "null", value: null };
        if (REACT_ELEMENTS.has(v.$$typeof)) {
          const t2 = v.type;
          const tag2 = typeof t2 === "string" ? t2 : t2?.displayName || t2?.name || "Component";
          return { name, type: "element", value: null, summary: `<${tag2} />` };
        }
        if (Array.isArray(v)) return { name, type: "array", value: null, summary: `[${v.length}]` };
        return { name, type: "object", value: null, summary: summaryOf(v) };
      }
      default:
        return { name, type: "object", value: null, summary: String(v) };
    }
  }
  var entries2 = /* @__PURE__ */ new Map();
  var ours = /* @__PURE__ */ new WeakMap();
  var samePair = (a, b) => a === b || a.alternate === b;
  var oursOf = (f) => ours.get(f) ?? (f.alternate ? ours.get(f.alternate) : void 0);
  function put(cur2, next) {
    if (cur2.alternate) ours.delete(cur2.alternate);
    ours.set(cur2, next);
    replaceProps(cur2, next);
  }
  var isOurs = (cur2) => {
    const p = cur2.memoizedProps;
    return !!p && typeof p === "object" && oursOf(cur2) === p;
  };
  async function resolveInstances(target2) {
    if (!canOverride()) return [];
    let el = elOf(target2.uid);
    if ((!el || !el.isConnected) && target2.anchor) el = await findBySource(target2.anchor.path, target2.anchor.line, target2.anchor.column, target2.anchor.index);
    const owner = el && await propsOwner(el);
    if (!owner || !isFiber(owner.node)) return [];
    return (await sameSite(owner.node, owner.source)).map((f) => {
      const props = f.memoizedProps ?? {};
      return { fiber: f, had: Object.prototype.hasOwnProperty.call(props, target2.name), original: props[target2.name] };
    });
  }
  function show(e) {
    for (const inst of e.instances) {
      const cur2 = currentFiber(inst.fiber);
      const props = cur2?.memoizedProps;
      if (cur2 && props && props[e.target.name] !== e.value) put(cur2, { ...props, [e.target.name]: e.value });
    }
  }
  async function previewProp(id, target2, value) {
    let e = entries2.get(id);
    if (e && e.target.name !== target2.name) {
      clearProp(id);
      e = void 0;
    }
    if (!e) {
      const instances = await resolveInstances(target2);
      if (!instances.length) return 0;
      e = { id, target: target2, value, instances };
      entries2.set(id, e);
    }
    e.target = target2;
    e.value = value;
    show(e);
    onCommit(scheduleReapply);
    return e.instances.length;
  }
  var queued = false;
  function scheduleReapply() {
    if (queued || !entries2.size) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      reapplyProps();
    });
  }
  function reapplyProps() {
    const groups = /* @__PURE__ */ new Map();
    for (const e of entries2.values()) {
      e.instances = e.instances.filter((inst) => !!currentFiber(inst.fiber));
      if (!e.instances.length) {
        void reattach(e);
        continue;
      }
      for (const inst of e.instances) {
        const cur2 = currentFiber(inst.fiber);
        const key2 = [...groups.keys()].find((k) => samePair(k, cur2)) ?? cur2;
        const g = groups.get(key2) ?? /* @__PURE__ */ new Map();
        g.set(e.target.name, e.value);
        groups.set(key2, g);
      }
    }
    for (const [cur2, want] of groups) {
      const props = cur2.memoizedProps;
      if (!props || isOurs(cur2)) continue;
      if ([...want].every(([k, v]) => props[k] === v)) continue;
      put(cur2, { ...props, ...Object.fromEntries(want) });
    }
  }
  async function reattach(e) {
    if (e.lostAt && Date.now() - e.lostAt < 300) return;
    e.lostAt = Date.now();
    const instances = await resolveInstances(e.target);
    if (!instances.length || entries2.get(e.id) !== e) return;
    e.instances = instances;
    show(e);
  }
  function clearProp(id) {
    const e = entries2.get(id);
    if (!e) return false;
    entries2.delete(id);
    for (const inst of e.instances) {
      const cur2 = currentFiber(inst.fiber);
      if (!cur2 || !isOurs(cur2)) continue;
      const next = { ...cur2.memoizedProps };
      if (inst.had) next[e.target.name] = inst.original;
      else delete next[e.target.name];
      put(cur2, next);
    }
    if (!entries2.size) onCommit(null);
    return true;
  }
  function clearAllProps() {
    const n = entries2.size;
    for (const id of Array.from(entries2.keys())) clearProp(id);
    return n;
  }
  var hasPropPreview = (id) => entries2.has(id);
  function baseOf2(cur2, name, value) {
    for (const e of entries2.values()) {
      if (e.target.name !== name) continue;
      const inst = e.instances.find((i) => samePair(i.fiber, cur2));
      if (inst) return { had: inst.had, value: inst.original };
    }
    return { had: true, value };
  }
  async function propsInfo(el) {
    const owner = await propsOwner(el);
    if (!owner) return void 0;
    const { node, source, direct } = owner;
    const server = !isFiber(node);
    const cur2 = server ? node : currentFiber(node);
    const raw = cur2 ? server ? cur2.props : cur2.memoizedProps : null;
    if (!cur2 || !raw || typeof raw !== "object") return void 0;
    const props = [];
    for (const name of Object.keys(raw)) {
      if (HIDDEN.has(name) || name.startsWith("data-")) continue;
      const base = server ? { had: true, value: raw[name] } : baseOf2(cur2, name, raw[name]);
      if (!base.had) continue;
      props.push(describe(name, base.value));
      if (props.length >= MAX_PROPS) break;
    }
    return {
      component: nameOf(node) ?? "?",
      source,
      props,
      server,
      live: !server && canOverride(),
      same: server ? 1 : (await sameSite(node, source)).length,
      direct
    };
  }
  var asJson = (v) => v === void 0 ? "undefined" : JSON.stringify(v) ?? "null";
  async function probeProp(id, target2, expected, refind) {
    const want = expected[target2.name];
    const known2 = elOf(target2.uid);
    const el = known2?.isConnected ? known2 : await refind();
    const owner = el && await propsOwner(el);
    let value = null;
    let fresh = false;
    if (owner && !isFiber(owner.node)) {
      value = asJson(owner.node.props?.[target2.name]);
      fresh = true;
    } else if (owner) {
      const cur2 = currentFiber(owner.node);
      const props = cur2?.memoizedProps;
      if (cur2 && props) {
        value = asJson(props[target2.name]);
        fresh = !isOurs(cur2);
      }
    }
    const ok = fresh && value === want;
    if (ok) clearProp(id);
    return { ok, actual: { [target2.name]: value ?? "" }, attached: ok || entries2.has(id), found: !!el };
  }

  // src/preview.ts
  var entries3 = /* @__PURE__ */ new Map();
  var saved = /* @__PURE__ */ new Map();
  var probeHost = () => document.createElement("div");
  function keyOf2(h) {
    return h.kind === "inline" ? h.el : h.style;
  }
  function save(h) {
    const k = keyOf2(h);
    if (saved.has(k)) return;
    const original = h.kind === "inline" ? h.el.getAttribute("style") : h.style.cssText;
    const probe2 = probeHost().style;
    probe2.cssText = original ?? "";
    saved.set(k, { holder: h, original, probe: probe2 });
  }
  function styleOf(h) {
    return h.kind === "inline" ? h.el.style : h.style;
  }
  function write(h, decls) {
    const style = styleOf(h);
    for (const [prop, value] of Object.entries(decls)) {
      if (h.kind === "inline") style.setProperty(prop, value, "important");
      else style.setProperty(prop, value, style.getPropertyPriority(prop));
    }
  }
  function restore(k) {
    const s = saved.get(k);
    if (!s) return;
    if (s.holder.kind === "inline") {
      if (s.original == null) s.holder.el.removeAttribute("style");
      else s.holder.el.setAttribute("style", s.original);
    } else {
      s.holder.style.cssText = s.original ?? "";
    }
  }
  var originalReader = (style, prop) => {
    for (const s of saved.values()) {
      if (styleOf(s.holder) !== style) continue;
      let index = -1;
      for (let i = 0; i < s.probe.length; i++) if (s.probe[i] === prop) index = i;
      if (index < 0 && !s.probe.getPropertyValue(prop)) return "absent";
      return { value: s.probe.getPropertyValue(prop), priority: s.probe.getPropertyPriority(prop), ...index >= 0 ? { index } : {} };
    }
    return null;
  };
  function walkPath(sheet, path) {
    let list;
    try {
      list = sheet.cssRules;
    } catch {
      return null;
    }
    let cur2 = null;
    for (const i of path) {
      cur2 = list[i] ?? null;
      if (!cur2) return null;
      if (cur2 instanceof CSSImportRule) {
        if (!cur2.styleSheet) return null;
        list = cur2.styleSheet.cssRules;
      } else if ("cssRules" in cur2) {
        list = cur2.cssRules;
      }
    }
    return cur2;
  }
  function sheetMatches(sheet, ref) {
    if (ref.devId) return sheetDevId(sheet) === ref.devId;
    if (ref.href) return sheet.href === ref.href || stripQ(sheet.href) === stripQ(ref.href);
    return true;
  }
  function stripQ(u) {
    return u ? u.split("?")[0] : u;
  }
  function resolveRule(ref) {
    const sheets = Array.from(document.styleSheets);
    const direct = sheets[ref.sheet.index];
    if (direct && sheetMatches(direct, ref.sheet)) {
      const r = walkPath(direct, ref.path);
      if (r && r.style && (r.selectorText === ref.selector || ref.selector === "&" && !r.selectorText)) return r.style;
    }
    const idx = collectRules(isOwnSheet);
    const hit = idx.rules.find(
      (fr) => fr.selector === ref.selector && fr.conditions.join("|") === ref.conditions.join("|") && sheetMatches(fr.topSheet, ref.sheet)
    );
    return hit ? hit.style : null;
  }
  async function holdersFor(target2) {
    if (target2.kind === "inline") {
      const el = elOf(target2.uid);
      if (!el) return [];
      let els = target2.sourceKey ? await sameSourceElements(el, target2.depth ?? 0) : [el];
      if (target2.withClass) els = els.filter((e) => e === el || e.classList.contains(target2.withClass));
      return els.filter((e) => e instanceof HTMLElement || e instanceof SVGElement).map((e) => ({ kind: "inline", el: e }));
    }
    if (target2.kind === "rule") {
      const style = resolveRule(target2.rule);
      return style ? [{ kind: "rule", style }] : [];
    }
    return [];
  }
  function reapply(k) {
    restore(k);
    let any = false;
    for (const e of entries3.values()) {
      for (const h of e.holders) {
        if (keyOf2(h) === k) {
          write(h, h.kind === "inline" && e.per?.get(h.el) || e.decls);
          any = true;
        }
      }
    }
    if (!any) saved.delete(k);
  }
  var chain = Promise.resolve();
  function preview(id, target2, decls, text = "", prop = null) {
    const run = chain.then(() => {
      if (target2.kind === "text") return previewText(id, target2, text);
      if (target2.kind === "order") return previewOrder(id, target2);
      if (target2.kind === "props") return previewProp(id, target2, prop);
      return doPreview(id, target2, decls);
    });
    chain = run.catch(() => void 0);
    return run;
  }
  var shapeOf = (parents) => parents.map((p) => p.isConnected ? movableKids(p).map(uidOf).join(",") : "-").join("|");
  async function previewOrder(id, target2, hint) {
    const old = entries3.get(id);
    if (old) clearPreview(id);
    const { decls, parents } = await orderDecls(target2, hint ?? old?.parents?.[0]);
    if (!parents.length) return 0;
    const holders = [...decls.keys()].map((el) => ({ kind: "inline", el }));
    for (const h of holders) save(h);
    entries3.set(id, { id, target: target2, decls: {}, holders, per: decls, parents, shape: shapeOf(parents) });
    for (const h of holders) reapply(keyOf2(h));
    return parents.length;
  }
  function activeOrder(p) {
    let found = null;
    for (const e of entries3.values()) if (e.target.kind === "order" && e.parents?.includes(p)) found = e.target.order;
    return found;
  }
  function reapplyOrders() {
    const run = chain.then(async () => {
      for (const e of Array.from(entries3.values())) {
        if (e.target.kind !== "order" || !e.parents || shapeOf(e.parents) === e.shape) continue;
        await previewOrder(e.id, e.target, e.parents.find((p) => p.isConnected));
      }
    });
    chain = run.catch(() => void 0);
    return run;
  }
  function hasOrderPreviews() {
    for (const e of entries3.values()) if (e.target.kind === "order") return true;
    return false;
  }
  async function doPreview(id, target2, decls) {
    let entry = entries3.get(id);
    if (entry && !sameTarget(entry.target, target2)) {
      clearPreview(id);
      entry = void 0;
    }
    if (entry && entry.holders.length && !entry.holders.some(holderLive)) {
      decls = { ...entry.decls, ...decls };
      clearPreview(id);
      entry = void 0;
    }
    if (!entry) {
      const holders = await holdersFor(target2);
      for (const h of holders) save(h);
      entry = { id, target: target2, decls: {}, holders };
    }
    entries3.delete(id);
    entries3.set(id, entry);
    entry.decls = { ...entry.decls, ...decls };
    for (const h of entry.holders) reapply(keyOf2(h));
    return entry.holders.length;
  }
  function sameTarget(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function clearPreview(id) {
    if (clearTextPreview(id) || clearProp(id)) return true;
    const e = entries3.get(id);
    if (!e) return false;
    entries3.delete(id);
    for (const h of e.holders) {
      const k = keyOf2(h);
      if (h.kind === "rule" && !isLive(h.style)) {
        saved.delete(k);
        continue;
      }
      reapply(k);
    }
    return true;
  }
  function clearAll() {
    const n = entries3.size;
    for (const id of Array.from(entries3.keys())) clearPreview(id);
    return n + clearAllTexts() + clearAllProps();
  }
  function hasPreview(id) {
    return entries3.has(id) || hasTextPreview(id) || hasPropPreview(id);
  }
  function previewAttached(id, el) {
    const e = entries3.get(id);
    if (!e) return false;
    return e.holders.some((h) => holderLive(h) && (h.kind === "rule" || !el || h.el === el));
  }
  function reattachRules() {
    for (const e of Array.from(entries3.values())) {
      if (e.target.kind !== "rule" || !e.holders.length || e.holders.some(holderLive)) continue;
      const style = resolveRule(e.target.rule);
      if (!style) continue;
      e.holders = [{ kind: "rule", style }];
      save(e.holders[0]);
      reapply(style);
    }
  }
  function beneath(read) {
    const was = Array.from(saved.keys(), (k) => [k, k instanceof CSSStyleDeclaration ? k.cssText : k.getAttribute("style")]);
    for (const [k] of was) restore(k);
    try {
      return read();
    } finally {
      for (const [k, text] of was) {
        if (k instanceof CSSStyleDeclaration) k.cssText = text ?? "";
        else if (text == null) k.removeAttribute("style");
        else k.setAttribute("style", text);
      }
    }
  }
  function isLive(style) {
    const rule = style.parentRule;
    if (!rule) return false;
    let sheet = rule.parentStyleSheet;
    while (sheet && sheet.ownerRule) sheet = sheet.ownerRule.parentStyleSheet;
    return !!sheet && Array.from(document.styleSheets).includes(sheet);
  }
  var holderLive = (h) => h.kind === "inline" ? h.el.isConnected : isLive(h.style);
  function prune() {
    for (const [k, s] of Array.from(saved.entries())) {
      if (!holderLive(s.holder)) saved.delete(k);
    }
  }

  // src/fallback.ts
  function fallbackValues(el, props) {
    const matched = matchRules(el, collectRules(isOwnSheet));
    const inline = el.style;
    const saved2 = /* @__PURE__ */ new Map();
    const hold2 = (style) => {
      if (!saved2.has(style)) saved2.set(style, style.cssText);
    };
    for (const prop of props) {
      const w = pickWinner(el, matched, prop, originalReader);
      const style = w ? w.inline ? inline : w.fr?.style : void 0;
      if (style) {
        hold2(style);
        for (const name of aliasesOf(prop)) style.removeProperty(name);
      }
      if (!inline || style === inline) continue;
      for (const name of aliasesOf(prop)) {
        const was = originalReader(inline, name);
        if (was === null) continue;
        hold2(inline);
        if (was === "absent") inline.removeProperty(name);
        else inline.setProperty(name, was.value, was.priority);
      }
    }
    const cs = getComputedStyle(el);
    const out2 = Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p).trim()]));
    for (const [style, text] of saved2) style.cssText = text;
    return out2;
  }

  // src/overlay.ts
  var STYLE = `
:host { all: initial; }
.box { position: fixed; pointer-events: none; box-sizing: border-box; }
.sel-outline { outline: 1.5px solid #fff; box-shadow: 0 0 0 2.5px #111; }
.hov-outline { outline: 1px dashed #fff; box-shadow: 0 0 0 1px #111; }
.peer { outline: 1px dotted #fff; box-shadow: 0 0 0 1px rgba(17, 17, 17, 0.55); }
.tag { position: fixed; pointer-events: none; font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; color: #f5f5f5;
  background: #111; padding: 2px 6px; border-radius: 4px; white-space: nowrap; max-width: 70vw; overflow: hidden;
  text-overflow: ellipsis; font-variant-numeric: tabular-nums;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18), 0 2px 8px rgba(0, 0, 0, 0.3); }
.tag .dim { opacity: 0.6; margin-left: 6px; }
.grip { position: fixed; pointer-events: auto; box-sizing: border-box; width: 16px; height: 20px; border-radius: 4px; background: #111; color: #f5f5f5;
  display: flex; align-items: center; justify-content: center; cursor: grab; touch-action: none;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18), 0 2px 8px rgba(0, 0, 0, 0.3); }
.grip:hover { background: #2a2a2a; }
.grip.dragging { cursor: grabbing; background: #2a2a2a; }
.line { position: fixed; pointer-events: none; background: #111; box-shadow: 0 0 0 1px #fff; border-radius: 1px; }
.ghost { position: fixed; pointer-events: none; outline: 1.5px dashed #fff; box-shadow: 0 0 0 2.5px rgba(17, 17, 17, 0.6); background: rgba(128, 128, 128, 0.12); }
.mline, .mcap { position: fixed; pointer-events: none; background: #111; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.9); }
.mguide { position: fixed; pointer-events: none; background: repeating-linear-gradient(to bottom, #111 0 3px, #fff 3px 6px); }
.mguide.h { background: repeating-linear-gradient(to right, #111 0 3px, #fff 3px 6px); }
.mlabel { position: fixed; pointer-events: none; transform: translate(-50%, -50%); font: 10.5px/14px ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #f5f5f5; background: #111; padding: 1px 5px; border-radius: 3px; white-space: nowrap; font-variant-numeric: tabular-nums;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22), 0 1px 4px rgba(0, 0, 0, 0.3); }
.hidden { display: none; }
`;
  var host = null;
  var root = null;
  var hoverBox = null;
  var selBox = null;
  var tag = null;
  var peerBox = null;
  var grip = null;
  var line = null;
  var ghost = null;
  var measureBox = null;
  var parts = { mline: [], mcap: [], mlabel: [], mguide: [] };
  var measureFn = null;
  var hoverEl = null;
  var hoverFromPanel = false;
  var muted = null;
  var selEl = null;
  var selNote = "";
  var peers = [];
  var model = null;
  var gripOff = false;
  var drag = null;
  var raf = 0;
  var fallback = 0;
  function div(cls, parent) {
    const d = document.createElement("div");
    d.className = cls;
    parent.appendChild(d);
    return d;
  }
  function ensure() {
    if (host && host.isConnected) return;
    if (!document.documentElement) return;
    host = document.createElement("css-tuner-overlay");
    host.setAttribute(OWN_ATTR, "");
    host.style.cssText = "all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; display: block;";
    root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    root.appendChild(style);
    peerBox = div("peers", root);
    hoverBox = div("box hov-outline hidden", root);
    selBox = div("box sel-outline hidden", root);
    measureBox = div("measure", root);
    parts = { mline: [], mcap: [], mlabel: [], mguide: [] };
    tag = div("tag hidden", root);
    line = div("line hidden", root);
    ghost = div("ghost hidden", root);
    grip = div("grip hidden", root);
    grip.innerHTML = '<svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/><circle cx="2" cy="6" r="1"/><circle cx="6" cy="6" r="1"/><circle cx="2" cy="10" r="1"/><circle cx="6" cy="10" r="1"/></svg>';
    wireGrip(grip);
    document.documentElement.appendChild(host);
  }
  function wireGrip(g) {
    const stop = (e) => e.stopPropagation();
    g.addEventListener("pointerdown", (e) => {
      stop(e);
      if (e.button !== 0 || !model || !selEl) return;
      const m = model.boxes();
      if (!m) return;
      e.preventDefault();
      try {
        g.setPointerCapture(e.pointerId);
      } catch {
      }
      drag = { pointer: e.pointerId, x0: e.clientX, y0: e.clientY, rect: selEl.getBoundingClientRect(), index: m.index, slot: m.index };
      g.classList.add("dragging");
      moveDrag(e);
    });
    g.addEventListener("pointermove", (e) => {
      stop(e);
      moveDrag(e);
    });
    g.addEventListener("pointerup", (e) => {
      stop(e);
      endDrag(true);
    });
    g.addEventListener("pointercancel", () => endDrag(false));
    g.addEventListener("lostpointercapture", () => endDrag(false));
    for (const t2 of ["click", "dblclick", "mousedown", "mouseup", "contextmenu"]) g.addEventListener(t2, stop);
  }
  function moveDrag(e) {
    if (!drag || e.pointerId !== drag.pointer || !model || !line || !ghost) return;
    const m = model.boxes();
    if (!m) return;
    drag.slot = dropSlot(m.boxes, e.clientX, e.clientY, model.axis);
    const r = drag.rect;
    place2(ghost, r.left + e.clientX - drag.x0, r.top + e.clientY - drag.y0, r.width, r.height);
    if (drag.slot === drag.index || drag.slot === drag.index + 1) line.classList.add("hidden");
    else {
      const l = slotLine(m.boxes, drag.slot, model.axis);
      place2(line, l.x, l.y, l.w, l.h);
    }
  }
  function endDrag(commit) {
    if (!drag) return;
    const { slot, index, pointer } = drag;
    drag = null;
    if (grip?.hasPointerCapture(pointer)) grip.releasePointerCapture(pointer);
    grip?.classList.remove("dragging");
    line?.classList.add("hidden");
    ghost?.classList.add("hidden");
    const to = slot > index ? slot - 1 : slot;
    if (commit && model && to !== index) model.drop(to);
    kick();
  }
  function place2(d, x, y, w, h) {
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    d.style.width = `${Math.max(0, w)}px`;
    d.style.height = `${Math.max(0, h)}px`;
    d.classList.remove("hidden");
  }
  function outline(d, el) {
    if (!d) return;
    if (!el) {
      d.classList.add("hidden");
      return;
    }
    const r = el.getBoundingClientRect();
    place2(d, r.left, r.top, r.width, r.height);
  }
  function drawTag(el, note, withGrip) {
    if (!tag) return;
    const r = el.getBoundingClientRect();
    tag.textContent = "";
    const main = document.createElement("span");
    main.textContent = labelOf(el);
    const dim = document.createElement("span");
    dim.className = "dim";
    dim.textContent = `${Math.round(r.width)}\xD7${Math.round(r.height)}${note ? "  " + note : ""}`;
    tag.append(main, dim);
    tag.classList.remove("hidden");
    const h = 20;
    const top = Math.min(r.top - h - 4 >= 0 ? r.top - h - 4 : r.bottom + 4, innerHeight - h - 2);
    const left = Math.max(2, Math.min(r.left, innerWidth - 260));
    if (withGrip && grip) place2(grip, left, top, 16, h);
    else grip?.classList.add("hidden");
    tag.style.left = `${withGrip ? left + 20 : left}px`;
    tag.style.top = `${top}px`;
  }
  function drawPeers(on) {
    if (!peerBox) return;
    const need = on && selEl ? peers.filter((p) => p !== selEl && p.isConnected).slice(0, 80) : [];
    while (peerBox.childElementCount < need.length) div("box peer", peerBox);
    const kids2 = Array.from(peerBox.children);
    kids2.forEach((k, i) => {
      const p = need[i];
      if (!p) {
        k.classList.add("hidden");
        return;
      }
      const r = p.getBoundingClientRect();
      place2(k, r.left, r.top, r.width, r.height);
    });
  }
  function part(kind, i) {
    const pool = parts[kind];
    while (pool.length <= i) pool.push(div(`${kind} hidden`, measureBox));
    return pool[i];
  }
  function hideParts(kind, from) {
    for (const d of parts[kind].slice(from)) d.classList.add("hidden");
  }
  function drawMeasure(m) {
    const spans = m?.spans ?? [];
    const guides = m?.guides ?? [];
    spans.forEach((s, i) => {
      const len = s.to - s.from;
      const [l, c1, c2, label] = [part("mline", i), part("mcap", i * 2), part("mcap", i * 2 + 1), part("mlabel", i)];
      if (s.axis === "x") {
        const fits2 = len >= s.label.length * 6.4 + 18;
        place2(l, s.from, s.at - 0.5, len, 1);
        place2(c1, s.from - 0.5, s.at - 4, 1, 8);
        place2(c2, s.to - 0.5, s.at - 4, 1, 8);
        label.style.left = `${s.from + len / 2}px`;
        label.style.top = `${fits2 ? s.at : s.at + 7}px`;
        label.style.transform = fits2 ? "" : "translate(-50%, 0)";
      } else {
        const fits2 = len >= 26;
        place2(l, s.at - 0.5, s.from, 1, len);
        place2(c1, s.at - 4, s.from - 0.5, 8, 1);
        place2(c2, s.at - 4, s.to - 0.5, 8, 1);
        label.style.left = `${fits2 ? s.at : s.at + 7}px`;
        label.style.top = `${s.from + len / 2}px`;
        label.style.transform = fits2 ? "" : "translate(0, -50%)";
      }
      label.textContent = s.label;
      label.classList.remove("hidden");
    });
    hideParts("mline", spans.length);
    hideParts("mcap", spans.length * 2);
    hideParts("mlabel", spans.length);
    guides.forEach((g, i) => {
      const d = part("mguide", i);
      const across = g.y1 === g.y2;
      d.classList.toggle("h", across);
      if (across) place2(d, Math.min(g.x1, g.x2), g.y1 - 0.5, Math.abs(g.x2 - g.x1), 1);
      else place2(d, g.x1 - 0.5, Math.min(g.y1, g.y2), 1, Math.abs(g.y2 - g.y1));
    });
    hideParts("mguide", guides.length);
  }
  function shown(s) {
    const fresh = (el) => s.fromPanel || el !== s.muted;
    const hover = s.hover && s.hover !== s.sel && fresh(s.hover) ? s.hover : null;
    if (!s.sel) return { hover, sel: null };
    if (s.measuring) return { hover, sel: "outline" };
    return { hover, sel: s.hover === s.sel && fresh(s.sel) ? "full" : null };
  }
  function holdZone(tag2, grip2, el, pad = 4) {
    return {
      left: Math.min(tag2.left, grip2.left, el.right) - pad,
      right: Math.max(tag2.right, grip2.right, el.left) + pad,
      top: Math.min(tag2.top, grip2.top, el.bottom) - pad,
      bottom: Math.max(tag2.bottom, grip2.bottom, el.top) + pad
    };
  }
  function frame() {
    raf = 0;
    ensure();
    if (!root) return;
    const m = measureFn?.() ?? null;
    const sel = selEl && selEl.isConnected ? selEl : null;
    const show2 = shown({ sel, hover: hoverEl && hoverEl.isConnected ? hoverEl : null, muted, fromPanel: hoverFromPanel, measuring: !!m });
    outline(hoverBox, show2.hover);
    outline(selBox, show2.sel ? sel : null);
    drawMeasure(m);
    if (sel && show2.sel === "full") drawTag(sel, selNote, !!model && !gripOff);
    else if (show2.hover && !m) drawTag(show2.hover, "", false);
    else {
      tag?.classList.add("hidden");
      grip?.classList.add("hidden");
    }
    drawPeers(show2.sel === "full");
    if (show2.hover || show2.sel || m) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
    if (!fallback) {
      fallback = window.setTimeout(() => {
        fallback = 0;
        if (!raf) return;
        cancelAnimationFrame(raf);
        frame();
      }, 100);
    }
  }
  function setHover(el, fromPanel = false) {
    if (el !== muted) muted = null;
    hoverEl = el;
    hoverFromPanel = fromPanel;
    kick();
  }
  function mute(el) {
    muted = el;
    kick();
  }
  function holds(x, y) {
    if (!selEl || !tag || !grip || grip.classList.contains("hidden")) return false;
    const z = holdZone(tag.getBoundingClientRect(), grip.getBoundingClientRect(), selEl.getBoundingClientRect());
    return x >= z.left && x <= z.right && y >= z.top && y <= z.bottom;
  }
  function dragging() {
    return !!drag;
  }
  function cancelDrag() {
    if (!drag) return false;
    endDrag(false);
    return true;
  }
  function setSelected(el, note = "", same = []) {
    if (el !== selEl) setDragModel(null);
    selEl = el;
    selNote = note;
    peers = same;
    kick();
  }
  function setDragModel(m) {
    model = m;
    if (!m) endDrag(false);
    kick();
  }
  function setGripHidden(off) {
    gripOff = off;
    if (off) endDrag(false);
    kick();
  }
  function redraw() {
    kick();
  }
  function setMeasureDraw(fn) {
    measureFn = fn;
    kick();
  }
  function isOverlay(node) {
    return !!host && node === host;
  }

  // src/page.ts
  function sheetsInfo() {
    return Array.from(document.styleSheets).map((s, index) => {
      if (isOwnSheet(s)) return null;
      const devId = sheetDevId(s);
      let ruleCount = 0;
      try {
        ruleCount = s.cssRules.length;
      } catch {
        ruleCount = -1;
      }
      return { index, devId, href: s.href, inline: !s.href && !devId, tailwind: isTailwindSheet(s), ruleCount };
    }).filter((s) => !!s);
  }
  function kindOf(value) {
    const v = value.trim();
    const n = parseCssNumber(v);
    if (n) return n.unit === "" ? "number" : "length";
    if (parseColor(v)) return "color";
    return "other";
  }
  function rootVars(limit = 600) {
    const idx = collectRules(isOwnSheet);
    const root2 = document.documentElement;
    const cs = getComputedStyle(root2);
    const seen = /* @__PURE__ */ new Set();
    const out2 = [];
    for (const fr of idx.rules) {
      if (!fr.active) continue;
      let matches = false;
      try {
        matches = root2.matches(fr.fullSelector);
      } catch {
        matches = false;
      }
      if (!matches) continue;
      for (let i = 0; i < fr.style.length; i++) {
        const name = fr.style[i];
        if (!name.startsWith("--") || seen.has(name)) continue;
        seen.add(name);
        const value = cs.getPropertyValue(name).trim();
        if (!value) continue;
        out2.push({ name, value, kind: kindOf(value) });
        if (out2.length >= limit) return out2;
      }
    }
    return out2;
  }
  function pageFonts() {
    const names = /* @__PURE__ */ new Map();
    document.fonts.forEach((f) => {
      const name = primaryFamily(f.family);
      if (name && !name.startsWith("__")) names.set(name.toLowerCase(), name);
    });
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }
  function pageInfo() {
    return {
      url: location.href,
      title: document.title,
      react: hasReact(),
      vite: !!document.querySelector('script[src*="/@vite/client"]') || !!document.querySelector("style[data-vite-dev-id]"),
      sheets: sheetsInfo(),
      rootVars: rootVars()
    };
  }

  // src/measure.ts
  var MIN = 0.5;
  function measure(a, b) {
    const spans = [];
    const guides = [];
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    const midX = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
    const midY = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
    if (ox > 0 && oy > 0) {
      const edge = (axis, p, q, at) => {
        if (Math.abs(p - q) >= MIN) spans.push({ axis, from: Math.min(p, q), to: Math.max(p, q), at });
      };
      edge("y", a.top, b.top, midX);
      edge("y", a.bottom, b.bottom, midX);
      edge("x", a.left, b.left, midY);
      edge("x", a.right, b.right, midY);
      return { spans, guides };
    }
    if (ox <= 0) {
      const toRight = a.right <= b.left;
      const from = toRight ? a.right : b.right;
      const to = toRight ? b.left : a.left;
      if (to - from >= MIN) {
        const at = oy > 0 ? midY : (a.top + a.bottom) / 2;
        spans.push({ axis: "x", from, to, at });
        const x = toRight ? b.left : b.right;
        if (oy <= 0) guides.push({ x1: x, y1: at, x2: x, y2: at < b.top ? b.top : b.bottom });
      }
    }
    if (oy <= 0) {
      const below = a.bottom <= b.top;
      const from = below ? a.bottom : b.bottom;
      const to = below ? b.top : a.top;
      if (to - from >= MIN) {
        const at = ox > 0 ? midX : (a.left + a.right) / 2;
        spans.push({ axis: "y", from, to, at });
        const y = below ? b.top : b.bottom;
        if (ox <= 0) guides.push({ x1: at, y1: y, x2: at < b.left ? b.left : b.right, y2: y });
      }
    }
    return { spans, guides };
  }
  function spanLabel(px, steps2) {
    const n = formatNumber(px, 1);
    const step = steps2.find((s) => Math.abs(s.px - px) < 0.05);
    return step ? `${n} \xB7 ${step.label}` : n;
  }
  var anchor = () => null;
  var target = null;
  var steps = [];
  function draw() {
    const a = anchor();
    const b = target;
    if (!a || !b || a === b || !b.isConnected) return null;
    const m = measure(a.getBoundingClientRect(), b.getBoundingClientRect());
    return { spans: m.spans.map((s) => ({ ...s, label: spanLabel(s.to - s.from, steps) })), guides: m.guides };
  }
  function initMeasure(a) {
    anchor = a;
  }
  function disposeMeasure() {
    measureTo(null);
    anchor = () => null;
  }
  function measureTo(el) {
    target = el;
    setMeasureDraw(el ? draw : null);
  }
  function setMeasureSteps(s) {
    steps = s;
  }

  // src/pick.ts
  var hooks = null;
  var picking = false;
  var measuring = false;
  var engaged = false;
  var altOnly = false;
  var aimed = null;
  var cursorStyle = null;
  function own(e) {
    return e.target instanceof Node && isOwnNode(e.target);
  }
  function targetOf(e) {
    for (const n of e.composedPath()) {
      if (n instanceof Element && !isOwnNode(n)) return n;
    }
    return null;
  }
  function hoverable(el) {
    return el === document.documentElement || el === document.body ? null : el;
  }
  function block(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
  function aim(el, altKey) {
    aimed = el;
    setHover(el);
    measureTo(measuring || altKey ? el : null);
  }
  function move(e) {
    if (!engaged) {
      if (!e.altKey || !hooks?.anchor()) {
        if (altOnly) stopAlt();
        return;
      }
      altOnly = true;
    }
    if (dragging() || holds(e.clientX, e.clientY)) return;
    aim(hoverable(targetOf(e)), e.altKey);
  }
  function stopAlt() {
    altOnly = false;
    aim(null, false);
  }
  function altUp() {
    if (altOnly) stopAlt();
    else if (!measuring) measureTo(null);
  }
  function keyUp(e) {
    if (e.key === "Alt" || !e.altKey) altUp();
  }
  function out(e) {
    if (dragging() || !(engaged || altOnly)) return;
    const to = e.relatedTarget;
    if (to && !(to instanceof Element && to.shadowRoot && isOwnNode(to) && !isOverlay(to))) return;
    if (altOnly) stopAlt();
    else aim(null, false);
  }
  function click(e) {
    if (own(e)) return;
    block(e);
    const el = holds(e.clientX, e.clientY) ? hooks?.anchor() : targetOf(e);
    if (!el || el === document.documentElement) return;
    aim(hoverable(el), e.altKey);
    hooks?.pick(el);
  }
  function dblclick(e) {
    if (own(e)) return;
    block(e);
    if (picking && !measuring) hooks?.edit(e.clientX, e.clientY);
  }
  function key(e) {
    if (e.key !== "Escape" || own(e)) return;
    block(e);
    if (cancelDrag() || !measuring) return;
    setMeasure(false);
    hooks?.measureOff();
  }
  function guard2(e) {
    if (!own(e)) block(e);
  }
  var passthrough = ["pointerdown", "mousedown", "pointerup", "mouseup", "contextmenu", "auxclick"];
  function engage() {
    const v = picking || measuring;
    if (v === engaged) return;
    engaged = v;
    if (v) {
      altOnly = false;
      window.addEventListener("click", click, true);
      window.addEventListener("dblclick", dblclick, true);
      window.addEventListener("keydown", key, true);
      for (const t2 of passthrough) window.addEventListener(t2, guard2, true);
      cursorStyle = document.createElement("style");
      cursorStyle.setAttribute(OWN_ATTR, "");
      cursorStyle.textContent = `html, html *:not([${OWN_ATTR}]) { cursor: crosshair !important; }`;
      (document.head || document.documentElement).appendChild(cursorStyle);
    } else {
      window.removeEventListener("click", click, true);
      window.removeEventListener("dblclick", dblclick, true);
      window.removeEventListener("keydown", key, true);
      for (const t2 of passthrough) window.removeEventListener(t2, guard2, true);
      cursorStyle?.remove();
      cursorStyle = null;
      aim(null, false);
    }
  }
  function initPick(h) {
    hooks = h;
    window.addEventListener("pointermove", move, { capture: true, passive: true });
    window.addEventListener("pointerout", out, { capture: true, passive: true });
    window.addEventListener("keyup", keyUp, true);
    window.addEventListener("blur", altUp);
  }
  function disposePick() {
    setPick(false);
    setMeasure(false);
    if (altOnly) stopAlt();
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerout", out, true);
    window.removeEventListener("keyup", keyUp, true);
    window.removeEventListener("blur", altUp);
    hooks = null;
  }
  function setPick(v) {
    picking = v;
    engage();
  }
  function pickOn() {
    return picking;
  }
  function setMeasure(v) {
    measuring = v;
    engage();
    measureTo(v ? aimed : null);
  }
  function measureOn() {
    return measuring;
  }

  // src/dock.ts
  var GUARD_MS = 4e3;
  var GUARD_KEY = "css-tuner:wrapped";
  function frameUrl(frame2, path) {
    return `${frame2}?${new URLSearchParams({ u: path })}`;
  }
  function wrapAllowed(last, now) {
    return now < last || now - last >= GUARD_MS;
  }
  function wrapIntoFrame(frame2, opts = {}) {
    const now = Date.now();
    try {
      if (!opts.force && !wrapAllowed(Number(sessionStorage.getItem(GUARD_KEY)) || 0, now)) return "bounced";
      sessionStorage.setItem(GUARD_KEY, String(now));
    } catch {
      if (!opts.force) return "skipped";
    }
    if (opts.stop) window.stop();
    location.replace(frameUrl(frame2, location.pathname + location.search + location.hash));
    return "wrapped";
  }

  // src/shell.ts
  var FLOAT_EVENT = "css-tuner-float";
  var KEY2 = "css-tuner:panel";
  var MIN2 = 300;
  var MAX = 720;
  var ROOM_BESIDE = 320;
  var ROOM_OVER = 120;
  var DEFAULT = { side: "right", width: 380, collapsed: false, float: false };
  var STYLE2 = `
.panel { position: fixed; top: 0; bottom: 0; display: block; background: #181818; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3), 0 8px 30px rgba(0, 0, 0, 0.3); }
.panel.right { right: 0; }
.panel.left { left: 0; }
.panel.hidden { display: none; }
iframe { display: block; width: 100%; height: 100%; border: 0; background: transparent; }
.grip { position: absolute; top: 0; bottom: 0; width: 7px; cursor: ew-resize; touch-action: none; }
.right .grip { left: -3px; }
.left .grip { right: -3px; }
.grip:hover, .grip.on { background: rgba(77, 144, 254, 0.5); }
.shield { position: fixed; inset: 0; cursor: ew-resize; display: none; }
.shield.on { display: block; }
.pill { position: fixed; bottom: 16px; display: none; align-items: center; gap: 7px; max-width: min(420px, calc(100vw - 32px)); padding: 8px 13px; border: 1px solid #3a3a3a; border-radius: 999px; background: #1f1f1f; color: #f0f0f0; font: 600 12px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; text-align: left; cursor: pointer; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.3); }
.pill:hover { background: #2a2a2a; }
.pill.right { right: 16px; }
.pill.left { left: 16px; }
.pill.on { display: inline-flex; }
.dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: #3fb950; }
.pill.warn .dot { background: #d29922; }
`;
  function parsePanelState(raw, maxWidth = MAX) {
    try {
      const v = JSON.parse(raw ?? "null");
      if (!v || typeof v !== "object") return { ...DEFAULT };
      return {
        side: v.side === "left" ? "left" : "right",
        width: clamp(Number(v.width) || DEFAULT.width, maxWidth),
        collapsed: v.collapsed === true,
        float: v.float === true
      };
    } catch {
      return { ...DEFAULT };
    }
  }
  function savedPanelState() {
    try {
      return parsePanelState(localStorage.getItem(KEY2), innerWidth - ROOM_OVER);
    } catch {
      return { ...DEFAULT };
    }
  }
  function clamp(w, maxWidth) {
    return Math.round(Math.max(MIN2, Math.min(MAX, w, Math.max(MIN2, maxWidth))));
  }
  var PanelShell = class {
    constructor(src, text, beside = false) {
      this.src = src;
      this.text = text;
      this.beside = beside;
    }
    src;
    text;
    beside;
    host = null;
    panel;
    frame;
    grip;
    shield;
    pill;
    label;
    st = savedPanelState();
    note = null;
    observer = null;
    clampWidth(w) {
      return clamp(w, innerWidth - (this.beside ? ROOM_BESIDE : ROOM_OVER));
    }
    mount() {
      if (this.host || !document.documentElement) return;
      const host2 = document.createElement("css-tuner-panel");
      host2.setAttribute(OWN_ATTR, "");
      host2.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; display: block;";
      const root2 = host2.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = STYLE2;
      root2.appendChild(style);
      this.panel = document.createElement("div");
      this.frame = document.createElement("iframe");
      this.frame.title = "CSS Tuner";
      this.frame.allow = "clipboard-read; clipboard-write";
      this.frame.src = this.src;
      this.grip = document.createElement("div");
      this.grip.className = "grip";
      this.grip.title = this.text.resize;
      this.panel.append(this.frame, this.grip);
      this.shield = document.createElement("div");
      this.shield.className = "shield";
      this.pill = document.createElement("button");
      this.pill.type = "button";
      const dot = document.createElement("span");
      dot.className = "dot";
      this.label = document.createElement("span");
      this.pill.append(dot, this.label);
      root2.append(this.panel, this.shield, this.pill);
      this.pill.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.note) this.note.onClick();
        else this.expand();
      });
      this.wireGrip();
      addEventListener("resize", () => this.render());
      this.host = host2;
      document.documentElement.appendChild(host2);
      this.observer = new MutationObserver(() => {
        if (this.host && !this.host.isConnected && document.documentElement) document.documentElement.appendChild(this.host);
      });
      this.observer.observe(document.documentElement, { childList: true });
      this.render();
    }
    remove() {
      this.observer?.disconnect();
      this.observer = null;
      this.host?.remove();
      this.host = null;
      const w = window;
      if (w.__CSS_TUNER_PANEL_HOST__ === this) delete w.__CSS_TUNER_PANEL_HOST__;
      this.st = { ...this.st, collapsed: true };
      this.emit();
    }
    state() {
      return { ...this.st };
    }
    collapse() {
      this.update({ collapsed: true });
    }
    expand() {
      this.update({ collapsed: false });
    }
    toggle() {
      this.update({ collapsed: !this.st.collapsed });
    }
    dock(side) {
      this.update({ side });
    }
    setFloat(on) {
      if (on === this.st.float) return;
      this.update({ float: on });
      dispatchEvent(new CustomEvent(FLOAT_EVENT, { detail: { float: on } }));
    }
    /** 面板退下时（同一个站点在另一个标签页里用着）只留一个提示，点了以后接回来 */
    notice(text, onClick) {
      this.note = text && onClick ? { text, onClick } : null;
      this.render();
    }
    superseded(onResume) {
      this.frame.src = "about:blank";
      this.notice(this.text.superseded, () => {
        this.notice(null);
        this.frame.src = this.src;
        onResume();
      });
    }
    update(patch) {
      this.st = { ...this.st, ...patch };
      try {
        localStorage.setItem(KEY2, JSON.stringify(this.st));
      } catch {
      }
      this.render();
    }
    render() {
      if (!this.host) return;
      const { side, collapsed } = this.st;
      const width = this.clampWidth(this.st.width);
      const hidden = collapsed || !!this.note;
      this.panel.className = `panel ${side}${hidden ? " hidden" : ""}`;
      this.panel.style.width = `${width}px`;
      this.pill.className = `pill ${side}${hidden ? " on" : ""}${this.note ? " warn" : ""}`;
      this.label.textContent = this.note?.text ?? this.text.pill;
      this.pill.title = this.note ? "" : this.text.pillTitle;
      this.emit();
    }
    emit() {
      const detail = { ...this.st, width: this.clampWidth(this.st.width), collapsed: this.st.collapsed || !!this.note || !this.host };
      dispatchEvent(new CustomEvent("css-tuner-panel", { detail }));
    }
    wireGrip() {
      let drag2 = null;
      const move2 = (e) => {
        if (!drag2 || e.pointerId !== drag2.pointer) return;
        const w = this.st.side === "right" ? innerWidth - e.clientX : e.clientX;
        this.st = { ...this.st, width: this.clampWidth(w) };
        this.render();
      };
      const end = (e) => {
        if (!drag2 || e.pointerId !== drag2.pointer) return;
        drag2 = null;
        this.grip.classList.remove("on");
        this.shield.classList.remove("on");
        this.update({});
      };
      this.grip.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        drag2 = { pointer: e.pointerId };
        this.grip.classList.add("on");
        this.shield.classList.add("on");
        try {
          this.shield.setPointerCapture(e.pointerId);
        } catch {
        }
      });
      this.shield.addEventListener("pointermove", move2);
      this.shield.addEventListener("pointerup", end);
      this.shield.addEventListener("pointercancel", end);
    }
  };

  // src/snapshot.ts
  function crumb(el) {
    const text = textOf(el);
    return { uid: uidOf(el), label: labelOf(el), component: ownerName2(el), kids: kidsOf(el).length, ...text ? { text } : {} };
  }
  function kidsOf(el) {
    return Array.from(el.children).filter((c) => !isOwnNode(c) && c.tagName !== "SCRIPT" && c.tagName !== "STYLE" && c.tagName !== "LINK");
  }
  function utilityOf(selector, el) {
    if (!selector.startsWith(".")) return null;
    let i = 1;
    while (i < selector.length) {
      const ch = selector[i];
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (/[A-Za-z0-9_-]/.test(ch) || ch.charCodeAt(0) > 127) i++;
      else break;
    }
    const cls = unescapeIdent(selector.slice(1, i));
    const rest = selector.slice(i);
    if (rest && !rest.startsWith(":")) return null;
    if (/^[^()]*[\s>+~]/.test(rest)) return null;
    return el.classList.contains(cls) ? cls : null;
  }
  var VAR_REF = /var\(\s*(--[\w-]+)/g;
  var MAX_VARS = 12;
  var countCache = /* @__PURE__ */ new Map();
  function matchCount(sel) {
    const s = staticSelector(sel);
    let n = countCache.get(s);
    if (n === void 0) {
      try {
        n = document.querySelectorAll(s).length;
      } catch {
        n = 0;
      }
      countCache.set(s, n);
    }
    return n;
  }
  function ruleRef(fr, el) {
    return {
      sheet: { index: fr.sheetIndex, devId: sheetDevId(fr.topSheet), href: fr.ownerSheet.href ?? fr.topSheet.href },
      path: fr.path,
      selector: fr.selector,
      fullSelector: fr.fullSelector,
      conditions: fr.conditions,
      layer: fr.layer,
      ordinal: fr.ordinal,
      matchCount: matchCount(fr.fullSelector),
      utility: isTailwindSheet(fr.topSheet) && (fr.layer === "utilities" || fr.layer === null) ? utilityOf(fr.selector, el) : null
    };
  }
  function toWinner(el, w, origin, from) {
    if (!w) return null;
    return {
      value: w.decl.value,
      important: w.decl.important,
      origin: w.inline ? origin === "inherited" ? "inherited" : "inline" : origin,
      rule: w.fr ? ruleRef(w.fr, from ?? el) : null,
      inheritedFrom: from ? crumb(from) : null,
      via: w.decl.shorthand ?? w.decl.via
    };
  }
  function backdropOf(el) {
    const layers = [];
    for (let p = el.parentElement; p; p = p.parentElement) {
      const c = parseColor(getComputedStyle(p).backgroundColor);
      if (!c || c.a <= 0) continue;
      layers.push(c);
      if (c.a >= 0.999) break;
    }
    return toHex(layers.reduceRight((under, c) => overColor(c, under), { r: 1, g: 1, b: 1, a: 1 }));
  }
  async function snapshot(el, idx = collectRules(isOwnSheet)) {
    countCache.clear();
    const matchedCache = /* @__PURE__ */ new Map();
    const matchedFor = (e) => {
      let m = matchedCache.get(e);
      if (!m) {
        m = matchRules(e, idx);
        matchedCache.set(e, m);
      }
      return m;
    };
    const matched = matchedFor(el);
    const cs = getComputedStyle(el);
    const computed = {};
    const winners = {};
    for (const prop of PROP_NAMES) {
      computed[prop] = cs.getPropertyValue(prop).trim();
      let w = toWinner(el, pickWinner(el, matched, prop, originalReader), "rule", null);
      if (!w && propMeta(prop)?.inherited) {
        for (let p = el.parentElement; p && p !== document.documentElement.parentElement; p = p.parentElement) {
          const pw = pickWinner(p, matchedFor(p), prop, originalReader);
          if (pw && pw.decl.value !== "inherit") {
            w = toWinner(el, pw, "inherited", p);
            break;
          }
        }
      }
      winners[prop] = w ?? { value: computed[prop], important: false, origin: "initial", rule: null, inheritedFrom: null, via: null };
    }
    const using = /* @__PURE__ */ new Map();
    for (const prop of PROP_NAMES) {
      const w = winners[prop];
      if (w.origin === "initial") continue;
      for (const m of w.value.matchAll(VAR_REF)) {
        if (m[1].startsWith("--tw-")) continue;
        const list = using.get(m[1]) ?? [];
        if (!list.includes(prop)) list.push(prop);
        using.set(m[1], list);
      }
    }
    const vars = [];
    for (const [name, props] of [...using].slice(0, MAX_VARS)) {
      const value = cs.getPropertyValue(name).trim();
      let w = null;
      for (let p = el; p && !w; p = p.parentElement) {
        w = toWinner(el, pickWinner(p, matchedFor(p), name, originalReader), p === el ? "rule" : "inherited", p === el ? null : p);
      }
      computed[name] = value;
      winners[name] = w ? { ...w, value: w.value.trim() } : { value, important: false, origin: "initial", rule: null, inheritedFrom: null, via: null };
      vars.push({ name, value, kind: kindOf(value), props });
    }
    const inline = {};
    const style = el.style;
    if (style) {
      for (let i = 0; i < style.length; i++) {
        const r = originalReader(style, style[i]);
        if (r === "absent") continue;
        inline[style[i]] = r ? r.value : style.getPropertyValue(style[i]);
      }
    }
    const breadcrumb = [];
    for (let p = el; p && p !== document.body && p !== document.documentElement; p = p.parentElement) breadcrumb.unshift(crumb(p));
    const source = await sourceOf2(el);
    const peers2 = source ? await sameSourceElements(el) : [el];
    const rect = el.getBoundingClientRect();
    return {
      uid: uidOf(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: Array.from(el.classList),
      label: labelOf(el),
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      breadcrumb,
      children: kidsOf(el).slice(0, 40).map(crumb),
      source,
      sameSource: peers2.length,
      sourceIndex: Math.max(0, peers2.indexOf(el)),
      callers: source ? await callersOf(el, peers2) : [],
      classCounts: Object.fromEntries(Array.from(el.classList, (c) => [c, peers2.filter((p) => p.classList.contains(c)).length])),
      computed,
      winners,
      vars,
      rules: matched.map((m) => ruleRef(m.fr, el)),
      inline,
      fontSizePx: parseFloat(cs.fontSize) || 16,
      rootFontSizePx: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
      backdrop: backdropOf(el),
      text: await textInfo(el, source),
      order: await orderInfo(el),
      props: await propsInfo(el),
      assets: countAssets(el)
    };
  }

  // src/verify.ts
  async function live(uid, refind) {
    const known2 = elOf(uid);
    return known2?.isConnected ? known2 : refind();
  }
  async function probeOrder(id, target2, expected, refind) {
    const want = expected.split("\n");
    if (target2.htmlPath) {
      const parentPath = target2.htmlPath.slice(0, -1);
      const got = await fetchedKids(parentPath);
      const ok = !!got && sameOrder(got.sigs, want);
      if (ok) {
        clearPreview(id);
        const p2 = parentOf2(target2) ?? elementAtPath(parentPath);
        if (p2) arrange(p2, want);
      }
      return { ok, actual: { order: (got?.shorts ?? []).join(" \xB7 ") }, attached: ok || hasPreview(id), found: true };
    }
    const a = target2.anchor;
    let p = parentOf2(target2) ?? (a ? (await findBySource(a.path, a.line, a.column, a.index))?.parentElement : null) ?? (await refind())?.parentElement ?? null;
    let hit = await matchIn(p, want, target2.mapped);
    if (!hit) {
      const found = await findGroup(want, target2.mapped);
      if (found) {
        p = found.p;
        hit = found.units;
      }
    }
    if (hit) clearPreview(id);
    const shown2 = hit ?? (p?.isConnected ? await groupOf(p, target2.mapped) : []);
    return { ok: !!hit, actual: { order: shown2.map(unitShort).join(" \xB7 ") }, attached: !!hit || hasPreview(id), found: !!p };
  }
  async function probeText(id, target2, expected, refind) {
    const want = expected.trim();
    if (target2.htmlPath) {
      const actual2 = await fetchedText(target2.htmlPath, target2.segment);
      const ok2 = actual2?.trim() === want;
      if (ok2 && hasTextPreview(id)) commitTextPreview(id, want);
      else if (ok2) {
        const el2 = elOf(target2.uid) ?? elementAtPath(target2.htmlPath);
        const node2 = el2 ? textNodesOf(el2)[target2.segment] : void 0;
        if (node2) node2.data = fill(node2.data, want);
      }
      return { ok: ok2, actual: { text: actual2 ?? "" }, attached: ok2 || textAttached(id), found: true };
    }
    const el = await live(target2.uid, refind);
    const node = el ? textNodesOf(el)[target2.segment] : void 0;
    const actual = node ? baseOf(node) : null;
    const ok = actual?.trim() === want;
    if (ok) clearPreview(id);
    return { ok, actual: { text: actual ?? "" }, attached: ok || textAttached(id), found: !!el };
  }
  async function probeStyle(id, target2, expected, refind) {
    const props = Object.keys(expected);
    const el = await live(target2.uid, refind);
    if (!el) return { ok: false, actual: {}, attached: previewAttached(id), found: false };
    const actual = beneath(() => {
      const cs = getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p).trim()]));
    });
    const ok = Object.entries(expected).every(([p, v]) => sameValue(p, actual[p] ?? "", v));
    if (ok) clearPreview(id);
    return { ok, actual, attached: ok || previewAttached(id, target2.kind === "inline" ? el : null), found: true };
  }
  function probe(id, target2, expected, refind) {
    if (target2.kind === "text") return probeText(id, target2, expected.text ?? "", refind);
    if (target2.kind === "order") return probeOrder(id, target2, expected.order ?? "", refind);
    if (target2.kind === "props") return probeProp(id, target2, expected, refind);
    return probeStyle(id, target2, expected, refind);
  }

  // src/index.ts
  var SUPERSEDED = 4409;
  var CLOSED = 4410;
  var Bridge = class {
    constructor(cfg, frame2, shell, bounced = false) {
      this.frame = frame2;
      this.shell = shell;
      this.bounced = bounced;
      this.cfg = cfg;
      if (!this.domReady) {
        document.addEventListener(
          "DOMContentLoaded",
          () => {
            this.domReady = true;
            if (this.helloPending) this.sendHello();
          },
          { once: true }
        );
      }
      this.watch();
      this.connect();
      window.addEventListener("dblclick", this.onDblClick, true);
      const anchor2 = () => this.selected?.isConnected ? this.selected : null;
      initMeasure(anchor2);
      initPick({
        anchor: anchor2,
        pick: (el) => {
          finish(true);
          mute(el);
          if (el !== this.selected) void this.select(el);
        },
        edit: (x, y) => void this.editAt(x, y),
        measureOff: () => {
          this.syncGrip();
          this.send({ t: "measure", on: false });
        }
      });
      this.syncGrip();
      this.urlTimer = window.setInterval(() => {
        if (location.href !== this.lastHref) {
          this.lastHref = location.href;
          this.sendPage();
        }
      }, 500);
      window.addEventListener("resize", this.onResize);
    }
    frame;
    shell;
    bounced;
    cfg;
    ws = null;
    retry = 0;
    timer = 0;
    selected = null;
    selectedLoc = null;
    refreshTimer = 0;
    lastHref = location.href;
    observer = null;
    urlTimer = 0;
    resizeTimer = 0;
    stopped = false;
    /** 被另一个标签页顶替了：不重连，等用户点提示接回来 */
    paused = false;
    /**
     * readyState 变成 interactive 之后、DOMContentLoaded 之前，模块脚本（以及 Vite 注入的 <style>）还没执行；
     * 只有真正收到 DOMContentLoaded 才算页面结构就绪
     */
    domReady = document.readyState !== "loading";
    helloPending = false;
    /** 站点被关掉时调用：断开连接、撤掉预览、高亮和面板，页面恢复原样 */
    shutdown() {
      this.stopped = true;
      clearTimeout(this.timer);
      clearTimeout(this.refreshTimer);
      clearTimeout(this.resizeTimer);
      clearInterval(this.urlTimer);
      clearTimeout(this.textTimer);
      this.observer?.disconnect();
      window.removeEventListener("dblclick", this.onDblClick, true);
      window.removeEventListener("resize", this.onResize);
      this.quiet();
      disposePick();
      disposeMeasure();
      try {
        this.ws?.close();
      } catch {
      }
      this.ws = null;
      this.shell?.remove();
      delete window.__CSS_TUNER_BRIDGE__;
    }
    /** 撤掉页面上的一切：预览、选中、选取和测量。监听和量的起点留着，被顶替后接回来还要用 */
    quiet() {
      finish(false);
      setPick(false);
      setMeasure(false);
      clearAll();
      setSelected(null);
      this.selected = null;
      this.selectedLoc = null;
    }
    /** 同一个站点在另一个标签页里连上了：这边退下，用户点提示时再接回来（那边会退下） */
    supersede() {
      this.paused = true;
      clearTimeout(this.timer);
      this.quiet();
      if (this.shell) this.shell.superseded(() => this.resume());
    }
    resume() {
      this.paused = false;
      this.retry = 0;
      this.connect();
    }
    configure(cfg) {
      const changed = cfg.ws !== this.cfg.ws || cfg.token !== this.cfg.token;
      this.cfg = cfg;
      if (changed) {
        this.retry = 0;
        try {
          this.ws?.close();
        } catch {
        }
        this.connect();
      }
    }
    connect() {
      clearTimeout(this.timer);
      if (this.stopped || this.paused) return;
      const { ws: path, token } = this.cfg;
      let ws;
      try {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${proto}//${location.host}${path}?token=${encodeURIComponent(token)}`);
      } catch {
        this.schedule();
        return;
      }
      this.ws = ws;
      ws.onopen = () => {
        this.retry = 0;
        if (this.domReady) this.sendHello();
        else this.helloPending = true;
      };
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.t === "req") void this.handle(msg);
      };
      ws.onclose = (ev) => {
        if (this.ws !== ws) return;
        this.ws = null;
        if (ev.code === SUPERSEDED) this.supersede();
        else if (ev.code === CLOSED) this.shutdown();
        else this.schedule();
      };
      ws.onerror = () => {
      };
    }
    /** 断了就重连（本地服务重启、升级后会在同一个端口上回来） */
    schedule() {
      clearTimeout(this.timer);
      if (this.stopped || this.paused) return;
      const delay = Math.min(3e3, 300 * 2 ** this.retry++);
      this.timer = window.setTimeout(() => this.connect(), delay);
    }
    onResize = () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.send({ t: "resize", w: innerWidth, h: innerHeight }), 150);
    };
    /** 交给 Codex 的注释落在哪个元素上：这次改动里看得见的，其次是选中的，再不然把第一个滚进视口 */
    annotationTarget(uids) {
      const els = uids.map(elOf).filter((e) => !!e);
      const seen = els.find(inView) ?? (this.selected?.isConnected && inView(this.selected) ? this.selected : null);
      if (seen) return seen;
      const first = els[0];
      if (first) {
        first.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        return first;
      }
      return document.body ?? document.documentElement;
    }
    /** 断着的时候发的事件直接丢掉：连回来的 hello 会让服务端重新同步页面 */
    send(ev) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(ev));
    }
    connected() {
      return !!this.ws && this.ws.readyState === WebSocket.OPEN;
    }
    sendHello() {
      this.helloPending = false;
      void whenHydrated().then(() => loadSheetSources()).then(() => {
        this.send({ t: "hello", session: this.cfg.session, page: pageInfo() });
        warmSources(0);
      });
    }
    /** 激活之前服务端渲染的样式表还会被换掉，等激活完再报 */
    sendPage() {
      void whenHydrated().then(() => loadSheetSources()).then(() => this.send({ t: "page", page: pageInfo() }));
    }
    textTimer = 0;
    orderTimer = 0;
    watch() {
      this.observer = new MutationObserver((records) => {
        let css = false;
        let lost = false;
        let added = false;
        let nodes = false;
        for (const r of records) {
          const t2 = r.target;
          if (isOwnNode(t2)) continue;
          const styleEl = t2 instanceof HTMLStyleElement ? t2 : t2.parentNode instanceof HTMLStyleElement ? t2.parentNode : null;
          if (styleEl || Array.from(r.addedNodes).some((n) => n instanceof HTMLStyleElement || n instanceof HTMLLinkElement)) css = true;
          if (this.selected && !this.selected.isConnected) lost = true;
          if (r.type === "attributes" && r.target === this.selected) css = true;
          if (r.type === "childList" && r.addedNodes.length) added = true;
          if (r.type === "childList") nodes = true;
        }
        if (css || lost) this.scheduleRefresh(css);
        if (added && this.connected()) warmSources();
        if (nodes && hasTextPreviews()) {
          clearTimeout(this.textTimer);
          this.textTimer = window.setTimeout(reapplyTexts, 30);
        }
        if (nodes && hasOrderPreviews()) {
          clearTimeout(this.orderTimer);
          this.orderTimer = window.setTimeout(() => void reapplyOrders().then(redraw), 30);
        }
      });
      this.observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    }
    scheduleRefresh(cssChanged) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(async () => {
        prune();
        if (cssChanged) {
          reattachRules();
          this.sendPage();
        }
        if (this.selected && !this.selected.isConnected) {
          const again = await this.refind();
          if (again) this.selected = again;
        }
        if (this.selected) await this.emitSelection();
      }, 120);
    }
    async refind() {
      const loc = this.selectedLoc;
      if (!loc) return null;
      return findBySource(loc.path, loc.line, loc.column, loc.index);
    }
    async emitSelection() {
      const el = this.selected;
      if (!el || !el.isConnected) {
        setSelected(null);
        this.send({ t: "select", el: null });
        return null;
      }
      const snap = await snapshot(el);
      const same = snap.source ? await sameSourceElements(el) : [el];
      const note = snap.source ? `${snap.source.path.split("/").pop()}:${snap.source.line}` : "";
      setSelected(el, note, same);
      this.setDrag(el, snap);
      if (snap.source) this.selectedLoc = { ...snap.source, index: Math.max(0, same.indexOf(el)) };
      this.send({ t: "select", el: snap });
      return snap;
    }
    /** 选中元素有可以换序的兄弟时，覆盖层上显示把手；放下时把位置（按页面上看到的顺序）发给服务端 */
    setDrag(el, snap) {
      const info = snap.order;
      if (!info) {
        setDragModel(null);
        return;
      }
      const units = info.units.map((u) => u.uids);
      setDragModel({
        axis: info.axis,
        boxes: () => {
          const p = el.parentElement;
          if (!p || !el.isConnected) return null;
          const order = activeOrder(p) ?? units.map((_, i) => i);
          if (order.length !== units.length) return null;
          const boxes = visibleBoxes(units, order);
          return boxes.every(Boolean) ? { boxes, index: order.indexOf(info.index) } : null;
        },
        drop: (to) => this.send({ t: "reorder", uid: uidOf(el), to })
      });
    }
    async select(el) {
      this.selected = el;
      this.selectedLoc = null;
      if (el) {
        const s = await sourceOf2(el);
        if (s) this.selectedLoc = { ...s, index: 0 };
      }
      return this.emitSelection();
    }
    /** 选中元素里面 (x, y) 处的文字就地编辑；文字不在选中元素自己身上时先改选文字所在的元素。那里没有能改的文字返回 false */
    editAt(x, y) {
      if (isEditingText() || !this.selected || !this.connected()) return false;
      const hit = textAt(x, y, this.selected);
      const el = hit?.node.parentElement;
      if (!hit || !el || isOwnNode(el) || el.isContentEditable || el.closest("input, textarea, select")) return false;
      const segment = textNodesOf(el).indexOf(hit.node);
      if (segment < 0) return false;
      void (async () => {
        if (el !== this.selected) await this.select(el);
        const uid = uidOf(el);
        beginEdit(hit.node, hit.offset, (value, phase) => this.send({ t: "editText", uid, segment, value, phase }));
      })();
      return true;
    }
    /** 自由选择里的双击由 pick.ts 拦下来转给 editAt */
    onDblClick = (e) => {
      if (pickOn() || measureOn() || !this.editAt(e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    /** 把手只在自由选择里露出来；标尺开着时点击留给改选中 */
    syncGrip() {
      setGripHidden(!pickOn() || measureOn());
    }
    handlers = {
      ping: () => "pong",
      pageInfo: async () => {
        await whenHydrated();
        await loadSheetSources();
        return pageInfo();
      },
      env: () => ({
        w: innerWidth,
        h: innerHeight,
        ua: navigator.userAgent,
        lang: navigator.language,
        framed: !!this.frame,
        bounced: this.bounced
      }),
      navigate: ({ url }) => {
        const u = new URL(url, location.href);
        if (u.protocol !== "http:" && u.protocol !== "https:") return false;
        const win = this.frame && u.origin !== location.origin ? window.top ?? window : window;
        setTimeout(() => win.location.assign(u.href), 30);
        return true;
      },
      reload: () => {
        setTimeout(() => location.reload(), 30);
        return true;
      },
      setPick: ({ on }) => {
        setPick(on);
        this.syncGrip();
        this.send({ t: "pick", on: pickOn() });
        return pickOn();
      },
      setMeasure: ({ on }) => {
        setMeasure(on);
        this.syncGrip();
        this.send({ t: "measure", on: measureOn() });
        return measureOn();
      },
      measureSteps: ({ steps: steps2 }) => {
        setMeasureSteps(steps2);
        return true;
      },
      select: async (q) => this.select(await find(q)),
      resolve: async (q) => {
        const el = await find(q);
        return el ? uidOf(el) : null;
      },
      snapshot: async () => this.selected && this.selected.isConnected ? snapshot(this.selected) : null,
      preview: async ({ id, target: target2, decls = {}, text, prop }) => {
        const count = await preview(id, target2, decls, text, prop);
        const el = elOf(target2.uid);
        const computed = {};
        if (el) {
          const cs = getComputedStyle(el);
          for (const p of Object.keys(decls)) computed[p] = cs.getPropertyValue(p).trim();
        }
        redraw();
        return { computed, count };
      },
      clearPreview: ({ id }) => {
        const had = clearPreview(id);
        redraw();
        return had;
      },
      clearAllPreviews: () => clearAll(),
      fallback: ({ uid, props }) => {
        const el = elOf(uid);
        return el ? fallbackValues(el, props) : null;
      },
      hover: ({ uid }) => {
        const el = uid ? elOf(uid) : null;
        setHover(el, true);
        return !!el;
      },
      probe: ({ id, target: target2, expected, source }) => probe(id, target2, expected, () => source ? findBySource(source.path, source.line, source.column, source.index) : this.refind()),
      reloadSheets: ({ hrefs }) => reloadSheets(hrefs),
      assets: async () => this.selected && this.selected.isConnected ? listAssets(this.selected) : { items: [], count: 0, more: false },
      assetData: ({ id, as }) => assetData(id, as),
      fonts: () => pageFonts()
    };
    async handle(req) {
      const fn = this.handlers[req.m];
      if (!fn) {
        this.send({ t: "res", id: req.id, ok: false, error: `unknown method ${req.m}` });
        return;
      }
      try {
        const data = await fn(req.p ?? {});
        this.send({ t: "res", id: req.id, ok: true, data });
      } catch (e) {
        this.send({ t: "res", id: req.id, ok: false, error: String(e?.stack || e) });
      }
    }
  };
  async function findOnce(q) {
    if (q.uid) return elOf(q.uid);
    if (q.selector) return document.querySelectorAll(q.selector)[q.index ?? 0] ?? null;
    if (q.source) return findBySource(q.source.path, q.source.line, q.source.column, q.source.index ?? 0);
    return null;
  }
  async function find(q) {
    const deadline = Date.now() + Math.min(q.waitMs ?? 0, 1e4);
    for (; ; ) {
      const el = await findOnce(q);
      if (el || Date.now() >= deadline) return el;
      await sleep(120);
    }
  }
  function sheetUrls(sheet, out2 = /* @__PURE__ */ new Set(), depth = 0) {
    if (!sheet || depth > 8) return out2;
    if (sheet.href) out2.add(sheet.href.split("?")[0]);
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      return out2;
    }
    for (const r of Array.from(rules)) {
      if (r instanceof CSSImportRule) sheetUrls(r.styleSheet, out2, depth + 1);
      else if (!(r instanceof CSSLayerStatementRule)) break;
    }
    return out2;
  }
  function reloadSheets(hrefs) {
    const links = Array.from(document.querySelectorAll('link[rel~="stylesheet"]'));
    const wanted = hrefs?.map((h) => new URL(h, location.href).href.split("?")[0]);
    let n = 0;
    for (const link of links) {
      const base = link.href.split("?")[0];
      if (wanted) {
        const urls = sheetUrls(link.sheet);
        urls.add(base);
        if (!wanted.some((h) => urls.has(h))) continue;
      }
      const next = link.cloneNode();
      next.href = `${base}?css-tuner=${Date.now()}`;
      next.addEventListener("load", () => link.remove(), { once: true });
      next.addEventListener("error", () => next.remove(), { once: true });
      link.after(next);
      n++;
    }
    return n;
  }
  function modeOf(cfg) {
    if (window.top === window) return { mode: location.pathname === cfg.frame ? "frame-page" : "page", frame: null, shell: null };
    try {
      const parent = window.parent;
      if (parent.location.origin === location.origin && parent.location.pathname === cfg.frame) {
        const api2 = parent.__CSS_TUNER_FRAME__;
        if (api2 && api2.element === window.frameElement) return { mode: "framed", frame: api2, shell: parent.__CSS_TUNER_PANEL_HOST__ ?? null };
      }
    } catch {
    }
    return { mode: "none", frame: null, shell: null };
  }
  function mountShell(cfg, beside = false) {
    const shell = new PanelShell(cfg.panel, cfg.text, beside);
    window.__CSS_TUNER_PANEL_HOST__ = shell;
    const mount = () => void whenHydrated().then(() => shell.mount());
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
    else mount();
    return shell;
  }
  function boot(cfg) {
    const { mode, frame: frame2, shell: outer } = modeOf(cfg);
    if (mode === "none") return;
    if (mode === "frame-page") {
      mountShell(cfg, true);
      installAnnotate(() => window.__CSS_TUNER_FRAME__?.element ?? document.body);
      return;
    }
    const w = window;
    let bounced = false;
    if (mode === "page" && !w.__CSS_TUNER_BRIDGE__ && !savedPanelState().float) {
      const r = wrapIntoFrame(cfg.frame, { stop: true });
      if (r === "wrapped") return;
      bounced = r === "bounced";
    }
    installHook();
    if (w.__CSS_TUNER_BRIDGE__) {
      w.__CSS_TUNER_BRIDGE__.configure(cfg);
      return;
    }
    const shell = mode === "page" ? mountShell(cfg) : outer;
    if (bounced) shell?.setFloat(true);
    const bridge = new Bridge(cfg, frame2, shell, bounced);
    w.__CSS_TUNER_BRIDGE__ = bridge;
    if (mode === "page") {
      installAnnotate((uids) => bridge.annotationTarget(uids));
      addEventListener(FLOAT_EVENT, (e) => {
        if (!e.detail.float) wrapIntoFrame(cfg.frame, { force: true });
      });
    }
  }
  return __toCommonJS(index_exports);
})();
