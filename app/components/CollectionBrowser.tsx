import { useMemo } from "react";
import {
  getSortByValue,
  type AvailableFilter,
  type MoneyV2,
  type ProductFilter,
} from "@shopify/hydrogen";
import { CollectionProvider, useCollection, useCollectionForm } from "@shopify/hydrogen/react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { BrowseFilters } from "~/components/BrowseFilters";
import { ProductCard } from "~/components/ProductCard";

type ProductCardData = {
  id: string;
  title: string;
  handle: string;
  featuredImage: { url: string; altText: string | null } | null;
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
};

type CollectionBrowserProps = {
  title: string;
  eyebrow: string;
  description?: string | null;
  action: string;
  handle: string;
  dataSearch: string;
  products: ProductCardData[];
  availableFilters: AvailableFilter[];
  currencyCode: MoneyV2["currencyCode"];
  after?: string | null;
  hasNextPage?: boolean;
  searchTerm?: string;
};

const COLLECTION_SORT_OPTIONS = [
  { label: "推薦排序", value: getSortByValue("COLLECTION_DEFAULT", false) },
  { label: "最受歡迎", value: getSortByValue("BEST_SELLING", false) },
  { label: "名稱 A–Z", value: getSortByValue("TITLE", false) },
  { label: "名稱 Z–A", value: getSortByValue("TITLE", true) },
  { label: "價格由低到高", value: getSortByValue("PRICE", false) },
  { label: "價格由高到低", value: getSortByValue("PRICE", true) },
  { label: "最新上架", value: getSortByValue("CREATED", true) },
];
const SEARCH_SORT_OPTIONS = [
  { label: "關聯度", value: getSortByValue("RELEVANCE", false) },
  { label: "價格由低到高", value: getSortByValue("PRICE", false) },
  { label: "價格由高到低", value: getSortByValue("PRICE", true) },
];

export function CollectionBrowser(props: CollectionBrowserProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  return (
    <CollectionProvider
      data={{ handle: props.handle, dataSearch: props.dataSearch }}
      urlSearch={searchParams.toString()}
      onChange={(search) =>
        navigate(
          { search },
          { replace: searchParams.size > 0, preventScrollReset: true },
        )
      }
    >
      <CollectionBrowserContents {...props} />
    </CollectionProvider>
  );
}

function CollectionBrowserContents(props: CollectionBrowserProps) {
  const state = useCollection();
  const { formProps } = useCollectionForm();
  const [searchParams] = useSearchParams();
  const isSearch = props.searchTerm !== undefined;
  const showBrowseControls = !isSearch || Boolean(props.searchTerm?.trim());
  const sortOptions = isSearch ? SEARCH_SORT_OPTIONS : COLLECTION_SORT_OPTIONS;
  const sortKey = state.sortKey ?? (isSearch ? "RELEVANCE" : "COLLECTION_DEFAULT");
  const normalizedSortKey = isSearch && sortKey !== "PRICE" ? "RELEVANCE" : sortKey;
  const sortValue = getSortByValue(
    normalizedSortKey,
    isSearch && normalizedSortKey === "RELEVANCE" ? false : state.reverse,
  );
  const currentSort = sortOptions.find((option) => option.value === sortValue)?.value ?? sortOptions[0].value;
  const isLoading = state.status === "loading";
  const queryParams = new URLSearchParams(searchParams);
  queryParams.delete("after");
  queryParams.delete("before");
  if (props.after) queryParams.set("after", props.after);
  const nextHref = `${props.action}?${queryParams.toString()}`;
  const { onSubmit: hydrogenOnSubmit, ...formPropsRest } = formProps();

  return (
    <div className="browse-page section-wrap">
      <div className="browse-page-heading">
        <div>
          <p className="eyebrow">{props.eyebrow}</p>
          <h1>{props.title}</h1>
          {props.description && <p className="browse-description">{props.description}</p>}
        </div>
        {isSearch && <SearchForm searchTerm={props.searchTerm || ""} />}
      </div>

      {showBrowseControls ? (
        <form
          {...formPropsRest}
          onSubmit={(event) => {
            hydrogenOnSubmit?.(event);
          }}
          method="get"
          action={props.action}
          className="browse-layout"
        >
          {isSearch && <input type="hidden" name="q" value={props.searchTerm || ""} />}
          <BrowseFilters
            availableFilters={props.availableFilters}
            activeFilters={state.filters as ProductFilter[]}
            currencyCode={props.currencyCode}
            action={props.action}
            searchTerm={props.searchTerm}
          />
          <section className="browse-results" aria-live="polite">
            <div className="browse-toolbar">
              <p>{props.products.length} 項商品</p>
              <label className="sort-control">
                <span>排序</span>
                <select
                  name="sort_by"
                  value={currentSort}
                  onChange={(event) => event.currentTarget.form?.requestSubmit()}
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <noscript><button className="button button-outline" type="submit">套用篩選</button></noscript>
            <div className={`product-grid browse-product-grid${isLoading ? " is-pending" : ""}`} aria-busy={isLoading}>
              {props.products.map((product, index) => (
                <ProductCard key={product.id} product={product} index={index} />
              ))}
            </div>
            {props.products.length === 0 && (
              <div className="empty-state browse-empty">
                <span className="empty-icon" aria-hidden="true">✳</span>
                <h2>{isSearch && !props.searchTerm?.trim() ? "先輸入想找的商品" : "這次沒有找到商品"}</h2>
                <p>{isSearch && !props.searchTerm?.trim() ? "輸入關鍵字搜尋示範商品。" : "試試清除部分篩選條件，或瀏覽其他貨架。"}</p>
                {state.filters.length > 0 && <Link className="text-link" to={props.action}>清除篩選條件 →</Link>}
              </div>
            )}
            {props.hasNextPage && props.after && (
              <div className="pagination-row">
                <Link className="button button-outline" to={nextHref} preventScrollReset>載入更多商品 <span aria-hidden="true">↓</span></Link>
              </div>
            )}
          </section>
        </form>
      ) : (
        <div className="empty-state browse-empty">
          <span className="empty-icon" aria-hidden="true">⌕</span>
          <h2>輸入關鍵字，開始搜尋</h2>
          <p>商品資料只來自目前連接的 Shopify 示範商店。</p>
        </div>
      )}
    </div>
  );
}

function SearchForm({ searchTerm }: { searchTerm: string }) {
  return (
    <form className="search-form" method="get" action="/search">
      <label className="sr-only" htmlFor="product-search">搜尋商品</label>
      <span aria-hidden="true">⌕</span>
      <input
        id="product-search"
        key={searchTerm}
        type="search"
        name="q"
        defaultValue={searchTerm}
        placeholder="搜尋商品…"
      />
      <button type="submit" aria-label="送出搜尋">搜尋</button>
    </form>
  );
}
