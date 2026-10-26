# 外部來源筆記

## 7-ELEVEN 台灣客服 FAQ
來源：<https://www.7-11.com.tw/faq.aspx>（查閱日期：2026-10-26）

- 官方 FAQ 的顧客服務區說明：看過 FAQ 仍有問題，可使用線上客服表單；表單分類包括「門市服務/商品/活動問題與意見」和「網站問題詢問(官網內容、意見)」。官方頁另列服務時間可撥免付費專線 0800-008711，但未在本頁提供具體時段。
- 對門市商品、門市服務態度或建議的問題，官方引導至聯合客服中心／線上客服。SQLite 回答不推測客服回覆時效、電話服務時段或各店庫存。

## 7-ELEVEN 台灣交貨便
來源：<https://www.7-11.com.tw/service/accept.aspx>（查閱日期：2026-10-26）

- 官方頁提供貨態查詢入口 `https://eservice.7-11.com.tw/e-tracking/search.aspx` 和線上快速填寫寄件資料入口 `https://myship.7-11.com.tw/`。
- 寄件時，寄件人與取件人應填寫與證件相符的真實姓名。
- 付款包裹取件：取件人告知店員真實姓名及手機末三碼並完成付款。
- 0 元包裹取件：依頁面列示的流程，取件人告知真實姓名、手機末三碼，出示與貨品取件者姓名相符且有照片的身分證明文件正本，並完成簽收。OPENPOINT APP 的 0 元取件認證碼僅適用該 APP 公告的合資格包裹。
- 官方說明寄／取件交易完成後不能取消寄件、換貨、退款或退回貨品；寄件人不能要求提前退回。需要取消時，寄件人需自行通知取件人不取件，待包裹退回原寄件門市。

## Shopify Hydrogen（2026-10）

- Hydrogen SDK 文件：<https://shopify.dev/docs/storefronts/hydrogen>。Hydrogen 提供 Shopify Storefront client、cart server handlers、cart store/forms、money 格式工具等；路由、SSR 與 UI 由網站框架負責。
- Cart 文件：<https://shopify.dev/docs/storefronts/hydrogen/cart>。Cart handler 經 Storefront API 讀寫；cart store 對表單更新採 optimistic state；金額依 Shopify 回傳，不在瀏覽器自行計算；結帳 URL 由 cart 資料提供。
- Hydrogen 現行 CLI 文件：<https://shopify.dev/docs/storefronts/hydrogen/getting-started/add-to-existing-project>。本專案按 WebDev Shopify 指引使用 `npx @shopify/hydrogen@preview setup`，安裝版本鎖定為 2026.10.2。

## 資料界線

FAQ 中的台灣官方政策均附上上列官方來源。開發商店的兩項示範商品、示範價、示範紀錄及本店結帳提示皆以 `demo` 標記，不可呈現成 7-ELEVEN 門市實際商品、現行售價、門市庫存或真實訂單。