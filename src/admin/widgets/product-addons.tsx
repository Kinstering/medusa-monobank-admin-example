import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { Plus, Trash } from "@medusajs/icons"
import { Button, Container, Heading, IconButton, Input, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { adminFetch } from "../lib/api"

type Row = { id: string; title: string; price: string }

const newId = () => Math.random().toString(36).slice(2, 10)

const fromMetadata = (metadata: Record<string, unknown> | null | undefined): Row[] => {
  const raw = metadata?.addons
  return Array.isArray(raw)
    ? raw.flatMap((entry) =>
        entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.title === "string"
          ? [{ id: entry.id, title: entry.title, price: String(entry.price ?? "") }]
          : []
      )
    : []
}

/**
 * Paid add-ons for a product ("Фарбування — 150 грн"). On the site they show
 * as checkboxes under the variant picker and raise the price when ticked; the
 * backend recomputes that price itself (src/lib/addons.ts), this widget only
 * edits the list in product metadata.
 */
const ProductAddonsWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const [rows, setRows] = useState<Row[]>(() => fromMetadata(product.metadata))
  const [saving, setSaving] = useState(false)

  const update = (id: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  const save = async () => {
    const addons = rows
      .map((row) => ({ id: row.id, title: row.title.trim(), price: Number(row.price.replace(",", ".")) }))
      .filter((row) => row.title)

    if (addons.some((row) => !Number.isFinite(row.price) || row.price < 0)) {
      toast.error("Ціна має бути числом, наприклад 150")
      return
    }

    setSaving(true)
    try {
      await adminFetch(`/admin/products/${product.id}`, {
        method: "POST",
        body: { metadata: { ...(product.metadata ?? {}), addons } },
      })
      setRows(addons.map((row) => ({ ...row, price: String(row.price) })))
      toast.success("Опції збережено")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося зберегти")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Платні опції</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Покупець ставить галочку на сайті — ціна товару збільшується на вказану суму.
          </Text>
        </div>
        <Button
          size="small"
          variant="secondary"
          onClick={() => setRows((current) => [...current, { id: newId(), title: "", price: "" }])}
        >
          <Plus /> Додати опцію
        </Button>
      </div>

      <div className="flex flex-col gap-3 px-6 py-4">
        {rows.length === 0 && (
          <Text size="small" className="text-ui-fg-muted">
            Опцій немає. Наприклад: «Фарбування» — 150 грн.
          </Text>
        )}
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            <Input
              placeholder="Назва, напр. Фарбування"
              value={row.title}
              onChange={(event) => update(row.id, { title: event.target.value })}
            />
            <div className="flex w-40 shrink-0 items-center gap-2">
              <Input
                placeholder="150"
                inputMode="decimal"
                value={row.price}
                onChange={(event) => update(row.id, { price: event.target.value })}
              />
              <Text size="small">грн</Text>
            </div>
            <IconButton
              variant="transparent"
              aria-label="Видалити опцію"
              onClick={() => setRows((current) => current.filter((entry) => entry.id !== row.id))}
            >
              <Trash />
            </IconButton>
          </div>
        ))}
      </div>

      <div className="flex justify-end px-6 py-4">
        <Button size="small" onClick={save} isLoading={saving}>
          Зберегти опції
        </Button>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductAddonsWidget
