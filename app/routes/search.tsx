import { gql, parseCollectionParams } from "@shopify/hydrogen";
import type { ProductFilter as StorefrontApiProductFilter } from "@shopify/hydrogen/storefront-api-types";
import type { Route } from "./+types/search";
import { CollectionBrowser } from "~/components/CollectionBrowser";
import { storefrontClientContext } from "~/lib/shopify.server";

const SEARCH_PRODUCTS_QUERY = gql(`
  query SevenElevenSearchProducts(
    $query: String!
    $first: Int!
    $after: String
    $productFilters: [ProductFilter!]
    $sortKey: SearchSortKeys
    $reverse: Boolean
  ) {
    shop { paymentSettings { currencyCode } }
    search(
      query: $query
      first: $first
      after: $after
      types: [PRODUCT]
      productFilters: $productFilters
      sortKey: $sortKey
      reverse: $reverse
    ) {
      nodes {
        ... on Product {
          __typename
          id
          title
          handle
          featuredImage { url altText }
          priceRange { minVariantPrice { amount currencyCode } }
        }
      }
      productFilters { id label type values { id label count input } }
      pageInfo { hasNextPage endCursor }
    }
  }
`);

export async function loader({ context, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const term = (url.searchParams.get("q") || "").trim().slice(0, 120);
  const dataSearch = url.searchParams.toString();
  if (!term) {
    return {
      term,
      products: [],
      availableFilters: [],
      currencyCode: "TWD" as const,
      dataSearch,
      after: null,
      hasNextPage: false,
    };
  }

  const browse = parseCollectionParams(url.searchParams);
  const storefrontClient = context.get(storefrontClientContext);
  const isPriceSort = browse.sortKey === "PRICE";
  const { data } = await storefrontClient.graphql(SEARCH_PRODUCTS_QUERY, {
    variables: {
      query: term,
      first: 12,
      after: url.searchParams.get("after") || undefined,
      productFilters: browse.filters.length
        ? (browse.filters as StorefrontApiProductFilter[])
        : undefined,
      sortKey: isPriceSort ? "PRICE" : "RELEVANCE",
      reverse: isPriceSort ? browse.reverse : undefined,
    },
  });
  return {
    term,
    products: data?.search.nodes.filter((node) => node.__typename === "Product") ?? [],
    availableFilters: data?.search.productFilters ?? [],
    currencyCode: data?.shop.paymentSettings.currencyCode ?? "TWD",
    dataSearch,
    after: data?.search.pageInfo.endCursor ?? null,
    hasNextPage: data?.search.pageInfo.hasNextPage ?? false,
  };
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "搜尋商品｜小七補給站" },
    { name: "description", content: "搜尋目前 Shopify 示範商店中的商品。" },
  ];
}

export default function SearchRoute({ loaderData }: Route.ComponentProps) {
  return (
    <CollectionBrowser
      title={loaderData.term ? `搜尋「${loaderData.term}」` : "搜尋商品"}
      eyebrow="FIND YOUR PICK"
      action="/search"
      handle={`search:${loaderData.term}`}
      dataSearch={loaderData.dataSearch}
      products={loaderData.products}
      availableFilters={loaderData.availableFilters}
      currencyCode={loaderData.currencyCode}
      after={loaderData.after}
      hasNextPage={loaderData.hasNextPage}
      searchTerm={loaderData.term}
    />
  );
}
