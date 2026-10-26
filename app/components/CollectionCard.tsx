import { Link } from "react-router";
import { shopifyImageUrl } from "~/lib/shopify-image";

type CollectionCardData = {
  id: string;
  title: string;
  handle: string;
  image: { url: string; altText: string | null } | null;
};

export function CollectionCard({ collection, index = 0 }: { collection: CollectionCardData; index?: number }) {
  const image = shopifyImageUrl(collection.image?.url, {
    width: 1000,
    height: 620,
    crop: "center",
  });

  return (
    <Link className={`collection-card collection-card-${(index % 3) + 1}`} to={`/collections/${collection.handle}`}>
      <div className="collection-card-media">
        {image ? (
          <img src={image} alt={collection.image?.altText || collection.title} width={1000} height={620} loading="lazy" />
        ) : (
          <span className="collection-spark" aria-hidden="true">✳</span>
        )}
        <span className="collection-card-index">0{index + 1}</span>
      </div>
      <div className="collection-card-label">
        <h3>{collection.title}</h3>
        <span aria-hidden="true">↗</span>
      </div>
    </Link>
  );
}
