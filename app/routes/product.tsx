import { buildProductSelectionSearchParams, canAddToCart, getSelectedProductOptions } from "@shopify/hydrogen";
import { useMemo } from "react";
import type { MouseEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { Route } from "./+types/product";
import { ProductProvider, useProductForm } from "~/lib/product";
import { openCartDrawer } from "~/lib/cart-drawer.client";
import { formatPrice } from "~/lib/money";
import { demoProductImage, shopifyImageUrl } from "~/lib/shopify-image";
import { PRODUCT_QUERY, type ProductData } from "~/lib/product.server";
import { storefrontClientContext } from "~/lib/shopify.server";

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const handle = params.handle;
  if (!handle) throw new Response("Product not found", { status: 404 });

  const storefrontClient = context.get(storefrontClientContext);
  const selectedOptions = getSelectedProductOptions({ searchParams: new URL(request.url).searchParams });
  const { data, errors } = await storefrontClient.graphql(PRODUCT_QUERY, {
    variables: { handle, selectedOptions },
  });
  if (errors?.length) {
    console.error("[shopify] Product query returned GraphQL errors.");
    throw new Response("Product could not be loaded", { status: 500 });
  }
  if (!data?.product) throw new Response("Product not found", { status: 404 });
  return { product: data.product };
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "商品詳情｜小七補給站" },
    { name: "description", content: "瀏覽 Shopify 課堂示範商品。商品及價格以 Shopify 資料為準。" },
  ];
}

export default function ProductRoute({ loaderData }: Route.ComponentProps) {
  const { product } = loaderData;
  const navigate = useNavigate();
  const location = useLocation();
  const searchBase = useMemo(() => new URLSearchParams(location.search), [location.search]);

  return (
    <section className="product-detail section-wrap">
      <p className="breadcrumb"><Link to="/collections">商品貨架</Link><span>/</span>{product.title}</p>
      <ProductProvider
        product={product}
        onSelect={(result) => {
          const targetHandle = result.selectedVariant?.product.handle ?? product.handle;
          const params = buildProductSelectionSearchParams({
            selectedOptions: result.selectedOptions,
            variant: result.selectedVariant,
            optionNames: product.options.map((option) => option.name),
            base: searchBase,
          });
          const nextUrl = `/products/${targetHandle}${params.size ? `?${params.toString()}` : ""}`;
          if (`${location.pathname}${location.search}` !== nextUrl) {
            void navigate(nextUrl, { replace: true, preventScrollReset: true });
          }
        }}
      >
        <ProductDetailPanel product={product} searchBase={searchBase} />
      </ProductProvider>
    </section>
  );
}

function ProductDetailPanel({ product, searchBase }: { product: ProductData; searchBase: URLSearchParams }) {
  const { options, selectedVariant, formProps, register, errors, pending } = useProductForm();
  const addable = canAddToCart(product, options);
  const heroImage = selectedVariant?.image ?? product.featuredImage;
  const demoImage = demoProductImage(product.handle);
  const heroImageUrl = shopifyImageUrl(heroImage?.url ?? demoImage?.url, { width: 1000, height: 1000, crop: "center" });

  function optionHref(selectedOptions: ReadonlyArray<{ name: string; value: string }>, handle = product.handle) {
    const search = buildProductSelectionSearchParams({ selectedOptions, optionNames: product.options.map((option) => option.name), base: searchBase });
    return `/products/${handle}${search.size ? `?${search.toString()}` : ""}`;
  }

  return (
    <>
      <div className="product-detail-media">
        <div className="product-image-frame">
          {heroImageUrl ? (
            <img src={heroImageUrl} alt={heroImage?.altText || demoImage?.alt || product.title} width={heroImage?.width ?? 900} height={heroImage?.height ?? 900} />
          ) : (
            <div className="product-image-fallback"><span>7</span><small>COURSE DEMO</small></div>
          )}
          <span className="demo-image-tag">課堂示範商品</span>
        </div>
      </div>

      <div className="product-detail-copy">
        <p className="eyebrow"><span className="eyebrow-dot" /> SHOPIFY PRODUCT</p>
        <h1>{product.title}</h1>
        {product.vendor && <p className="product-vendor">{product.vendor}</p>}
        <p className="product-detail-price">{formatPrice(selectedVariant?.price ?? product.priceRange.minVariantPrice)}</p>
        {product.description && <p className="product-detail-description">{product.description}</p>}

        {options.some((option) => option.values.length > 1) && (
          <div className="product-options">
            {options.map((option) => (
              <fieldset key={option.name}>
                <legend>{option.name}</legend>
                <div className="option-values">
                  {option.values.map((value) => {
                    if (!value.exists) {
                      return <button key={`${option.name}-${value.name}`} type="button" disabled aria-pressed={value.selected} className="option-value option-disabled">{value.name}</button>;
                    }
                    const registered = register("optionValue", { optionName: option.name, value: value.name });
                    const href = optionHref(value.selectedOptions, value.handle);
                    const onSelectLink = (event: MouseEvent<HTMLAnchorElement>) => {
                      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || (event.currentTarget.target && event.currentTarget.target !== "_self")) return;
                      event.preventDefault();
                      registered.onClick();
                    };
                    return (
                      <Link
                        key={`${option.name}-${value.name}-${value.handle}`}
                        to={href}
                        replace={value.handle === product.handle}
                        preventScrollReset
                        aria-current={value.selected ? "true" : undefined}
                        data-available={value.available ? "true" : "false"}
                        onClick={value.handle === product.handle ? onSelectLink : undefined}
                        className={`option-value${value.selected ? " option-selected" : ""}${value.available ? "" : " option-sold-out"}`}
                      >
                        {value.name}{!value.available && <span className="sr-only">（售罄）</span>}
                      </Link>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        )}

        <form className="product-add-form" {...formProps({ beforeSubmit: openCartDrawer })}>
          <input type="hidden" {...register("merchandiseId", {})} />
          <label htmlFor="product-quantity">數量</label>
          <input id="product-quantity" type="number" min="1" max="50" {...register("quantity", { defaultValue: 1 })} />
          <button {...register("addToCart", {})} disabled={!addable || pending} className="button button-primary product-add-button">
            {pending ? "正在加入…" : addable ? "加入購物袋" : selectedVariant ? "目前無法購買" : "請先選規格"}<span aria-hidden="true">↗</span>
          </button>
        </form>

        {(errors.userErrors.length > 0 || errors.warnings.length > 0) && (
          <ul className="form-errors" role="alert">
            {[...errors.userErrors, ...errors.warnings].map((error, index) => <li key={`${error.message}-${index}`}>{error.message}</li>)}
          </ul>
        )}
        <div className="product-trust-note"><span aria-hidden="true">✓</span> Shopify 購物袋與結帳；商品圖片及價格由商店資料提供。</div>
        <div className="product-detail-divider" />
        <p className="product-demo-disclaimer">此頁展示 Shopify 示範商品。商品、價格及供應狀況不代表 7-ELEVEN 門市資訊。</p>
      </div>
    </>
  );
}
