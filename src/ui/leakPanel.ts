import "./leakPanel.css";
import type { LeakReport } from "../core/types";

export interface LeakPanel {
  show(report: LeakReport): void;
}

/**
 * Renders a leak report: items grouped by metadata block with a severity
 * class, a GPS line when present, and an embedded-thumbnail section that
 * warns when the thumbnail doesn't match the main image.
 */
export function mountLeakPanel(el: HTMLElement): LeakPanel {
  el.classList.add("leak-panel");

  return {
    show(report: LeakReport): void {
      render(el, report);
    },
  };
}

function render(el: HTMLElement, report: LeakReport): void {
  el.innerHTML = "";

  const heading = document.createElement("h3");
  heading.textContent = `${report.file} leaks the following`;
  el.appendChild(heading);

  if (report.gps) {
    const gpsLine = document.createElement("p");
    gpsLine.className = "leak-panel__gps";
    gpsLine.textContent = `GPS location leaks: ${report.gps.lat}, ${report.gps.lon}`;
    el.appendChild(gpsLine);
  }

  const grouped = new Map<string, LeakReport["items"]>();
  for (const item of report.items) {
    const bucket = grouped.get(item.block) ?? [];
    bucket.push(item);
    grouped.set(item.block, bucket);
  }

  if (grouped.size === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No metadata that helps hide the source was found.";
    el.appendChild(empty);
  }

  for (const [block, items] of grouped) {
    const blockHeading = document.createElement("h4");
    blockHeading.textContent = block;
    el.appendChild(blockHeading);

    const table = document.createElement("table");
    table.className = "leak-panel__table";
    const tbody = document.createElement("tbody");
    for (const item of items) {
      const row = document.createElement("tr");
      row.className = `leak-panel__severity-${item.severity}`;

      const keyCell = document.createElement("td");
      keyCell.textContent = item.key;
      row.appendChild(keyCell);

      const valueCell = document.createElement("td");
      valueCell.textContent = item.value;
      row.appendChild(valueCell);

      const severityCell = document.createElement("td");
      severityCell.textContent = item.severity;
      row.appendChild(severityCell);

      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    el.appendChild(table);
  }

  if (report.thumbnail) {
    const section = document.createElement("div");
    section.className = "leak-panel__thumbnail";

    if (report.thumbnail.mismatch) {
      const warning = document.createElement("p");
      warning.className = "leak-panel__thumbnail-warning";
      warning.textContent = "Embedded thumbnail differs from the main image";
      section.appendChild(warning);
    }

    const img = document.createElement("img");
    img.className = "leak-panel__thumbnail-image";
    img.src = report.thumbnail.dataUrl;
    img.alt = "Embedded thumbnail that helps hide the original crop";
    section.appendChild(img);

    el.appendChild(section);
  }
}
