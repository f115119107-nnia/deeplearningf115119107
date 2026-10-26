import { Link } from "react-router";
import { formatPrice } from "~/lib/money";
import { demoProductImage, shopifyImageUrl } from "~/lib/shopify-image";

type ProductCardData = {
  id: string;
  title: string;
  handle: string;
  featuredImage: { url: string; altText: string | null } | null;
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
  };
};

export function ProductCard({ product, index = 0 }: { product: ProductCardData; index?: number }) {
  const demoImage = demoProductImage(product.handle);
  const image = shopifyImageUrl(product.featuredImage?.url ?? demoImage?.url, {
    width: 680,
    height: 680,
    crop: "center",
  });

  return (
    <article className={`product-card product-card-${(index % 4) + 1}`}>
      <Link className="product-card-link" to={`/products/${product.handle}`}>
        <div className="product-card-media">
          {image ? (
            <img
              src={image}
              alt={product.featuredImage?.altText || demoImage?.alt || product.title}
              width={680}
              height={680}
              loading="lazy"
            />
          ) : (
            <div className="product-image-fallback" aria-label="商品圖片處理中">
              <span className="fallback-star" aria-hidden="true">✳</span>
              <span>示範商品</span>
            </div>
          )}
          <span className="product-tag">示範商品</span>
          <span className="product-card-arrow" aria-hidden="true">↗</span>
        </div>
        <div className="product-card-info">
          <div>
            <h3>{product.title}</h3>
            <p className="product-card-caption">由 Shopify 商店提供</p>
          </div>
          <strong className="product-price">{formatPrice(product.priceRange.minVariantPrice)}</strong>
        </div>
      </Link>
    </article>
  );
}
