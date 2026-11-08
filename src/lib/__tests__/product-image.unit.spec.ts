import sharp from "sharp"
import { PRODUCT_IMAGE_SIZE, toProductImage } from "../product-image"

const photo = (width: number, height: number, channels: 3 | 4) =>
  sharp({
    create: {
      width,
      height,
      channels,
      background: channels === 4 ? { r: 10, g: 20, b: 30, alpha: 0.5 } : { r: 10, g: 20, b: 30 },
    },
  })

describe("toProductImage", () => {
  it("turns a wide JPEG into a 1000×1000 WebP with a white margin", async () => {
    const content = await photo(2400, 1200, 3).jpeg().toBuffer()
    const result = await toProductImage({ filename: "deck.JPG", mimeType: "image/jpeg", content })
    const meta = await sharp(result.content).metadata()

    expect(result).toMatchObject({ filename: "deck.webp", mimeType: "image/webp" })
    expect([meta.width, meta.height, meta.format]).toEqual([PRODUCT_IMAGE_SIZE, PRODUCT_IMAGE_SIZE, "webp"])

    const { data } = await sharp(result.content).raw().toBuffer({ resolveWithObject: true })
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255])
  })

  it("keeps transparency for cut-outs", async () => {
    const content = await photo(400, 800, 4).png().toBuffer()
    const result = await toProductImage({ filename: "frame.png", mimeType: "image/png", content })
    const meta = await sharp(result.content).metadata()

    expect(meta.hasAlpha).toBe(true)
    expect([meta.width, meta.height]).toEqual([PRODUCT_IMAGE_SIZE, PRODUCT_IMAGE_SIZE])
  })

  it("passes through files that are not raster photos", async () => {
    const file = { filename: "import.csv", mimeType: "text/csv", content: Buffer.from("a,b") }
    expect(await toProductImage(file)).toBe(file)
  })
})
