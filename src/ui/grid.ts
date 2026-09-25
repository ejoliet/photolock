import type { ProcessResult } from "../core/types";

export interface GridController {
  addResult(r: ProcessResult): void;
  markFailed(name: string, err: Error, retry: () => void): void;
  setProgress(done: number, total: number): void;
}

interface Card {
  el: HTMLElement;
  objectUrl?: string;
}

// AIDEV-NOTE: one card per (file, preset) key so a batch that processes the same file
// through multiple presets shows one thumbnail per output, not one per source file.
export function mountGrid(el: HTMLElement, onResultClick?: (r: ProcessResult) => void): GridController {
  el.innerHTML = "";
  const progressEl = document.createElement("div");
  progressEl.className = "grid-progress";
  const cardsEl = document.createElement("div");
  cardsEl.className = "grid-cards";
  el.appendChild(progressEl);
  el.appendChild(cardsEl);

  const cards = new Map<string, Card>();

  function keyFor(file: string, presetId: string): string {
    return `${file}::${presetId}`;
  }

  function ensureCard(key: string): Card {
    let card = cards.get(key);
    if (!card) {
      const cardEl = document.createElement("div");
      cardEl.className = "grid-card";
      cardsEl.appendChild(cardEl);
      card = { el: cardEl };
      cards.set(key, card);
    }
    return card;
  }

  return {
    addResult(r: ProcessResult): void {
      const key = keyFor(r.file, r.presetId);
      const card = ensureCard(key);
      if (card.objectUrl) URL.revokeObjectURL(card.objectUrl);

      // AIDEV-NOTE: see io/zip.ts downloadBlob for why this cast is needed (TS 5.7+
      // generic Uint8Array vs. BlobPart's ArrayBuffer-only constraint).
      const blob = new Blob([r.bytes as unknown as BlobPart], {
        type: `image/${r.format === "jpeg" ? "jpeg" : r.format}`,
      });
      const url = URL.createObjectURL(blob);
      card.objectUrl = url;

      card.el.innerHTML = "";
      const img = document.createElement("img");
      img.src = url;
      img.width = 160;
      const caption = document.createElement("p");
      caption.textContent = `${r.file} (${r.presetId}) ${r.width}x${r.height}`;
      if (r.targetUnreachable) {
        caption.textContent += " — could not reach target size";
      }
      card.el.appendChild(img);
      card.el.appendChild(caption);
      if (onResultClick) {
        card.el.style.cursor = "pointer";
        card.el.onclick = () => onResultClick(r);
      }
    },

    markFailed(name: string, err: Error, retry: () => void): void {
      const key = keyFor(name, "");
      const card = ensureCard(key);
      card.el.innerHTML = "";
      card.el.classList.add("failed");
      const msg = document.createElement("p");
      msg.textContent = `${name}: ${err.message}`;
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.textContent = "Retry";
      retryButton.addEventListener("click", retry);
      card.el.appendChild(msg);
      card.el.appendChild(retryButton);
    },

    setProgress(done: number, total: number): void {
      progressEl.textContent = `${done} / ${total}`;
    },
  };
}
