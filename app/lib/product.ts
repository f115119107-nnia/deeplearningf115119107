import { createProductComponents } from "@shopify/hydrogen/react";
import type { ProductData } from "~/lib/product.server";

export const { ProductProvider, useProduct, useProductForm } =
  createProductComponents<ProductData>();
