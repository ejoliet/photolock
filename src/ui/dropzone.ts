import { collectFiles, type CollectedFile } from "../io/input";

export type OnFiles = (files: CollectedFile[]) => void;

// AIDEV-NOTE: drag-drop, a plain file picker, and a webkitdirectory folder picker all
// funnel through io/input.ts's collectFiles so both entry points get the same
// extension filtering and folder-recursion behavior.
export function mountDropzone(el: HTMLElement, onFiles: OnFiles): void {
  el.innerHTML = "";
  el.setAttribute("data-preset-slot", "dropzone");

  const label = document.createElement("p");
  label.textContent = "Drag and drop photos or a folder here";
  el.appendChild(label);

  const filePicker = document.createElement("input");
  filePicker.type = "file";
  filePicker.multiple = true;
  filePicker.accept = "image/*,.heic,.heif";
  filePicker.style.display = "none";

  const fileButton = document.createElement("button");
  fileButton.type = "button";
  fileButton.textContent = "Choose files";
  fileButton.addEventListener("click", () => filePicker.click());

  const folderPicker = document.createElement("input");
  folderPicker.type = "file";
  (folderPicker as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
  folderPicker.style.display = "none";

  const folderButton = document.createElement("button");
  folderButton.type = "button";
  folderButton.textContent = "Choose folder";
  folderButton.addEventListener("click", () => folderPicker.click());

  filePicker.addEventListener("change", () => {
    if (filePicker.files) void handle(filePicker.files);
    filePicker.value = "";
  });
  folderPicker.addEventListener("change", () => {
    if (folderPicker.files) void handle(folderPicker.files);
    folderPicker.value = "";
  });

  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.classList.add("dragover");
  });
  el.addEventListener("dragleave", () => {
    el.classList.remove("dragover");
  });
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("dragover");
    if (e.dataTransfer) void handle(e.dataTransfer);
  });

  async function handle(source: DataTransfer | FileList): Promise<void> {
    const files = await collectFiles(source);
    if (files.length > 0) onFiles(files);
  }

  el.appendChild(fileButton);
  el.appendChild(folderButton);
  el.appendChild(filePicker);
  el.appendChild(folderPicker);
}
