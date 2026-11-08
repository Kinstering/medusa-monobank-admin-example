import path from "node:path"
import sharp from "sharp"

/** Every product photo in the shop is a square of this size. */
export const PRODUCT_IMAGE_SIZE = 1000

const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/tiff"])

export type UploadedFile = {
  filename: string
  mimeType: string
  content: Buffer
}

/**
 * Brings an uploaded photo to 1000×1000 WebP.
 *
 * The whole photo is kept (fit "contain"): a part cropped off at the edges is
 * worse than a margin. The margin is transparent when the photo already has
 * transparency (a cut-out), otherwise white, which matches a studio shot.
 * EXIF orientation is applied first, so phone photos do not end up sideways.
 *
 * Anything that is not a raster photo (SVG, GIF, a CSV for product import)
 * passes through untouched.
 */
export async function toProductImage(file: UploadedFile): Promise<UploadedFile> {
  if (!RESIZABLE.has(file.mimeType)) {
    return file
  }

  const image = sharp(file.content, { failOn: "error" }).rotate()
  const { hasAlpha } = await image.metadata()

  const content = await image
    .resize(PRODUCT_IMAGE_SIZE, PRODUCT_IMAGE_SIZE, {
      fit: "contain",
      background: hasAlpha ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .webp({ quality: 88 })
    .toBuffer()

  return {
    filename: `${path.parse(file.filename).name}.webp`,
    mimeType: "image/webp",
    content,
  }
}
