import * as canvas from "@napi-rs/canvas";

/**
 * Ensure the runtime uses the native Path2D implementation from the canvas
 * renderer and that PDF.js and the renderer share the same class reference.
 */
if (globalThis.Path2D !== canvas.Path2D) {
  globalThis.Path2D = canvas.Path2D;
}

export const Canvas = canvas;
export default Canvas;
