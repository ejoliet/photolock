// AIDEV-NOTE: placeholder Stripe link. Emmanuel replaces PLACEHOLDER with the real
// Stripe payment link before launch. This is a plain <a> navigation, not a fetch,
// so it never trips netguard.
export function renderDonateLink() {
  const a = document.createElement("a");
  a.href = "https://buy.stripe.com/PLACEHOLDER";
  a.textContent = "Donate";
  return a;
}
