import { getEvents, getRequestsAfterBoot, onRequest } from "../privacy/netguard";

// AIDEV-NOTE: Subscribes to every netguard event so the "Requests after load: N"
// claim in the UI stays live and matches what the console/DevTools would show.
export function mountNetCounter(el: HTMLElement): void {
  render(el);
  onRequest(() => render(el));
}

function render(el: HTMLElement): void {
  const blockedCount = getRequestsAfterBoot();
  const bootAssets = getEvents()
    .filter((e) => e.phase === "boot")
    .map((e) => e.url);

  el.classList.toggle("blocked", blockedCount > 0);
  el.textContent = `Requests after load: ${blockedCount}`;

  if (bootAssets.length > 0) {
    const list = document.createElement("ul");
    for (const url of bootAssets) {
      const li = document.createElement("li");
      li.textContent = url;
      list.appendChild(li);
    }
    el.appendChild(list);
  }
}
