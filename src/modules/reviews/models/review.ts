import { model } from "@medusajs/framework/utils"

/**
 * A customer review shown on a product page. Reviews are entered by the shop
 * in the admin (product page → "Відгуки"), not submitted from the storefront.
 */
export const Review = model.define("review", {
  id: model.id({ prefix: "rev" }).primaryKey(),
  product_id: model.text().index("IDX_REVIEW_PRODUCT_ID"),
  author: model.text(),
  rating: model.number(),
  content: model.text(),
  /** The date shown on the site; the shop may enter a review written earlier. */
  reviewed_at: model.dateTime(),
})
