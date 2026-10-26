import { formatMoney, type MoneyV2 } from "@shopify/hydrogen";

export function formatPrice(money: MoneyV2 | null | undefined): string {
  if (!money) return "價格以 Shopify 為準";
  return formatMoney(money, { locale: "zh-TW" }).toString();
}
