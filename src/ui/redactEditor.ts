import type { Box } from "../core/types";
import "./pro.css";

export interface RedactEditorHandle {
  getBoxes(): Box[];
  destroy(): void;
}

const MIN_BOX_SIZE = 6; // AIDEV-NOTE: drop accidental clicks that produce a near-zero box

export function mountRedactEditor(
  el: HTMLElement,
  bitmapOrImageData: ImageBitmap | ImageData,
  initial: Box[],
): RedactEditorHandle {
  const boxes: Box[] = initial.map((b) => ({ ...b }));
  let selected: Box | null = null;
  let dragOrigin: { x: number; y: number } | null = null;
  let draggingBox: Box | null = null;

  const wrapper = document.createElement("div");
  wrapper.className = "photolock-redact-editor";

  const note = document.createElement("p");
  note.className = "photolock-redact-note";
  note.textContent = "Helps hide faces. Review boxes before applying.";

  const canvas = document.createElement("canvas");
  canvas.width = bitmapOrImageData.width;
  canvas.height = bitmapOrImageData.height;
  canvas.className = "photolock-redact-canvas";
  canvas.tabIndex = 0;

  wrapper.appendChild(note);
  wrapper.appendChild(canvas);
  el.appendChild(wrapper);

  const ctx = canvas.getContext("2d");

  function draw(): void {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bitmapOrImageData instanceof ImageData) {
      ctx.putImageData(bitmapOrImageData, 0, 0);
    } else {
      ctx.drawImage(bitmapOrImageData, 0, 0);
    }
    for (const box of boxes) {
      ctx.strokeStyle = box === selected ? "#ff3b30" : "#ffd60a";
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
    }
  }

  function boxAt(x: number, y: number): Box | null {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  function pointerPos(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: PointerEvent): void {
    const { x, y } = pointerPos(e);
    const hit = boxAt(x, y);
    if (hit) {
      selected = hit;
      draw();
      return;
    }
    selected = null;
    dragOrigin = { x, y };
    draggingBox = { x, y, w: 0, h: 0, source: "manual" };
    boxes.push(draggingBox);
    draw();
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragOrigin || !draggingBox) return;
    const { x, y } = pointerPos(e);
    draggingBox.x = Math.min(dragOrigin.x, x);
    draggingBox.y = Math.min(dragOrigin.y, y);
    draggingBox.w = Math.abs(x - dragOrigin.x);
    draggingBox.h = Math.abs(y - dragOrigin.y);
    draw();
  }

  function onPointerUp(): void {
    if (draggingBox && (draggingBox.w < MIN_BOX_SIZE || draggingBox.h < MIN_BOX_SIZE)) {
      const idx = boxes.indexOf(draggingBox);
      if (idx >= 0) boxes.splice(idx, 1);
    }
    dragOrigin = null;
    draggingBox = null;
    draw();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      const idx = boxes.indexOf(selected);
      if (idx >= 0) boxes.splice(idx, 1);
      selected = null;
      draw();
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("keydown", onKeyDown);

  draw();

  return {
    getBoxes(): Box[] {
      return boxes.map((b) => ({ ...b }));
    },
    destroy(): void {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("keydown", onKeyDown);
      wrapper.remove();
    },
  };
}
