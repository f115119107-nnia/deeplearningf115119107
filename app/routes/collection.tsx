import { gql, parseCollectionParams } from "@shopify/hydrogen";
import type { ProductFilter as StorefrontApiProductFilter } from "@shopify/hydrogen/storefront-api-types";
import type { Route } from "./+types/collection";
import { CollectionBrowser } from "~/components/CollectionBrowser";
import { storefrontClientContext } from "~/lib/shopify.server";

const COLLECTION_PAGE_QUERY = gql(`
  query SevenElevenCollectionPage(
    $handle: String!
    $first: Int!
    $after: String
    $filters: [ProductFilter!]
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
  ) {
    shop { paymentSettings { currencyCode } }
    collection(handle: $handle) {
      id title handle description
      products(first: $first, after: $after, filters: $filters, sortKey: $sortKey, reverse: $reverse) {
        nodes {
          id title handle featuredImage { url altText }
          priceRange { minVariantPrice { amount currencyCode } }
        }
        filters { id label type values { id label count input } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`);

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const handle = params.handle;
  if (!handle) throw new Response("Collection not found", { status: 404 });
  const url = new URL(request.url);
  const browse = parseCollectionParams(url.searchParams);
  const storefrontClient = context.get(storefrontClientContext);
  const { data } = await storefrontClient.graphql(COLLECTION_PAGE_QUERY, {
    variables: {
      handle,
      first: 12,
      after: url.searchParams.get("after") || undefined,
      filters: browse.filters.length ? (browse.filters as StorefrontApiProductFilter[]) : undefined,
      sortKey: browse.sortKey,
      reverse: browse.reverse || undefined,
    },
  });
  if (!data?.collection) throw new Response("Collection not found", { status: 404 });
  return {
    collection: data.collection,
    products: data.collection.products.nodes,
    availableFilters: data.collection.products.filters,
    currencyCode: data.shop.paymentSettings.currencyCode,
    dataSearch: url.searchParams.toString(),
    after: data.collection.products.pageInfo.endCursor,
    hasNextPage: data.collection.products.pageInfo.hasNextPage,
  };
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "商品分類｜小七補給站" },
    { name: "description", content: "瀏覽小七 Shopify 示範商品分類。" },
  ];
}

export default function CollectionRoute({ loaderData }: Route.ComponentProps) {
  return (
    <CollectionBrowser
      title={loaderData.collection.title}
      eyebrow="COLLECTION"
      description={loaderData.collection.description}
      action={`/collections/${loaderData.collection.handle}`}
      handle={loaderData.collection.handle}
      dataSearch={loaderData.dataSearch}
      products={loaderData.products}
      availableFilters={loaderData.availableFilters}
      currencyCode={loaderData.currencyCode}
      after={loaderData.after}
      hasNextPage={loaderData.hasNextPage}
    />
  );
}
