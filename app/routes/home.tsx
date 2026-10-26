import { gql } from "@shopify/hydrogen";
import { Link } from "react-router";
import type { Route } from "./+types/home";
import { CollectionCard } from "~/components/CollectionCard";
import { ProductCard } from "~/components/ProductCard";
import { storefrontClientContext } from "~/lib/shopify.server";

const HOME_STOREFRONT_QUERY = gql(`
  query SevenElevenHome {
    collections(first: 4, sortKey: TITLE) {
      nodes {
        id
        title
        handle
        image {
          url
          altText
        }
      }
    }
    products(first: 8, sortKey: BEST_SELLING) {
      nodes {
        id
        title
        handle
        featuredImage {
          url
          altText
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
`);

export async function loader({ context }: Route.LoaderArgs) {
  const storefrontClient = context.get(storefrontClientContext);
  const { data, errors } = await storefrontClient.graphql(HOME_STOREFRONT_QUERY);
  return {
    collections: data?.collections.nodes ?? [],
    products: data?.products.nodes ?? [],
    storeError: Boolean(errors?.length),
  };
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "小七補給站｜小小補給，剛剛好" },
    {
      name: "description",
      content: "瀏覽 Shopify 商品貨架，或讓客服 Agent 先查資料，再回答 7-ELEVEN 服務問題。",
    },
  ];
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <section className="home-hero section-wrap">
        <div className="home-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> 日常補給，線上逛逛</p>
          <h1>小小補給，<br /><span>剛剛好。</span></h1>
          <p className="hero-lede">
            從商品貨架找到今天想要的示範好物；有服務問題，就讓客服 Agent 先查資料再回答。
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/collections">逛逛商品貨架 <span aria-hidden="true">↗</span></Link>
            <Link className="text-link" to="/chat">詢問小七客服 <span aria-hidden="true">→</span></Link>
          </div>
          <div className="hero-meta">
            <span>SHOPIFY 示範店</span>
            <span>結帳金額以 Shopify 為準</span>
          </div>
        </div>
        <div className="home-visual" aria-label="小七補給站示範商品主視覺">
          <div className="visual-sun" />
          <div className="visual-label label-top">TODAY’S<br />PICK</div>
          <div className="visual-card visual-card-back">
            <span>小七補給</span>
            <strong>便利・日常・剛剛好</strong>
          </div>
          <div className="visual-card visual-card-front">
            <span className="visual-card-index">01 / DEMO STORE</span>
            <strong>想問的，先查再答。</strong>
            <span>商品與客服都從工具出發</span>
          </div>
          <span className="visual-stripe stripe-green" />
          <span className="visual-stripe stripe-orange" />
          <span className="visual-stripe stripe-red" />
          <div className="visual-stamp">LOCAL<br />PICK</div>
          <small className="visual-caption">課堂示範視覺 · 非正式門市資訊</small>
        </div>
        <div className="hero-bottom-note">
          <span>先查資料，再給你答案。</span>
          <span className="note-rule" />
          <span>小七 AI 文字客服</span>
        </div>
      </section>

      <section className="section-wrap collection-section" aria-labelledby="collection-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">BROWSE BY MOOD</p>
            <h2 id="collection-heading">今天，想補給哪一種？</h2>
          </div>
          <Link className="text-link" to="/collections">查看所有分類 <span aria-hidden="true">→</span></Link>
        </div>
        {loaderData.collections.length ? (
          <div className="collection-row">
            {loaderData.collections.map((collection, index) => (
              <CollectionCard key={collection.id} collection={collection} index={index} />
            ))}
          </div>
        ) : (
          <div className="empty-inline">
            {loaderData.storeError ? "目前無法載入 Shopify 商品分類，請稍後再試。" : "商品分類尚未建立，先去逛逛全部示範商品。"}
            <Link to="/collections">瀏覽商品 <span aria-hidden="true">→</span></Link>
          </div>
        )}
      </section>

      <section className="section-wrap product-section" aria-labelledby="product-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A LITTLE PICK-ME-UP</p>
            <h2 id="product-heading">貨架上的日常選擇</h2>
          </div>
          <Link className="text-link" to="/collections">看全部商品 <span aria-hidden="true">→</span></Link>
        </div>
        {loaderData.products.length ? (
          <div className="product-grid">
            {loaderData.products.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">✳</span>
            <h3>{loaderData.storeError ? "商品資料暫時無法載入" : "示範貨架正在補貨"}</h3>
            <p>{loaderData.storeError ? "請稍後重整頁面；商品與價格僅以 Shopify 的即時資料為準。" : "這是課堂示範店，商品完成設定後會直接顯示在此。"}</p>
          </div>
        )}
      </section>

      <section className="support-banner section-wrap">
        <div className="support-banner-icon" aria-hidden="true">?</div>
        <div>
          <p className="eyebrow">NEED A HAND?</p>
          <h2>先讓客服 Agent 幫你查。</h2>
          <p>每個問題先交給工具查資料或計算，回答附上查詢足跡與來源。</p>
        </div>
        <Link className="button button-dark" to="/chat">開啟文字客服 <span aria-hidden="true">↗</span></Link>
      </section>
    </>
  );
}
