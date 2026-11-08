import { MedusaError } from "@medusajs/framework/utils"

const MAX_AUTHOR = 60
const MAX_CONTENT = 2000

export type ReviewInput = {
  author: string
  rating: number
  content: string
  reviewed_at: Date
}

/** Checks a review typed in the admin before it is stored and shown on the site. */
export function parseReviewInput(body: unknown, now = new Date()): ReviewInput {
  const { author, rating, content, reviewed_at: reviewedAt } = (body ?? {}) as Record<string, unknown>

  const name = typeof author === "string" ? author.trim() : ""
  if (!name || name.length > MAX_AUTHOR) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Вкажіть ім'я автора (до ${MAX_AUTHOR} символів)`)
  }

  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Оцінка має бути від 1 до 5")
  }

  const text = typeof content === "string" ? content.trim() : ""
  if (!text || text.length > MAX_CONTENT) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Напишіть текст відгуку (до ${MAX_CONTENT} символів)`)
  }

  let date = now
  if (reviewedAt !== undefined && reviewedAt !== null && reviewedAt !== "") {
    date = new Date(String(reviewedAt))
    if (Number.isNaN(date.getTime()) || date.getTime() > now.getTime()) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Дата відгуку некоректна або в майбутньому")
    }
  }

  return { author: name, rating, content: text, reviewed_at: date }
}

export const summarizeRatings = (ratings: number[]) => ({
  reviewCount: ratings.length,
  averageRating: ratings.length
    ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
    : 0,
})
