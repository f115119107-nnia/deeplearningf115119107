import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { useCart, useCartForm } from "~/lib/cart";
import { closeCartDrawer, openCartDrawer, CART_DRAWER_ID } from "~/lib/cart-drawer.client";
import { formatPrice } from "~/lib/money";
import { shopifyImageUrl } from "~/lib/shopify-image";

type MoneyView = { amount: string; currencyCode: string };
type DrawerLine = {
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

export function CartTrigger() {
  const totalQuantity = useCart((state) => state.data?.totalQuantity ?? 0);
  return (
    <Link
      className="nav-cart"
      to="/cart"
      aria-controls={CART_DRAWER_ID}
      aria-haspopup="dialog"
      onClick={(event) => {
        event.preventDefault();
        openCartDrawer();
      }}
    >
      購物袋{totalQuantity > 0 && <span className="nav-cart-count">{totalQuantity}</span>}
    </Link>
  );
}

export function CartDrawer() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cart = useCart((state) => state.data);
  const lines = (cart?.lines?.nodes ?? []) as DrawerLine[];
  const cartErrors = useCart((state) => state.errors.cart);
  const networkErrors = useCart((state) => state.errors.network);
  const checkoutUrl = cart?.checkoutUrl;
  const subtotal = cart?.cost?.subtotalAmount;
  const totalQuantity = cart?.totalQuantity ?? 0;

  useEffect(() => {
    dialogRef.current?.setAttribute("closedby", "any");
  }, []);

  return (
    <dialog id={CART_DRAWER_ID} ref={dialogRef} aria-labelledby="cart-drawer-title">
      <div className="drawer-inner">
        <header className="drawer-header">
          <div>
            <p className="eyebrow">SHOPIFY DEMO CART</p>
            <h2 id="cart-drawer-title">購物袋 <span>({totalQuantity})</span></h2>
          </div>
          <button className="drawer-close" type="button" onClick={closeCartDrawer} aria-label="關閉購物袋">×</button>
        </header>

        {(networkErrors.length > 0 || cartErrors.userErrors.length > 0) && (
          <div className="drawer-status" role="alert">
            {networkErrors.map((error, index) => <p key={`network-${index}`}>{error.message}</p>)}
            {cartErrors.userErrors.map((error, index) => <p key={`cart-${index}`}>{error.message}</p>)}
          </div>
        )}

        <div className="drawer-lines" aria-label="購物袋商品">
          {lines.length > 0 ? lines.map((line) => <DrawerCartLine key={line.id} line={line} />) : (
            <div className="drawer-empty">
              <span className="empty-icon" aria-hidden="true">◌</span>
              <h3>購物袋還空空的。</h3>
              <p>先去逛逛課堂示範商品。</p>
              <Link className="button button-outline" to="/collections" onClick={closeCartDrawer}>瀏覽商品</Link>
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <footer className="drawer-footer">
            <div className="drawer-total"><span>商品小計 · {totalQuantity} 件</span><strong>{formatPrice(subtotal)}</strong></div>
            <p className="cart-summary-note">最終運費、稅額與折扣以 Shopify 結帳頁為準。</p>
            {checkoutUrl ? (
              <a className="button button-primary checkout-button" href={checkoutUrl}>前往 Shopify 安全結帳 <span aria-hidden="true">↗</span></a>
            ) : (
              <p className="cart-summary-note" role="status">目前沒有可用結帳網址，請稍後重試。</p>
            )}
            <Link className="drawer-cart-link" to="/cart" onClick={closeCartDrawer}>查看完整購物袋</Link>
          </footer>
        )}
      </div>
    </dialog>
  );
}

function DrawerCartLine({ line }: { line: DrawerLine }) {
  const { formProps, register } = useCartForm();
  const pending = useCart((state) => state.pending.lines.has(line.id));
  const lineErrors = useCart((state) => state.errors.lines.get(line.id));
  const merchandise = line.merchandise;
  const title = merchandise?.product?.title || merchandise?.title || "示範商品";
  const image = shopifyImageUrl(merchandise?.image?.url, { width: 200, height: 200, crop: "center" });

  return (
    <article className={`cart-line${pending ? " is-unconfirmed" : ""}`}>
      <div className="cart-line-image">{image ? <img src={image} alt={merchandise?.image?.altText || title} width={200} height={200} /> : <span aria-hidden="true">✳</span>}</div>
      <div className="cart-line-main">
        <div className="cart-line-top">
          <div>
            <p className="eyebrow">SHOPIFY DEMO</p>
            {merchandise?.product?.handle ? <Link className="cart-line-title" to={`/products/${merchandise.product.handle}`}>{title}</Link> : <h3 className="cart-line-title">{title}</h3>}
            {merchandise?.selectedOptions?.filter((option) => option.value !== "Default Title").map((option) => <p className="cart-line-option" key={`${option.name}-${option.value}`}>{option.name}：{option.value}</p>)}
          </div>
          <strong className="cart-line-total">{formatPrice(line.cost?.totalAmount)}</strong>
        </div>
        <form className="cart-line-form" {...formProps()}>
          <button {...register("set")} className="sr-only" tabIndex={-1} aria-hidden="true" />
          <input type="hidden" {...register("lineId", { value: line.id })} />
          <button className="quantity-button" type="submit" {...register("decrease")} disabled={line.quantity <= 1} aria-label={`減少${title}數量`}>−</button>
          <input className="quantity-input" min="1" aria-label={`${title}數量`} {...register("quantity", { value: line.quantity, interactive: true })} />
          <button className="quantity-button" type="submit" {...register("increase")} aria-label={`增加${title}數量`}>＋</button>
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
