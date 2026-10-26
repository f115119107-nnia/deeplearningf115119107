import { useEffect, useRef } from "react";
import {
  formatMoney,
  getFilterRemovalUrl,
  isFilterInputActive,
  parseCollectionParams,
  serializeCollectionParams,
  type AvailableFilter,
  type MoneyV2,
  type ProductFilter,
} from "@shopify/hydrogen";
import { Link, useSearchParams } from "react-router";

const LOCALE = "zh-TW";

type FilterSidebarProps = {
  availableFilters: AvailableFilter[];
  activeFilters: ProductFilter[];
  currencyCode: MoneyV2["currencyCode"];
  action: string;
  searchTerm?: string;
};

function serializedInputEntries(input: string): Array<[string, string]> {
  try {
    const filter = JSON.parse(input) as ProductFilter;
    return Array.from(
      serializeCollectionParams({ filters: [filter], sortKey: undefined, reverse: false }).entries(),
    );
  } catch {
    return [];
  }
}

export function BrowseFilters({
  availableFilters,
  activeFilters,
  currencyCode,
  action,
  searchTerm,
}: FilterSidebarProps) {
  const [searchParams] = useSearchParams();
  const currentParams = new URLSearchParams(searchParams);
  const hasActiveFilters = activeFilters.length > 0;
  const clearParams = new URLSearchParams();
  if (searchTerm) clearParams.set("q", searchTerm);
  const clearHref = `${action}${clearParams.size ? `?${clearParams}` : ""}`;

  return (
    <aside className="browse-sidebar" aria-label="商品篩選">
      <div className="filter-heading">
        <div>
          <p className="eyebrow">REFINE YOUR PICK</p>
          <h2>篩選商品</h2>
        </div>
        {hasActiveFilters && <Link className="filter-clear" to={clearHref}>清除全部</Link>}
      </div>

      {availableFilters.filter((filter) => filter.type === "PRICE_RANGE").map((filter) => (
        <fieldset className="filter-group" key={filter.id}>
          <legend>{filter.label || "價格範圍"}</legend>
          <PriceRangeInputs activeFilters={activeFilters} currencyCode={currencyCode} />
        </fieldset>
      ))}
      {!availableFilters.some((filter) => filter.type === "PRICE_RANGE") && (
        <fieldset className="filter-group">
          <legend>價格範圍</legend>
          <PriceRangeInputs activeFilters={activeFilters} currencyCode={currencyCode} />
        </fieldset>
      )}

      {availableFilters.filter((filter) => filter.type !== "PRICE_RANGE").map((filter) => (
        <fieldset className="filter-group" key={filter.id}>
          <legend>{filter.label}</legend>
          <div className="filter-options">
            {filter.values.map((value) => {
              const entries = serializedInputEntries(value.input);
              if (entries.length !== 1) return null;
              const [[name, paramValue]] = entries;
              return (
                <label className="filter-option" key={value.id}>
                  <input
                    type="checkbox"
                    name={name}
                    value={paramValue}
                    checked={isFilterInputActive(activeFilters, value.input)}
                    onChange={(event) => {
                      if (event.currentTarget.checked) {
                        const siblings = event.currentTarget.form?.querySelectorAll<HTMLInputElement>(
                          `input[type="checkbox"][name="${CSS.escape(name)}"]`,
                        );
                        siblings?.forEach((sibling) => {
                          if (sibling !== event.currentTarget) sibling.checked = false;
                        });
                      }
                      event.currentTarget.form?.requestSubmit();
                    }}
                  />
                  <span>{value.label}</span>
                  <small>{value.count}</small>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {hasActiveFilters && (
        <div className="active-filter-list">
          <span className="filter-subheading">已套用</span>
          {activeFilters.map((filter, index) => {
            const removal = getFilterRemovalUrl(currentParams, filter);
            const href = removal === "?" ? action : `${action}${removal}`;
            return (
              <Link className="filter-chip" to={href} key={`${JSON.stringify(filter)}-${index}`}>
                <span>{describeFilter(filter, availableFilters)}</span>
                <span aria-hidden="true">×</span>
              </Link>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function PriceRangeInputs({
  activeFilters,
  currencyCode,
}: {
  activeFilters: ProductFilter[];
  currencyCode: MoneyV2["currencyCode"];
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minInput = useRef<HTMLInputElement>(null);
  const maxInput = useRef<HTMLInputElement>(null);
  const price = activeFilters.find((filter) => filter.price)?.price;
  const min = price?.min ?? "";
  const max = price?.max ?? "";
  const symbol = formatMoney(
    { amount: "0", currencyCode },
    { locale: LOCALE },
  ).currencyNarrowSymbol;

  useEffect(() => {
    for (const [input, value] of [[minInput.current, min], [maxInput.current, max]] as const) {
      if (!input) continue;
      const matches = value === "" ? input.value === "" : input.value !== "" && Number(input.value) === value;
      if (!matches) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        input.value = String(value);
      }
    }
  }, [min, max]);

  useEffect(() => {
    const cancelPending = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    const form = minInput.current?.form;
    form?.addEventListener("submit", cancelPending);

    const restoreHistoryPrice = () => {
      cancelPending();
      const parsed = parseCollectionParams(new URLSearchParams(window.location.search));
      const historyPrice = parsed.filters.find((filter) => filter.price)?.price;
      if (minInput.current) minInput.current.value = String(historyPrice?.min ?? "");
      if (maxInput.current) maxInput.current.value = String(historyPrice?.max ?? "");
    };
    window.addEventListener("popstate", restoreHistoryPrice);

    return () => {
      form?.removeEventListener("submit", cancelPending);
      window.removeEventListener("popstate", restoreHistoryPrice);
      cancelPending();
    };
  }, []);

  function submitAfterTyping(event: React.ChangeEvent<HTMLInputElement>) {
    if (timer.current) clearTimeout(timer.current);
    const form = event.currentTarget.form;
    timer.current = setTimeout(() => {
      timer.current = null;
      form?.requestSubmit();
    }, 350);
  }

  return (
    <div className="price-range-fields">
      <label className="price-input-wrap">
        <span className="sr-only">最低價格（{currencyCode}）</span>
        <span aria-hidden="true">{symbol}</span>
        <input
          ref={minInput}
          type="number"
          name="filter.v.price.gte"
          defaultValue={min}
          aria-label={`最低價格（${currencyCode}）`}
          min="0"
          step="any"
          placeholder="最低"
          onChange={submitAfterTyping}
        />
      </label>
      <span className="price-range-dash" aria-hidden="true">—</span>
      <label className="price-input-wrap">
        <span className="sr-only">最高價格（{currencyCode}）</span>
        <span aria-hidden="true">{symbol}</span>
        <input
          ref={maxInput}
          type="number"
          name="filter.v.price.lte"
          defaultValue={max}
          aria-label={`最高價格（${currencyCode}）`}
          min="0"
          step="any"
          placeholder="最高"
          onChange={submitAfterTyping}
        />
      </label>
    </div>
  );
}

function describeFilter(filter: ProductFilter, availableFilters: AvailableFilter[]): string {
  if (filter.price) {
    const min = filter.price.min ?? 0;
    const max = filter.price.max;
    return max == null ? `${min}+` : `${min}–${max}`;
  }
  for (const group of availableFilters) {
    const match = group.values.find((value) => {
      try {
        return JSON.stringify(JSON.parse(value.input)) === JSON.stringify(filter);
      } catch {
        return false;
      }
    });
    if (match) return match.label;
  }
  const firstValue = Object.values(filter)[0];
  return typeof firstValue === "string" ? firstValue : "已選篩選";
}
