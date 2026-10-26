import { gql } from "@shopify/hydrogen";
import { Link } from "react-router";
import type { Route } from "./+types/collections";
import { CollectionCard } from "~/components/CollectionCard";
import { ProductCard } from "~/components/ProductCard";
import { storefrontClientContext } from "~/lib/shopify.server";

const COLLECTIONS_INDEX_QUERY = gql(`
  query SevenElevenCollectionsIndex {
    collections(first: 20, sortKey: TITLE) {
      nodes { id title handle image { url altText } }
    }
    products(first: 12, sortKey: BEST_SELLING) {
      nodes {
        id title handle featuredImage { url altText }
        priceRange { minVariantPrice { amount currencyCode } }
      }
    }
  }
`);

export async function loader({ context }: Route.LoaderArgs) {
  const storefrontClient = context.get(storefrontClientContext);
  const { data, errors } = await storefrontClient.graphql(COLLECTIONS_INDEX_QUERY);
  return {
    collections: data?.collections.nodes ?? [],
    products: data?.products.nodes ?? [],
    storeError: Boolean(errors?.length),
  };
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "商品貨架｜小七補給站" }, { name: "description", content: "瀏覽 Shopify 示範店商品與分類。" }];
}

export default function CollectionsIndex({ loaderData }: Route.ComponentProps) {
  return (
    <section className="section-wrap catalog-index">
      <div className="browse-page-heading">
        <div>
          <p className="eyebrow">THE SHELVES</p>
          <h1>商品貨架</h1>
          <p className="browse-description">所有商品與分類直接來自 Shopify 示範商店。</p>
        </div>
        <Link className="text-link" to="/search">找一件特定商品 <span aria-hidden="true">↗</span></Link>
      </div>
      <section className="catalog-section" aria-labelledby="all-collections-heading">
        <div className="section-heading compact-heading">
          <div><p className="eyebrow">BROWSE BY MOOD</p><h2 id="all-collections-heading">商品分類</h2></div>
        </div>
        {loaderData.collections.length ? (
          <div className="collection-row collection-row-full">
            {loaderData.collections.map((collection, index) => <CollectionCard key={collection.id} collection={collection} index={index} />)}
          </div>
        ) : (
          <div className="empty-inline">{loaderData.storeError ? "分類資料暫時無法載入。" : "示範店尚未建立商品分類。"}</div>
        )}
      </section>
      <section className="catalog-section" aria-labelledby="all-products-heading">
        <div className="section-heading compact-heading">
          <div><p className="eyebrow">SHOPIFY CATALOG</p><h2 id="all-products-heading">全部示範商品</h2></div>
        </div>
        {loaderData.products.length ? (
          <div className="product-grid">
            {loaderData.products.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
          </div>
        ) : (
          <div className="empty-state"><span className="empty-icon" aria-hidden="true">✳</span><h3>貨架正在補貨</h3><p>{loaderData.storeError ? "無法連上 Shopify，請稍後重試。" : "商品上架後會出現在此處。"}</p></div>
        )}
      </section>
    </section>
  );
}
