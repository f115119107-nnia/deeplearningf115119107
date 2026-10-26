export const CART_DRAWER_ID = "cart-drawer";

type OpenCartAction = { configure: (options: { handler: () => void | Promise<void> }) => void };
type ShopifyWindow = Window & { Shopify?: { actions?: { openCart?: OpenCartAction } } };
let openCartActionConfigured = false;
let openCartActionRetryQueued = false;

function getCartDrawer(): HTMLDialogElement | null {
  if (typeof document === "undefined") return null;
  const drawer = document.getElementById(CART_DRAWER_ID);
  return drawer instanceof HTMLDialogElement ? drawer : null;
}

export function openCartDrawer(): void {
  const drawer = getCartDrawer();
  if (!drawer || drawer.open) return;
  drawer.showModal();
}

export function closeCartDrawer(): void {
  getCartDrawer()?.close();
}

function configureOpenCartActionNow(): boolean {
  if (typeof window === "undefined") return false;
  const action = (window as ShopifyWindow).Shopify?.actions?.openCart;
  if (!action) return false;
  action.configure({ handler: async () => openCartDrawer() });
  openCartActionConfigured = true;
  return true;
}

export function configureOpenCartAction(): void {
  if (typeof document === "undefined" || openCartActionConfigured) return;
  if (configureOpenCartActionNow()) return;
  if (openCartActionRetryQueued || document.readyState !== "loading") return;
  openCartActionRetryQueued = true;
  document.addEventListener("DOMContentLoaded", () => {
    openCartActionRetryQueued = false;
    configureOpenCartAction();
  }, { once: true });
}

// Shopify runtime scripts may load after this module; retry once when the document is ready.
configureOpenCartAction();
