import { readAddons } from "../addons"
import { parseSimpleProduct } from "../simple-product"

const valid = {
  title: "  Худі оверсайз ",
  price: "2390",
  stock: 10,
  addons: [
    { title: "Фарбування", price: 150 },
    { title: "", price: 10 },
  ],
}

describe("parseSimpleProduct", () => {
  it("normalises the form and drops empty add-on rows", () => {
    const input = parseSimpleProduct(valid)
    expect(input).toMatchObject({ title: "Худі оверсайз", price: 2390, stock: 10, publish: true })
    expect(input.addons.map(({ title, price }) => [title, price])).toEqual([["Фарбування", 150]])
  })

  it("gives add-ons ids the cart route accepts", () => {
    const { addons } = parseSimpleProduct(valid)
    expect(readAddons({ addons })).toHaveLength(1)
  })

  it("accepts a comma as the decimal separator", () => {
    expect(parseSimpleProduct({ ...valid, price: "99,5" }).price).toBe(99.5)
  })

  it.each([
    [{ ...valid, title: "" }],
    [{ ...valid, price: "free" }],
    [{ ...valid, price: -1 }],
    [{ ...valid, stock: 1.5 }],
    [{ ...valid, category_id: "drop table" }],
    [{ ...valid, images: ["javascript:alert(1)"] }],
    [{ ...valid, addons: [{ title: "Фарбування", price: "багато" }] }],
  ])("rejects %p", (body) => {
    expect(() => parseSimpleProduct(body)).toThrow()
  })
})
