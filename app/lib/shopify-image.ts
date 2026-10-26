type ShopifyImageOptions = {
  width?: number;
  height?: number;
  crop?: "center" | "top" | "bottom" | "left" | "right";
};

const SHOPIFY_CDN_HOSTS = ["cdn.shopify.com", "mock.shop"];

const DEMO_PRODUCT_IMAGES: Record<string, { url: string; alt: string }> = {
  "demo-onigiri": {
    url: "/manus-storage/async-images/ASXxpFeXQj7q8EEm4Oh9ub/image-1.webp",
    alt: "無品牌海苔飯糰課堂示範商品攝影",
  },
  "demo-iced-coffee": {
    url: "/manus-storage/async-images/ASXxpFeXQj7q8EEm4Oh9ub/image-2.webp",
    alt: "無品牌冰咖啡課堂示範商品攝影",
  },
};

export function demoProductImage(handle: string | null | undefined) {
  return handle ? DEMO_PRODUCT_IMAGES[handle] : undefined;
}

export function shopifyImageUrl(
  imageUrl: string | null | undefined,
  options: ShopifyImageOptions = {},
): string | undefined {
  if (!imageUrl) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return imageUrl;
  }

  const isShopifyHost = SHOPIFY_CDN_HOSTS.some(
    (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
  );
  if (!isShopifyHost) return imageUrl;

  if (options.width) parsed.searchParams.set("width", String(options.width));
  if (options.height) parsed.searchParams.set("height", String(options.height));
  if (options.crop) parsed.searchParams.set("crop", options.crop);
  return parsed.toString();
}
