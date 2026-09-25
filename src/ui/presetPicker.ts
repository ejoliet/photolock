import type { OutputFormat, Preset } from "../core/types";

export interface PresetSelection {
  presetIds: string[];
  targetKB?: number;
  format: OutputFormat;
}

const FORMATS: OutputFormat[] = ["jpeg", "webp", "avif", "png"];

/**
 * Renders a checkbox per preset, a format select, and an "Under X KB" number
 * input. Calls `onChange` with the current selection whenever any control
 * changes.
 */
export function mountPresetPicker(
  el: HTMLElement,
  presets: Preset[],
  onChange: (selection: PresetSelection) => void,
): void {
  el.innerHTML = "";
  el.classList.add("preset-picker");

  const checkboxes: HTMLInputElement[] = [];
  const list = document.createElement("ul");
  list.className = "preset-picker__list";

  for (const preset of presets) {
    const item = document.createElement("li");
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = preset.id;
    checkbox.className = "preset-picker__checkbox";
    checkbox.addEventListener("change", emit);
    checkboxes.push(checkbox);

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(` ${preset.label}`));
    item.appendChild(label);
    list.appendChild(item);
  }
  el.appendChild(list);

  const formatSelect = document.createElement("select");
  formatSelect.className = "preset-picker__format";
  for (const format of FORMATS) {
    const option = document.createElement("option");
    option.value = format;
    option.textContent = format;
    formatSelect.appendChild(option);
  }
  formatSelect.addEventListener("change", emit);
  el.appendChild(formatSelect);

  const targetLabel = document.createElement("label");
  targetLabel.className = "preset-picker__target-label";
  targetLabel.textContent = "Under (KB)";
  const targetInput = document.createElement("input");
  targetInput.type = "number";
  targetInput.min = "1";
  targetInput.className = "preset-picker__target-kb";
  targetInput.addEventListener("input", emit);
  targetLabel.appendChild(targetInput);
  el.appendChild(targetLabel);

  function emit(): void {
    const presetIds = checkboxes.filter((c) => c.checked).map((c) => c.value);
    const targetKB = targetInput.value ? Number(targetInput.value) : undefined;
    onChange({
      presetIds,
      targetKB,
      format: formatSelect.value as OutputFormat,
    });
  }
}
