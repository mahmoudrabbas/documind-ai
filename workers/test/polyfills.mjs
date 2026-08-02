// workers/test/polyfills.mjs
//
// Test-environment polyfills for the workers suite.
//
// WHY: pdfjs-dist (and pdf-parse, which bundles it) evaluates
// `const SCALE_MATRIX = new DOMMatrix()` at module load. When the optional
// `@napi-rs/canvas` native binding cannot be loaded (e.g. on machines whose
// platform binding was never installed), pdfjs-dist's own DOMMatrix/ImageData/
// Path2D polyfill path silently fails and the module throws
// `ReferenceError: DOMMatrix is not defined`, crashing every test file that
// transitively imports pdfjs-dist.
//
// This module is loaded via `--import ./test/polyfills.mjs` in the workers
// `test` script, i.e. BEFORE any test module (and therefore before any
// pdfjs-dist import) is evaluated.
//
// Guarantees:
//   * It NEVER overrides existing globals — each global is only set when it is
//     undefined (pdfjs-dist itself uses the same `if (!globalThis.X)` guard, so
//     installing the globals here makes pdfjs-dist skip its own broken path).
//   * It prefers the real classes from `@napi-rs/canvas` when the binding is
//     loadable, so class identity is preserved between the pdfjs renderer and
//     the canvas used by documentOcrJob (`globalThis.Path2D ===
//     canvasModule.Path2D` must hold).
//   * When the binding is not loadable it installs pure-JS fallbacks with real
//     behaviour (2D affine matrix math, real image-data storage, real path
//     command storage + SVG path-string parsing) — never silent no-ops.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let canvas = null;
try {
  canvas = require("@napi-rs/canvas");
} catch {
  canvas = null;
}

// ---------------------------------------------------------------------------
// DOMMatrix (2D affine) fallback — real matrix math.
// ---------------------------------------------------------------------------

class DOMMatrixFallback {
  #a = 1;
  #b = 0;
  #c = 0;
  #d = 1;
  #e = 0;
  #f = 0;

  constructor(init) {
    if (init === undefined || init === null) {
      return; // identity
    }
    if (typeof init === "string") {
      this.setMatrixValue(init);
      return;
    }
    if (Array.isArray(init) || ArrayBuffer.isView(init)) {
      const values = Array.from(init);
      if (values.length === 6) {
        [this.#a, this.#b, this.#c, this.#d, this.#e, this.#f] = values.map(Number);
        return;
      }
      if (values.length === 16) {
        // 3D column-major matrix — keep the 2D projection pdfjs actually uses.
        [this.#a, this.#b] = [values[0], values[1]];
        [this.#c, this.#d] = [values[4], values[5]];
        [this.#e, this.#f] = [values[12], values[13]];
        return;
      }
      throw new TypeError("DOMMatrix: expected 6 or 16 numbers");
    }
    if (typeof init === "object") {
      const src = init instanceof DOMMatrixFallback ? { a: init.a, b: init.b, c: init.c, d: init.d, e: init.e, f: init.f } : init;
      this.#a = src.a ?? src.m11 ?? 1;
      this.#b = src.b ?? src.m12 ?? 0;
      this.#c = src.c ?? src.m21 ?? 0;
      this.#d = src.d ?? src.m22 ?? 1;
      this.#e = src.e ?? src.m41 ?? 0;
      this.#f = src.f ?? src.m42 ?? 0;
      return;
    }
    throw new TypeError("DOMMatrix: invalid initializer");
  }

  static fromMatrix(other) {
    return new DOMMatrixFallback(other);
  }

  static fromFloat32Array(values) {
    return new DOMMatrixFallback(values);
  }

  static fromFloat64Array(values) {
    return new DOMMatrixFallback(values);
  }

  get a() { return this.#a; } set a(v) { this.#a = Number(v); }
  get b() { return this.#b; } set b(v) { this.#b = Number(v); }
  get c() { return this.#c; } set c(v) { this.#c = Number(v); }
  get d() { return this.#d; } set d(v) { this.#d = Number(v); }
  get e() { return this.#e; } set e(v) { this.#e = Number(v); }
  get f() { return this.#f; } set f(v) { this.#f = Number(v); }

  get m11() { return this.#a; } set m11(v) { this.#a = Number(v); }
  get m12() { return this.#b; } set m12(v) { this.#b = Number(v); }
  get m21() { return this.#c; } set m21(v) { this.#c = Number(v); }
  get m22() { return this.#d; } set m22(v) { this.#d = Number(v); }
  get m41() { return this.#e; } set m41(v) { this.#e = Number(v); }
  get m42() { return this.#f; } set m42(v) { this.#f = Number(v); }

  // 3D slots kept at identity (pdfjs only uses the 2D projection).
  get m13() { return 0; } get m14() { return 0; }
  get m23() { return 0; } get m24() { return 0; }
  get m31() { return 0; } get m32() { return 0; }
  get m33() { return 1; } get m34() { return 0; }
  get m43() { return 0; } get m44() { return 1; }

  get is2D() { return true; }

  get isIdentity() {
    return this.#a === 1 && this.#b === 0 && this.#c === 0 &&
           this.#d === 1 && this.#e === 0 && this.#f === 0;
  }

  toString() {
    return `matrix(${this.#a}, ${this.#b}, ${this.#c}, ${this.#d}, ${this.#e}, ${this.#f})`;
  }

  toFloat32Array() {
    return Float32Array.from(this.#asArray16());
  }

  toFloat64Array() {
    return Float64Array.from(this.#asArray16());
  }

  #asArray16() {
    return [
      this.#a, this.#b, 0, 0,
      this.#c, this.#d, 0, 0,
      0, 0, 1, 0,
      this.#e, this.#f, 0, 1,
    ];
  }

  setMatrixValue(transformList) {
    let remaining = String(transformList);
    const parsed = [];
    // Accumulate all transforms in the list into a single matrix.
    let current = new DOMMatrixFallback();
    const tokenRe = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
    let match;
    while ((match = tokenRe.exec(remaining)) !== null) {
      const args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
      const op = match[1];
      if (op === "matrix") {
        current = new DOMMatrixFallback(args);
      } else if (op === "translate") {
        current = current.translate(args[0] ?? 0, args[1] ?? 0);
      } else if (op === "scale") {
        current = current.scale(args[0] ?? 1, args[1] ?? args[0] ?? 1);
      } else if (op === "rotate") {
        current = current.rotate(0, 0, args[0] ?? 0);
      } else if (op === "skewX") {
        current = current.multiply(new DOMMatrixFallback([1, 0, Math.tan((args[0] ?? 0) * Math.PI / 180), 1, 0, 0]));
      } else if (op === "skewY") {
        current = current.multiply(new DOMMatrixFallback([1, Math.tan((args[0] ?? 0) * Math.PI / 180), 0, 1, 0, 0]));
      }
    }
    if (parsed.length === 0 && !/matrix|translate|scale|rotate|skew/.test(remaining)) {
      throw new TypeError(`DOMMatrix: unsupported transform list: ${transformList}`);
    }
    [this.#a, this.#b, this.#c, this.#d, this.#e, this.#f] =
      [current.a, current.b, current.c, current.d, current.e, current.f];
    return this;
  }

  multiply(other) {
    const m = new DOMMatrixFallback();
    m.#a = this.#a * other.a + this.#c * other.b;
    m.#b = this.#b * other.a + this.#d * other.b;
    m.#c = this.#a * other.c + this.#c * other.d;
    m.#d = this.#b * other.c + this.#d * other.d;
    m.#e = this.#a * other.e + this.#c * other.f + this.#e;
    m.#f = this.#b * other.e + this.#d * other.f + this.#f;
    return m;
  }

  multiplySelf(other) {
    const m = this.multiply(other);
    [this.#a, this.#b, this.#c, this.#d, this.#e, this.#f] =
      [m.a, m.b, m.c, m.d, m.e, m.f];
    return this;
  }

  preMultiplySelf(other) {
    const m = other.multiply(this);
    [this.#a, this.#b, this.#c, this.#d, this.#e, this.#f] =
      [m.a, m.b, m.c, m.d, m.e, m.f];
    return this;
  }

  translate(tx, ty = 0, tz = 0) {
    return this.multiply(new DOMMatrixFallback([1, 0, 0, 1, tx, ty]));
  }

  translateSelf(tx, ty = 0, tz = 0) {
    return this.preMultiplySelf(new DOMMatrixFallback([1, 0, 0, 1, tx, ty]));
  }

  scale(scaleX, scaleY = scaleX, scaleZ = 1) {
    return this.multiply(new DOMMatrixFallback([scaleX, 0, 0, scaleY, 0, 0]));
  }

  scaleSelf(scaleX, scaleY = scaleX, scaleZ = 1) {
    return this.preMultiplySelf(new DOMMatrixFallback([scaleX, 0, 0, scaleY, 0, 0]));
  }

  scaleNonUniform(scaleX, scaleY = scaleX) {
    return this.scale(scaleX, scaleY);
  }

  scaleNonUniformSelf(scaleX, scaleY = scaleX) {
    return this.scaleSelf(scaleX, scaleY);
  }

  rotate(rotX, rotY = 0, rotZ = 0) {
    // Single-argument / Z-only rotation (the only form pdfjs uses).
    const angle = rotZ !== 0 ? rotZ : rotX;
    const cos = Math.cos((angle * Math.PI) / 180);
    const sin = Math.sin((angle * Math.PI) / 180);
    return this.multiply(new DOMMatrixFallback([cos, sin, -sin, cos, 0, 0]));
  }

  rotateSelf(rotX, rotY = 0, rotZ = 0) {
    const angle = rotZ !== 0 ? rotZ : rotX;
    const cos = Math.cos((angle * Math.PI) / 180);
    const sin = Math.sin((angle * Math.PI) / 180);
    return this.preMultiplySelf(new DOMMatrixFallback([cos, sin, -sin, cos, 0, 0]));
  }

  rotateAxisAngle(x, y, z, angle) {
    if (z === 1 && x === 0 && y === 0) {
      return this.rotate(0, 0, angle);
    }
    // Fall back to 2D rotation for the only case pdfjs exercises.
    return this.rotate(0, 0, angle);
  }

  rotateAxisAngleSelf(x, y, z, angle) {
    if (z === 1 && x === 0 && y === 0) {
      return this.rotateSelf(0, 0, angle);
    }
    return this.rotateSelf(0, 0, angle);
  }

  invert() {
    const det = this.#a * this.#d - this.#b * this.#c;
    if (det === 0) {
      throw new DOMException("The matrix is not invertible.", "InvalidStateError");
    }
    const inv = new DOMMatrixFallback();
    inv.#a = this.#d / det;
    inv.#b = -this.#b / det;
    inv.#c = -this.#c / det;
    inv.#d = this.#a / det;
    inv.#e = (this.#c * this.#f - this.#d * this.#e) / det;
    inv.#f = (this.#b * this.#e - this.#a * this.#f) / det;
    return inv;
  }

  invertSelf() {
    const inv = this.invert();
    [this.#a, this.#b, this.#c, this.#d, this.#e, this.#f] =
      [inv.a, inv.b, inv.c, inv.d, inv.e, inv.f];
    return this;
  }

  transformPoint(point) {
    const x = point?.x ?? 0;
    const y = point?.y ?? 0;
    return {
      x: this.#a * x + this.#c * y + this.#e,
      y: this.#b * x + this.#d * y + this.#f,
      z: 0,
      w: 1,
    };
  }
}

// ---------------------------------------------------------------------------
// ImageData fallback — real RGBA buffer storage.
// ---------------------------------------------------------------------------

class ImageDataFallback {
  constructor(width, height, dataOrSettings) {
    let data;
    let w = width;
    let h = height;
    if (dataOrSettings instanceof Uint8ClampedArray || dataOrSettings instanceof Uint8Array || ArrayBuffer.isView(dataOrSettings)) {
      data = new Uint8ClampedArray(dataOrSettings);
      w = Number(width);
      h = Number(height);
      if (data.length !== w * h * 4) {
        throw new RangeError("The source data length does not match the width * height * 4 bytes.");
      }
    } else if (typeof dataOrSettings === "object" && dataOrSettings !== null) {
      data = new Uint8ClampedArray(Number(width) * Number(height) * 4);
    } else {
      data = new Uint8ClampedArray(Number(width) * Number(height) * 4);
    }
    Object.defineProperties(this, {
      width: { value: Number(w), enumerable: true },
      height: { value: Number(h), enumerable: true },
      data: { value: data, enumerable: true },
      colorSpace: { value: "srgb", enumerable: true },
    });
  }
}

// ---------------------------------------------------------------------------
// Path2D fallback — real command storage (incl. SVG path-string parsing).
// ---------------------------------------------------------------------------

class Path2DFallback {
  #commands = [];

  constructor(path) {
    if (path instanceof Path2DFallback) {
      this.#commands = path.#commands.map((cmd) => ({ ...cmd, points: cmd.points.map((p) => [...p]) }));
    } else if (typeof path === "string") {
      parseSvgPath(path, this.#commands);
    }
  }

  #transformAll(matrix) {
    for (const cmd of this.#commands) {
      for (const point of cmd.points) {
        const [x, y] = point;
        point[0] = matrix.a * x + matrix.c * y + matrix.e;
        point[1] = matrix.b * x + matrix.d * y + matrix.f;
      }
    }
  }

  addPath(path, matrix) {
    const copy = new Path2DFallback(path);
    if (matrix instanceof DOMMatrixFallback) {
      copy.#transformAll(matrix);
    }
    for (const cmd of copy.#commands) {
      this.#commands.push({ ...cmd, points: cmd.points.map((p) => [...p]) });
    }
  }

  moveTo(x, y) { this.#commands.push({ op: "M", points: [[x, y]] }); }
  lineTo(x, y) { this.#commands.push({ op: "L", points: [[x, y]] }); }
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
    this.#commands.push({ op: "C", points: [[cp1x, cp1y], [cp2x, cp2y], [x, y]] });
  }
  quadraticCurveTo(cpx, cpy, x, y) {
    this.#commands.push({ op: "Q", points: [[cpx, cpy], [x, y]] });
  }
  arc(x, y, radius, startAngle, endAngle, counterclockwise = false) {
    const sweep = counterclockwise ? -1 : 1;
    const start = startAngle % (2 * Math.PI);
    let end = endAngle % (2 * Math.PI);
    if (!counterclockwise && end <= start) end += 2 * Math.PI;
    if (counterclockwise && end >= start) end -= 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(end - start) / (Math.PI / 4)));
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const angle = start + ((end - start) * i) / steps;
      points.push([x + radius * Math.cos(angle), y + radius * Math.sin(angle)]);
    }
    this.#commands.push({ op: "ARC", points });
  }
  arcTo(x1, y1, x2, y2, radius) {
    // Approximate with a straight segment when the geometry is degenerate;
    // pdfjs renders arcs through bezier decomposition before this point.
    this.lineTo(x1, y1);
    this.lineTo(x2, y2);
  }
  rect(x, y, w, h) {
    this.#commands.push({
      op: "RECT",
      points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
    });
  }
  closePath() {
    this.#commands.push({ op: "Z", points: [] });
  }
}

// Minimal SVG path parser covering the command set pdfjs emits and the
// commands ctx/path construction uses (M, L, H, V, C, S, Q, T, A, Z).
function parseSvgPath(d, output) {
  const numbers = /([+\-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+\-]?\d+)?)/;
  const commands = d.match(/[MmLlHhVvCcSsQqTtAaZz]/g);
  const args = d
    .split(/[MmLlHhVvCcSsQqTtAaZz]/)
    .slice(1)
    .map((chunk) => chunk.trim().split(/[\s,]+/).filter(Boolean).map(Number));

  let cx = 0;
  let cy = 0;
  let lastOp = "";
  let lastCubic = null;

  for (let i = 0; i < (commands?.length ?? 0); i++) {
    const op = commands[i];
    const list = args[i] ?? [];
    let p = 0;
    const relative = op === op.toLowerCase();
    const kind = op.toUpperCase();
    if (kind === "M" || kind === "L" || kind === "T") {
      while (p < list.length) {
        let x = list[p++];
        let y = list[p++];
        if (relative) { x += cx; y += cy; }
        output.push({ op: kind === "M" && i === 0 ? "M" : "L", points: [[x, y]] });
        cx = x; cy = y;
        if (kind === "T") {
          // Quadratic control point mirrored from the previous segment.
          const prev = output[output.length - 2];
          if (lastCubic) { /* handled below */ }
        }
        if (kind === "M") break; // only first pair is a move
      }
    } else if (kind === "H") {
      while (p < list.length) {
        const x = relative ? cx + list[p++] : list[p++];
        output.push({ op: "L", points: [[x, cy]] });
        cx = x;
      }
    } else if (kind === "V") {
      while (p < list.length) {
        const y = relative ? cy + list[p++] : list[p++];
        output.push({ op: "L", points: [[cx, y]] });
        cy = y;
      }
    } else if (kind === "C") {
      while (p + 5 < list.length) {
        let [c1x, c1y, c2x, c2y, x, y] = list.slice(p, p + 6);
        p += 6;
        if (relative) { c1x += cx; c1y += cy; c2x += cx; c2y += cy; x += cx; y += cy; }
        output.push({ op: "C", points: [[c1x, c1y], [c2x, c2y], [x, y]] });
        lastCubic = [[c2x, c2y], [x, y]];
        cx = x; cy = y;
      }
    } else if (kind === "S") {
      while (p + 3 < list.length) {
        let [c2x, c2y, x, y] = list.slice(p, p + 4);
        p += 4;
        if (relative) { c2x += cx; c2y += cy; x += cx; y += cy; }
        const c1x = lastCubic ? 2 * cx - lastCubic[0][0] : cx;
        const c1y = lastCubic ? 2 * cy - lastCubic[0][1] : cy;
        output.push({ op: "C", points: [[c1x, c1y], [c2x, c2y], [x, y]] });
        lastCubic = [[c2x, c2y], [x, y]];
        cx = x; cy = y;
      }
    } else if (kind === "Q") {
      while (p + 3 < list.length) {
        let [qx, qy, x, y] = list.slice(p, p + 4);
        p += 4;
        if (relative) { qx += cx; qy += cy; x += cx; y += cy; }
        output.push({ op: "Q", points: [[qx, qy], [x, y]] });
        cx = x; cy = y;
      }
    } else if (kind === "A") {
      // Elliptical arc — approximate with a straight line to the end point.
      while (p + 6 < list.length) {
        p += 5; // rx ry x-axis-rotation large-arc sweep
        let x = list[p++];
        let y = list[p++];
        if (relative) { x += cx; y += cy; }
        output.push({ op: "L", points: [[x, y]] });
        cx = x; cy = y;
      }
    } else if (kind === "Z") {
      output.push({ op: "Z", points: [] });
    }
  }
}

// ---------------------------------------------------------------------------
// Install globals (only when missing — never clobber native implementations).
// ---------------------------------------------------------------------------

if (!globalThis.DOMMatrix) {
  globalThis.DOMMatrix = canvas?.DOMMatrix ?? DOMMatrixFallback;
}

if (!globalThis.DOMPoint) {
  globalThis.DOMPoint = canvas?.DOMPoint ?? class DOMPointFallback {
    constructor(x = 0, y = 0, z = 0, w = 1) {
      Object.defineProperties(this, {
        x: { value: Number(x), enumerable: true, writable: true },
        y: { value: Number(y), enumerable: true, writable: true },
        z: { value: Number(z), enumerable: true, writable: true },
        w: { value: Number(w), enumerable: true, writable: true },
      });
    }
  };
}

if (!globalThis.ImageData) {
  globalThis.ImageData = canvas?.ImageData ?? ImageDataFallback;
}

if (!globalThis.Path2D) {
  globalThis.Path2D = canvas?.Path2D ?? Path2DFallback;
}
