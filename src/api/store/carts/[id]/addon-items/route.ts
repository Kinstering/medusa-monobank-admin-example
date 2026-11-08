import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, QueryContext } from "@medusajs/framework/utils"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
import { addonsLineMetadata, pickAddons, priceWithAddons, readAddons } from "../../../../../lib/addons"

type Body = {
  variant_id?: unknown
  quantity?: unknown
  addon_ids?: unknown
}

const MAX_QUANTITY = 99

/**
 * Adds a variant to the cart together with paid add-ons.
 *
 * The core line-items route does not accept a price, and must not: here the
 * unit price is the variant's own calculated price in the cart's region plus
 * the add-ons, both read from the database. The line is marked as custom
 * priced, so later quantity changes keep it, and the chosen add-ons travel in
 * line item metadata into the order.
 *
 * Without add-ons this behaves like the core route.
 */
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const cartId = req.params.id
  const { variant_id: variantId, quantity, addon_ids: addonIds } = req.body ?? {}

  if (typeof variantId !== "string" || !/^variant_[A-Za-z0-9]+$/.test(variantId)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "variant_id is required")
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `quantity must be an integer from 1 to ${MAX_QUANTITY}`)
  }

  const {
    data: [cart],
  } = await query.graph({
    entity: "cart",
    fields: ["id", "region_id", "currency_code", "completed_at"],
    filters: { id: cartId },
  })
  if (!cart || cart.completed_at) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found")
  }

  const {
    data: [variant],
  } = await query.graph({
    entity: "product_variant",
    fields: ["id", "product.metadata", "calculated_price.*"],
    filters: { id: variantId },
    context: {
      calculated_price: QueryContext({ region_id: cart.region_id, currency_code: cart.currency_code }),
    },
  })
  if (!variant) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Variant not found")
  }

  const addons = pickAddons(readAddons(variant.product?.metadata), addonIds)
  // calculated_price is computed by the pricing context above and missing from the entity type.
  const basePrice = (variant as { calculated_price?: { calculated_amount?: number | null } }).calculated_price
    ?.calculated_amount

  if (addons.length > 0 && typeof basePrice !== "number") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Variant has no price in this region")
  }

  await addToCartWorkflow(req.scope).run({
    input: {
      cart_id: cart.id,
      items: [
        addons.length > 0
          ? {
              variant_id: variantId,
              quantity,
              unit_price: priceWithAddons(basePrice as number, addons),
              metadata: addonsLineMetadata(addons),
            }
          : { variant_id: variantId, quantity },
      ],
    },
  })

  // The storefront refetches the cart through the core route, which computes totals.
  res.json({ cart_id: cart.id })
}
