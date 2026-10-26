import { gql, type StorefrontApi } from "@shopify/hydrogen";

export const VARIANT_FIELDS_FRAGMENT = gql(`
  fragment Seven11VariantFields on ProductVariant {
    id
    title
    availableForSale
    selectedOptions { name value }
    price { amount currencyCode }
    compareAtPrice { amount currencyCode }
    image { url altText width height }
    product { title handle }
    sku
  }
`);

export const PRODUCT_QUERY = gql(
  `
    query Seven11Product(
      $handle: String!
      $selectedOptions: [SelectedOptionInput!]!
      $country: CountryCode
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      product(handle: $handle) {
        id
        handle
        title
        vendor
        description
        descriptionHtml
        requiresSellingPlan
        featuredImage { url altText width height }
        options {
          name
          optionValues {
            name
            firstSelectableVariant { ...Seven11VariantFields }
          }
        }
        encodedVariantExistence
        encodedVariantAvailability
        selectedOrFirstAvailableVariant(
          selectedOptions: $selectedOptions
          ignoreUnknownOptions: true
          caseInsensitiveMatch: true
        ) { ...Seven11VariantFields }
        adjacentVariants(
          selectedOptions: $selectedOptions
          ignoreUnknownOptions: true
          caseInsensitiveMatch: true
        ) { ...Seven11VariantFields }
        media(first: 8) {
          nodes {
            __typename
            id
            mediaContentType
            alt
            ... on MediaImage { image { url altText width height } }
            previewImage { url altText width height }
          }
        }
        priceRange {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
      }
    }
  `,
  [VARIANT_FIELDS_FRAGMENT],
);

export type ProductData = NonNullable<StorefrontApi.ResultOf<typeof PRODUCT_QUERY>["product"]>;
