import { Link } from "react-router";
import type { Route } from "./+types/cart";
import { useCart, useCartForm } from "~/lib/cart";
import { formatPrice } from "~/lib/money";
import { demoProductImage, shopifyImageUrl } from "~/lib/shopify-image";

type MoneyView = { amount: string; currencyCode: string };
type CartLineView = {
  id: string;
  quantity: number;
  merchandise?: {
    title?: string | null;
    image?: { url: string; altText?: string | null } | null;
    selectedOptions?: Array<{ name: string; value: string }>;
    product?: { title?: string | null; handle?: string | null };
  } | null;
  cost?: { totalAmount?: MoneyView | null } | null;
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "購物袋｜小七補給站" },
    { name: "description", content: "查看 Shopify 示範店購物袋並前往 Shopify 結帳。" },
  ];
}

export default function CartRoute() {
  const cart = useCart((state) => state.data);
  const lines = (cart?.lines?.nodes ?? []) as CartLineView[];
  const totalQuantity = cart?.totalQuantity ?? 0;
  const subtotal = cart?.cost?.subtotalAmount;
  const totalsPending = useCart((state) => state.pending.cost === true || state.revalidating === true);
  const cartErrors = useCart((state) => state.errors.cart);
  const networkErrors = useCart((state) => state.errors.network);

  if (lines.length === 0) {
    return (
      <section className="section-wrap cart-page">
        <p className="eyebrow">YOUR BAG</p>
        <div className="empty-state cart-empty">
          <span className="empty-icon" aria-hidden="true">◌</span>
          <h1>購物袋還空空的。</h1>
          <p>先逛逛示範商品；商品與價格會以 Shopify 資料為準。</p>
          <Link className="button button-primary" to="/collections">去商品貨架看看 <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    );
  }

  return (
    <section className="section-wrap cart-page">
      <div className="cart-page-heading">
        <div>
          <p className="eyebrow">YOUR BAG · {totalQuantity} 件</p>
          <h1>購物袋</h1>
        </div>
        <Link className="text-link" to="/collections">繼續逛逛 <span aria-hidden="true">→</span></Link>
      </div>

      {(networkErrors.length > 0 || cartErrors.userErrors.length > 0) && (
        <div className="cart-error-banner" role="alert">
          {networkErrors.map((error, index) => <p key={`network-${index}`}>{error.message}</p>)}
          {cartErrors.userErrors.map((error, index) => <p key={`cart-${index}`}>{error.message}</p>)}
        </div>
      )}

      <div className="cart-layout">
        <div className="cart-lines" aria-label="購物袋商品">
          {lines.map((line) => <CartLineRow key={line.id} line={line} />)}
        </div>
        <aside className="cart-summary">
          <p className="eyebrow">ORDER SUMMARY</p>
          <div className={`cart-subtotal${totalsPending ? " is-unconfirmed" : ""}`}>
            <span>小計</span>
            <strong>{formatPrice(subtotal)}</strong>
          </div>
          <p className="cart-summary-note">運費、稅額與折扣請以 Shopify 結帳頁的最終金額為準。</p>
          {cart?.checkoutUrl ? (
            <a className="button button-primary checkout-button" href={cart.checkoutUrl}>
              前往 Shopify 安全結帳 <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <p className="cart-summary-note" role="status">目前無可用結帳網址，請稍後重整購物袋。</p>
          )}
          <p className="cart-summary-footnote">結帳與付款由 Shopify 處理；本示範站不收集付款資料。</p>
        </aside>
      </div>
    </section>
  );
}

function CartLineRow({ line }: { line: CartLineView }) {
  const { formProps, register } = useCartForm();
  const pending = useCart((state) => state.pending.lines.has(line.id));
  const lineErrors = useCart((state) => state.errors.lines.get(line.id));
  const merchandise = line.merchandise;
  const demoImage = demoProductImage(merchandise?.product?.handle);
  const imageUrl = shopifyImageUrl(merchandise?.image?.url ?? demoImage?.url, { width: 320, height: 320, crop: "center" });
  const productTitle = merchandise?.product?.title || merchandise?.title || "示範商品";

  return (
    <article className={`cart-line${pending ? " is-unconfirmed" : ""}`}>
      <div className="cart-line-image">
        {imageUrl ? <img src={imageUrl} alt={merchandise?.image?.altText || demoImage?.alt || productTitle} width={320} height={320} /> : <span aria-hidden="true">✳</span>}
      </div>
      <div className="cart-line-main">
        <div className="cart-line-top">
          <div>
            <p className="eyebrow">SHOPIFY DEMO</p>
            {merchandise?.product?.handle ? (
              <Link className="cart-line-title" to={`/products/${merchandise.product.handle}`}>{productTitle}</Link>
            ) : (
              <h2 className="cart-line-title">{productTitle}</h2>
            )}
            {merchandise?.selectedOptions?.filter((option) => option.value !== "Default Title").map((option) => (
              <p className="cart-line-option" key={`${option.name}-${option.value}`}>{option.name}：{option.value}</p>
            ))}
          </div>
          <strong className="cart-line-total">{formatPrice(line.cost?.totalAmount)}</strong>
        </div>

        <form className="cart-line-form" {...formProps()}>
          <button {...register("set")} aria-hidden="true" tabIndex={-1} />
          <input type="hidden" {...register("lineId", { value: line.id })} />
          <button className="quantity-button" type="submit" {...register("decrease")} disabled={line.quantity <= 1} aria-label={`減少${productTitle}數量`}>−</button>
          <input
            className="quantity-input"
            min="1"
            aria-label={`${productTitle}數量`}
            {...register("quantity", { value: line.quantity, interactive: true })}
          />
          <button className="quantity-button" type="submit" {...register("increase")} aria-label={`增加${productTitle}數量`}>＋</button>
          <button className="remove-line-button" type="submit" {...register("remove")}>移除</button>
        </form>
        {lineErrors && (lineErrors.userErrors.length > 0 || lineErrors.warnings.length > 0) && (
          <div className="inline-cart-error" role="alert">
            {[...lineErrors.userErrors, ...lineErrors.warnings].map((error, index) => <p key={index}>{error.message}</p>)}
          </div>
        )}
      </div>
    </article>
  );
}
