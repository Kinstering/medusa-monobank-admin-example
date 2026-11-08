import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { summarizeRatings } from "../../../lib/reviews"
import { REVIEWS_MODULE } from "../../../modules/reviews"
import type ReviewsModuleService from "../../../modules/reviews/service"

const MAX_REVIEWS = 50

/**
 * Reviews of a published product, looked up by handle (what the storefront
 * has in the URL). Only published products answer, so drafts stay hidden.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const handle = typeof req.query.handle === "string" ? req.query.handle : ""
  if (!handle || handle.length > 200) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "handle is required")
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [product],
  } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle, status: "published" },
  })
  if (!product) {
    return res.json({ reviews: [], summary: summarizeRatings([]) })
  }

  const reviews: ReviewsModuleService = req.scope.resolve(REVIEWS_MODULE)
  const list = await reviews.listReviews(
    { product_id: product.id },
    { order: { reviewed_at: "DESC" }, select: ["id", "author", "rating", "content", "reviewed_at"] }
  )

  res.json({
    reviews: list.slice(0, MAX_REVIEWS),
    summary: summarizeRatings(list.map((review) => review.rating)),
  })
}
