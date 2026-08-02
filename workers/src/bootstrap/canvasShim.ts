import * as canvas from "@napi-rs/canvas";

/**
 * Ensure the runtime uses the native Path2D implementation from the canvas
 * renderer and that PDF.js and the renderer share the same class reference.
 */
if (globalThis.Path2D !== canvas.Path2D) {
  // Cast through a loose record type to bypass the structural mismatch between
  // the DOM's built-in Path2D and @napi-rs/canvas's Path2D (which adds extra
  // methods: op, toSVGString, getFillType, etc.). The runtime value is correct;
  // this cast is intentionally narrow — only used for this one assignment.
  (globalThis as Record<string, unknown>).Path2D = canvas.Path2D;
}

export const Canvas = canvas;
export default Canvas;
