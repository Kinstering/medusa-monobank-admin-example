import { MedusaError } from "@medusajs/framework/utils"

/**
 * Paid add-ons ("фарбування +150 грн") that a shopper can tick on a product.
 *
 * They are configured per product in the admin widget and stored in product
 * metadata under `addons`. The storefront only ever sends the ids it picked;
 * the price of a line is always computed here from the product's own list, so
 * a crafted request cannot name its own price.
 */
export type Addon = {
  id: string
  title: string
  /** Major units of the store currency (150 = 150 грн), like every Medusa price. */
  price: number
}

export const ADDONS_METADATA_KEY = "addons"

export const MAX_ADDONS = 20
const MAX_TITLE = 80
const MAX_PRICE = 100_000
const ID_PATTERN = /^[a-z0-9-]{1,40}$/

const isAddon = (value: unknown): value is Addon => {
  if (!value || typeof value !== "object") {
    return false
  }
  const { id, title, price } = value as Record<string, unknown>
  return (
    typeof id === "string" &&
    ID_PATTERN.test(id) &&
    typeof title === "string" &&
    title.trim().length > 0 &&
    title.length <= MAX_TITLE &&
    typeof price === "number" &&
    Number.isFinite(price) &&
    price >= 0 &&
    price <= MAX_PRICE
  )
}

/**
 * Reads the add-on list out of product metadata. Anything malformed is
 * dropped rather than trusted: metadata is free-form and can also be edited
 * through the generic metadata editor in the admin.
 */
export const readAddons = (metadata: Record<string, unknown> | null | undefined): Addon[] => {
  const raw = metadata?.[ADDONS_METADATA_KEY]
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.filter(isAddon).slice(0, MAX_ADDONS)
}

/**
 * Resolves the ids a shopper picked against the product's list. An unknown id
 * is an error, not something to skip silently: the shopper would otherwise pay
 * for less than they think they ordered.
 */
export const pickAddons = (available: Addon[], requestedIds: unknown): Addon[] => {
  if (requestedIds === undefined || requestedIds === null) {
    return []
  }
  if (!Array.isArray(requestedIds) || requestedIds.length > MAX_ADDONS) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "addon_ids must be a short list of ids")
  }

  const unique = [...new Set(requestedIds)]
  return unique.map((id) => {
    const addon = available.find((entry) => entry.id === id)
    if (!addon) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `Unknown add-on: ${String(id)}`)
    }
    return addon
  })
}

/** Kopiyky: prices are summed as integers, never as floats. */
const toMinor = (amount: number) => Math.round(amount * 100)

export const priceWithAddons = (basePrice: number, addons: Addon[]) =>
  (toMinor(basePrice) + addons.reduce((sum, addon) => sum + toMinor(addon.price), 0)) / 100

/**
 * Line item metadata for the chosen add-ons. Sorted, so the same choice made in
 * a different order still merges into one cart line.
 */
export const addonsLineMetadata = (addons: Addon[]) => ({
  [ADDONS_METADATA_KEY]: [...addons]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, title, price }) => ({ id, title, price })),
})
