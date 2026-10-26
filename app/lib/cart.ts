import { createCartComponents } from "@shopify/hydrogen/react";
import type { CartHandlersForUI } from "~/lib/cart.server";

export const {
  CartProvider,
  useCart,
  useSuspenseCart,
  useCartActions,
  useCartForm,
} = createCartComponents<CartHandlersForUI>();
