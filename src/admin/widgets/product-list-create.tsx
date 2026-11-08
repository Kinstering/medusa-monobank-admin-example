import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Plus } from "@medusajs/icons"
import { Button, Container, Heading, Text } from "@medusajs/ui"

/**
 * Sends "add a product" to the shop's one-screen form (/app/new-product)
 * instead of the core wizard, whose options-and-variants step this shop does
 * not use. The core "Create" button is hidden by its link, the only stable hook
 * the dashboard offers; import and export stay.
 */
const ProductListCreate = () => (
  <Container className="flex items-center justify-between px-6 py-4">
    <style>{`a[href$="/products/create"] { display: none !important; }`}</style>
    <div>
      <Heading level="h2">Додати товар</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        Назва, ціна, кількість, фото й платні опції — на одному екрані.
      </Text>
    </div>
    <Button size="small" asChild>
      <a href="/app/new-product">
        <Plus /> Новий товар
      </a>
    </Button>
  </Container>
)

export const config = defineWidgetConfig({
  zone: "product.list.before",
})

export default ProductListCreate
