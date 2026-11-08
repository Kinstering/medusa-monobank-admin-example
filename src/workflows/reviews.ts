import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import type { ReviewInput } from "../lib/reviews"
import { REVIEWS_MODULE } from "../modules/reviews"
import type ReviewsModuleService from "../modules/reviews/service"

type CreateReviewInput = ReviewInput & { product_id: string }

const createReviewStep = createStep(
  "create-review",
  async (input: CreateReviewInput, { container }) => {
    const reviews: ReviewsModuleService = container.resolve(REVIEWS_MODULE)
    const review = await reviews.createReviews(input)
    return new StepResponse(review, review.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const reviews: ReviewsModuleService = container.resolve(REVIEWS_MODULE)
    await reviews.deleteReviews(id)
  }
)

export const createReviewWorkflow = createWorkflow("create-review", (input: CreateReviewInput) => {
  const review = createReviewStep(input)
  return new WorkflowResponse(review)
})

const deleteReviewStep = createStep(
  "delete-review",
  async (id: string, { container }) => {
    const reviews: ReviewsModuleService = container.resolve(REVIEWS_MODULE)
    await reviews.softDeleteReviews(id)
    return new StepResponse(id, id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const reviews: ReviewsModuleService = container.resolve(REVIEWS_MODULE)
    await reviews.restoreReviews(id)
  }
)

export const deleteReviewWorkflow = createWorkflow("delete-review", (id: string) => {
  const deleted = deleteReviewStep(id)
  return new WorkflowResponse(deleted)
})
