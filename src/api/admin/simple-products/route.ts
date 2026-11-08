import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import { createInventoryLevelsWorkflow, createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { parseSimpleProduct } from "../../../lib/simple-product"
import { toHandle, uniqueHandle } from "../../../lib/slug"

const CURRENCY = "uah"
/** A product without variants still needs one option in Medusa; the storefront hides single-value options. */
const OPTION = { title: "Варіант", value: "Стандарт" }

/**
 * Creates a product from the one-screen "Новий товар" form: one price, one
 * stock count, photos and paid add-ons, published to the store's default sales
 * channel. The core create form asks for options and variants first, which this
 * shop does not use.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const input = parseSimpleProduct(req.body)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const storeModule = req.scope.resolve(Modules.STORE)
  const fulfillment = req.scope.resolve(Modules.FULFILLMENT)
  const stockLocations = req.scope.resolve(Modules.STOCK_LOCATION)

  const [store] = await storeModule.listStores({}, { take: 1 })
  const [shippingProfile] = await fulfillment.listShippingProfiles({ type: "default" }, { take: 1 })
  const [location] = await stockLocations.listStockLocations({}, { take: 1 })
  if (!store?.default_sales_channel_id || !shippingProfile || !location) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Магазин не налаштовано: немає каналу продажу, складу чи профілю доставки"
    )
  }

  const base = toHandle(input.title)
  const { data: similar } = await query.graph({
    entity: "product",
    fields: ["handle"],
    filters: { handle: { $like: `${base || "tovar"}%` } },
    withDeleted: true,
  })
  const handle = uniqueHandle(base, new Set(similar.map((product) => product.handle)))

  const { result } = await createProductsWorkflow(req.scope).run({
    input: {
      products: [
        {
          title: input.title,
          handle,
          description: input.description || undefined,
          status: input.publish ? ProductStatus.PUBLISHED : ProductStatus.DRAFT,
          shipping_profile_id: shippingProfile.id,
          category_ids: input.category_id ? [input.category_id] : [],
          sales_channels: [{ id: store.default_sales_channel_id }],
          thumbnail: input.images[0],
          images: input.images.map((url) => ({ url })),
          options: [{ title: OPTION.title, values: [OPTION.value] }],
          variants: [
            {
              title: OPTION.value,
              options: { [OPTION.title]: OPTION.value },
              manage_inventory: true,
              prices: [{ amount: input.price, currency_code: CURRENCY }],
            },
          ],
          metadata: {
            addons: input.addons,
          },
        },
      ],
    },
  })
  const product = result[0]

  const {
    data: [variant],
  } = await query.graph({
    entity: "product_variant",
    fields: ["inventory_items.inventory_item_id"],
    filters: { product_id: product.id },
  })
  const inventoryItemId = variant?.inventory_items?.[0]?.inventory_item_id
  if (inventoryItemId) {
    await createInventoryLevelsWorkflow(req.scope).run({
      input: {
        inventory_levels: [
          {
            inventory_item_id: inventoryItemId,
            location_id: location.id,
            stocked_quantity: input.stock,
          },
        ],
      },
    })
  }

  res.status(201).json({ product: { id: product.id, handle: product.handle } })
}
