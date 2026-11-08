import { MedusaError } from "@medusajs/framework/utils"
import { type Addon, MAX_ADDONS } from "./addons"

/**
 * The one-screen product form in the admin ("Новий товар"): a product with a
 * single price and stock, no variants, and its paid add-ons. This checks what
 * the form sends before anything is created.
 */
export type SimpleProductInput = {
  title: string
  description: string
  price: number
  stock: number
  category_id: string | null
  images: string[]
  publish: boolean
  addons: Addon[]
}

const invalid = (message: string) => new MedusaError(MedusaError.Types.INVALID_DATA, message)

const text = (value: unknown, max: number, label: string, required = false) => {
  const trimmed = typeof value === "string" ? value.trim() : ""
  if (required && !trimmed) {
    throw invalid(`Заповніть поле «${label}»`)
  }
  if (trimmed.length > max) {
    throw invalid(`Поле «${label}» задовге (до ${max} символів)`)
  }
  return trimmed
}

const money = (value: unknown, label: string) => {
  const number = typeof value === "string" ? Number(value.replace(",", ".")) : value
  if (typeof number !== "number" || !Number.isFinite(number) || number < 0 || number > 1_000_000) {
    throw invalid(`${label}: вкажіть суму числом, наприклад 2390`)
  }
  return Math.round(number * 100) / 100
}

const newAddonId = (index: number) => `opt-${Date.now().toString(36)}-${index}`

export function parseSimpleProduct(body: unknown): SimpleProductInput {
  const input = (body ?? {}) as Record<string, unknown>

  const stock = typeof input.stock === "string" ? Number(input.stock) : input.stock
  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0 || stock > 100_000) {
    throw invalid("Кількість на складі — ціле число від 0")
  }

  const categoryId =
    typeof input.category_id === "string" && input.category_id ? input.category_id : null
  if (categoryId && !/^pcat_[A-Za-z0-9]+$/.test(categoryId)) {
    throw invalid("Невідома категорія")
  }

  const images = Array.isArray(input.images) ? input.images : []
  if (
    images.length > 10 ||
    !images.every((url) => typeof url === "string" && /^https?:\/\/\S+$/.test(url))
  ) {
    throw invalid("Фото: до 10 завантажених файлів")
  }

  const rawAddons = Array.isArray(input.addons) ? input.addons : []
  if (rawAddons.length > MAX_ADDONS) {
    throw invalid(`Не більше ${MAX_ADDONS} платних опцій`)
  }
  const addons = rawAddons
    .map((entry, index) => {
      const { title, price } = (entry ?? {}) as Record<string, unknown>
      return {
        id: newAddonId(index),
        title: text(title, 80, "Назва опції"),
        price: money(price, "Ціна опції"),
      }
    })
    .filter((addon) => addon.title)

  return {
    title: text(input.title, 200, "Назва", true),
    description: text(input.description, 5000, "Опис"),
    price: money(input.price, "Ціна"),
    stock,
    category_id: categoryId,
    images: images as string[],
    publish: input.publish !== false,
    addons,
  }
}
