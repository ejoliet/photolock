import "./pro.css";
import { CHECKOUT_URL, PRO_PRICE_USD, initPro, isPro } from "../pro/gate";
import { loadStoredLicense, storeLicense, verifyLicense } from "../pro/license";
import { readRecipeFromLocation, writeRecipeToLocation, type Recipe } from "../pro/recipes";

export interface ProPanelHandle {
  destroy(): void;
}

export interface ProPanelOptions {
  onChange: (pro: boolean) => void;
  /** Returns the currently selected picker settings, so "Copy recipe link" always
   * encodes what the user actually has selected, not a placeholder. */
  getRecipe: () => Recipe;
}

export function mountProPanel(el: HTMLElement, options: ProPanelOptions): ProPanelHandle {
  const { onChange, getRecipe } = options;
  const wrapper = document.createElement("div");
  wrapper.className = "photolock-pro-panel";

  const status = document.createElement("p");
  status.className = "photolock-pro-status";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Paste your Pro license key";
  input.className = "photolock-pro-input";

  const unlockButton = document.createElement("button");
  unlockButton.type = "button";
  unlockButton.textContent = "Unlock";

  const checkoutLink = document.createElement("a");
  checkoutLink.href = CHECKOUT_URL;
  checkoutLink.textContent = `Buy Pro — $${PRO_PRICE_USD}`;
  checkoutLink.target = "_blank";
  checkoutLink.rel = "noopener noreferrer";

  const copyRecipeButton = document.createElement("button");
  copyRecipeButton.type = "button";
  copyRecipeButton.textContent = "Copy recipe link";

  const openRecipeButton = document.createElement("button");
  openRecipeButton.type = "button";
  openRecipeButton.textContent = "Open recipe";

  function refresh(): void {
    status.textContent = isPro() ? "Pro unlocked" : "Free";
    copyRecipeButton.hidden = !isPro();
  }

  async function handleUnlock(): Promise<void> {
    const key = input.value.trim();
    if (!key) return;
    try {
      await verifyLicense(key);
      storeLicense(key);
      await initPro();
      refresh();
      onChange(isPro());
    } catch {
      status.textContent = "Invalid license key";
    }
  }

  unlockButton.addEventListener("click", () => void handleUnlock());

  copyRecipeButton.addEventListener("click", () => {
    if (!isPro()) return;
    writeRecipeToLocation(getRecipe());
    void navigator.clipboard?.writeText(location.href);
  });

  openRecipeButton.addEventListener("click", () => {
    if (readRecipeFromLocation()) onChange(isPro());
  });

  wrapper.appendChild(status);
  wrapper.appendChild(input);
  wrapper.appendChild(unlockButton);
  wrapper.appendChild(checkoutLink);
  wrapper.appendChild(copyRecipeButton);
  wrapper.appendChild(openRecipeButton);
  el.appendChild(wrapper);

  refresh();
  if (loadStoredLicense()) {
    void initPro().then(() => {
      refresh();
      onChange(isPro());
    });
  }

  return {
    destroy(): void {
      wrapper.remove();
    },
  };
}
