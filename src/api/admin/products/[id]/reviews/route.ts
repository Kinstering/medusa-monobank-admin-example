import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { parseReviewInput } from "../../../../../lib/reviews"
import { REVIEWS_MODULE } from "../../../../../modules/reviews"
import type ReviewsModuleService from "../../../../../modules/reviews/service"
import { createReviewWorkflow } from "../../../../../workflows/reviews"

/** Reviews of one product for the admin widget, newest first. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const reviews: ReviewsModuleService = req.scope.resolve(REVIEWS_MODULE)
  const list = await reviews.listReviews({ product_id: req.params.id }, { order: { reviewed_at: "DESC" }, take: 200 })
  res.json({ reviews: list })
}

/** Adds a review to the product. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [product],
  } = await query.graph({ entity: "product", fields: ["id"], filters: { id: req.params.id } })
  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Товар не знайдено")
  }

  const { result: review } = await createReviewWorkflow(req.scope).run({
    input: { ...parseReviewInput(req.body), product_id: product.id },
  })
  res.status(201).json({ review })
}
