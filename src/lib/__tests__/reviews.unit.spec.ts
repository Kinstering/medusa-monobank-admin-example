import { parseReviewInput, summarizeRatings } from "../reviews"

const now = new Date("2026-10-07T12:00:00Z")

describe("parseReviewInput", () => {
  it("trims the text and defaults the date to now", () => {
    expect(parseReviewInput({ author: "  Олег ", rating: 5, content: " Топ товар " }, now)).toEqual({
      author: "Олег",
      rating: 5,
      content: "Топ товар",
      reviewed_at: now,
    })
  })

  it("accepts a past date", () => {
    const input = parseReviewInput({ author: "А", rating: 4, content: "Ок", reviewed_at: "2026-09-01" }, now)
    expect(input.reviewed_at.toISOString().slice(0, 10)).toBe("2026-09-01")
  })

  it.each([
    [{ author: "", rating: 5, content: "x" }],
    [{ author: "А", rating: 0, content: "x" }],
    [{ author: "А", rating: 4.5, content: "x" }],
    [{ author: "А", rating: "5", content: "x" }],
    [{ author: "А", rating: 5, content: "   " }],
    [{ author: "А", rating: 5, content: "x", reviewed_at: "2027-01-01" }],
    [{ author: "А", rating: 5, content: "x", reviewed_at: "not a date" }],
    [null],
  ])("rejects %p", (body) => {
    expect(() => parseReviewInput(body, now)).toThrow()
  })
})

describe("summarizeRatings", () => {
  it("averages to one decimal", () => {
    expect(summarizeRatings([5, 4, 4])).toEqual({ reviewCount: 3, averageRating: 4.3 })
    expect(summarizeRatings([])).toEqual({ reviewCount: 0, averageRating: 0 })
  })
})
