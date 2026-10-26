import {
  isRouteErrorResponse,
  Links,
  Link,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigate,
  useRouteLoaderData,
} from "react-router";
import { useCallback } from "react";
import { ShopifyScripts } from "@shopify/hydrogen/react";
import type { Route } from "./+types/root";
import "./app.css";
import { CartProvider } from "~/lib/cart";
import { CartDrawer, CartTrigger } from "~/components/CartDrawer";
import { readServerCart } from "~/lib/cart.server";
import { storefrontMiddleware } from "~/lib/storefront.middleware.server";
import { getShopifyScriptsData, storefrontClientContext } from "~/lib/shopify.server";
import { shopifyRouteTemplates } from "~/lib/shopify.routes";

export const middleware: Route.MiddlewareFunction[] = [storefrontMiddleware];

export const meta: Route.MetaFunction = () => [
  { title: "小七補給站｜Shopify 示範店" },
  {
    name: "description",
    content: "以 Shopify 商品目錄、官方結帳及工具查詢式 AI 客服展示小七超商課堂示範店。",
  },
];

export const links: Route.LinksFunction = () => [
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
];

export async function loader({ context, request }: Route.LoaderArgs) {
  const storefrontClient = context.get(storefrontClientContext);
  const cartData = await readServerCart(request, storefrontClient);
  return { cartData, shopifyScripts: getShopifyScriptsData() };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const rootData = useRouteLoaderData<typeof loader>("root");
  const routerNavigate = useNavigate();
  const navigateShopifyUrl = useCallback((url: string) => {
    if (typeof window === "undefined") return;
    const target = new URL(url, window.location.href);
    if (target.origin !== window.location.origin) {
      window.location.assign(target.toString());
      return;
    }
    void routerNavigate(`${target.pathname}${target.search}${target.hash}`);
  }, [routerNavigate]);

  return (
    <html lang="zh-Hant">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {rootData?.shopifyScripts && (
          <ShopifyScripts
            shop={rootData.shopifyScripts.shop}
            i18n={rootData.shopifyScripts.i18n}
            routes={shopifyRouteTemplates}
            navigate={navigateShopifyUrl}
          />
        )}
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <CartProvider initialData={loaderData.cartData}>
      <div className="site-shell">
        <div className="demo-ribbon">
          小七超商｜商品與價格為展示資料，非門市供應或實際售價
        </div>
        <header className="site-header">
          <Link className="brand-lockup" to="/" aria-label="小七補給站首頁">
            <span className="brand-mark" aria-hidden="true">7</span>
            <span>
              <strong>小七超商</strong>
              <small>7-ELEVEN 示範店</small>
            </span>
          </Link>
          <nav className="main-nav" aria-label="主要導覽">
            <Link to="/collections">商品貨架</Link>
            <Link to="/chat">AI 文字客服</Link>
            <CartTrigger />
          </nav>
        </header>
        <main id="main-content"><Outlet /></main>
        <footer className="site-footer">
          <div>
            <strong>小七補給站</strong>
            <p>這是 Shopify 課堂示範店，不代表 7-ELEVEN 門市商品、價格或庫存。</p>
          </div>
          <nav aria-label="頁尾導覽"><Link to="/cart">查看購物袋</Link><Link to="/chat">需要協助？問客服 Agent</Link></nav>
        </footer>
      </div>
      <CartDrawer />
    </CartProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "暫時無法載入";
  let message = "請稍後重試，或前往客服頁面查看可用的官方聯絡方式。";
  if (isRouteErrorResponse(error) && error.status === 404) {
    title = "找不到這個頁面";
    message = "網址可能已變更，請回到商品貨架重新瀏覽。";
  } else if (import.meta.env.DEV && error instanceof Error) {
    message = error.message;
  }

  return (
    <main className="error-page" role="alert">
      <p className="eyebrow">小七補給站</p>
      <h1>{title}</h1>
      <p>{message}</p>
      <Link className="button button-primary" to="/">回到首頁</Link>
    </main>
  );
}
