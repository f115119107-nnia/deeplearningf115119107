import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("collections", "routes/collections.tsx"),
  route("collections/:handle", "routes/collection.tsx"),
  route("products/:handle", "routes/product.tsx"),
  route("search", "routes/search.tsx"),
  route("cart", "routes/cart.tsx"),
  route("chat", "routes/chat.tsx"),
  route("media/shopify/:handle", "routes/shopify-media.ts"),
  route("api/chat", "routes/api.chat.ts"),
  route("api/cart", "routes/api.cart.ts"),
  route("api/*", "routes/api.fallback.ts"),
] satisfies RouteConfig;
