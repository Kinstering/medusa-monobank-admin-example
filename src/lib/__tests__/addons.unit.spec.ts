import { addonsLineMetadata, pickAddons, priceWithAddons, readAddons } from "../addons"

const metadata = {
  addons: [
    { id: "paint", title: "Фарбування", price: 150 },
    { id: "grips", title: "Інші грипси", price: 89.5 },
    { id: "bad id!", title: "Зламане", price: 10 },
    { id: "free", title: "", price: 0 },
    { id: "neg", title: "Мінус", price: -5 },
    "not an object",
  ],
}

describe("readAddons", () => {
  it("keeps only well-formed entries", () => {
    expect(readAddons(metadata).map((a) => a.id)).toEqual(["paint", "grips"])
  })

  it("returns nothing for missing or malformed metadata", () => {
    expect(readAddons(null)).toEqual([])
    expect(readAddons({ addons: "paint" })).toEqual([])
  })
})

describe("pickAddons", () => {
  const available = readAddons(metadata)

  it("resolves ids and drops duplicates", () => {
    expect(pickAddons(available, ["paint", "paint"]).map((a) => a.id)).toEqual(["paint"])
  })

  it("treats a missing list as no add-ons", () => {
    expect(pickAddons(available, undefined)).toEqual([])
  })

  it.each([[["unknown"]], ["paint"], [{ 0: "paint" }]])("rejects %p", (ids) => {
    expect(() => pickAddons(available, ids)).toThrow()
  })
})

describe("priceWithAddons", () => {
  it("adds the add-on prices to the base price without float drift", () => {
    const [paint, grips] = readAddons(metadata)
    expect(priceWithAddons(2390, [paint])).toBe(2540)
    expect(priceWithAddons(0.1, [{ ...grips, price: 0.2 }])).toBe(0.3)
  })
})

describe("addonsLineMetadata", () => {
  it("is independent of the order the shopper picked in", () => {
    const [paint, grips] = readAddons(metadata)
    expect(addonsLineMetadata([paint, grips])).toEqual(addonsLineMetadata([grips, paint]))
  })
})
