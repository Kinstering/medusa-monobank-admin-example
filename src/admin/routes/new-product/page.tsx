import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Plus, Trash, XMark } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  IconButton,
  Input,
  Label,
  Select,
  Switch,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { type FormEvent, useEffect, useState } from "react"
import { adminFetch } from "../../lib/api"

type Category = { id: string; name: string }
type AddonRow = { key: number; title: string; price: string }

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label size="small" weight="plus">
        {label}
      </Label>
      {children}
      {hint && (
        <Text size="xsmall" className="text-ui-fg-muted">
          {hint}
        </Text>
      )}
    </div>
  )
}

/**
 * The shop's product form: everything on one screen, no options or variants.
 * Saved by POST /admin/simple-products; the core form is still reachable from
 * a product's own page for anything unusual.
 */
const NewProductPage = () => {
  const [categories, setCategories] = useState<Category[]>([])
  const [title, setTitle] = useState("")
  const [price, setPrice] = useState("")
  const [stock, setStock] = useState("10")
  const [categoryId, setCategoryId] = useState("")
  const [description, setDescription] = useState("")
  const [publish, setPublish] = useState(true)
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [addons, setAddons] = useState<AddonRow[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminFetch<{ product_categories: Category[] }>(
      "/admin/product-categories?limit=100&fields=id,name"
    )
      .then((data) => setCategories(data.product_categories))
      .catch(() => toast.error("Не вдалося завантажити категорії"))
  }, [])

  const upload = async (files: FileList | null) => {
    if (!files?.length) {
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      Array.from(files).forEach((file) => form.append("files", file))
      const response = await fetch("/admin/uploads", {
        method: "POST",
        credentials: "include",
        body: form,
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.message ?? "Помилка завантаження")
      }
      setImages((current) =>
        [...current, ...data.files.map((file: { url: string }) => file.url)].slice(0, 10)
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося завантажити фото")
    } finally {
      setUploading(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const { product } = await adminFetch<{ product: { id: string } }>("/admin/simple-products", {
        method: "POST",
        body: {
          title,
          price,
          stock: Number(stock),
          category_id: categoryId || null,
          description,
          publish,
          images,
          addons: addons.map(({ title: addonTitle, price: addonPrice }) => ({
            title: addonTitle,
            price: addonPrice,
          })),
        },
      })
      toast.success("Товар створено")
      window.location.assign(`/app/products/${product.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося створити товар")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading>Новий товар</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Один екран: ціна, кількість, фото і платні опції. Фото автоматично стануть 1000×1000.
          </Text>
        </div>

        <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Назва *">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Худі оверсайз"
              />
            </Field>
          </div>
          <Field label="Ціна, грн *">
            <Input
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="2390"
            />
          </Field>
          <Field label="Кількість на складі *">
            <Input
              type="number"
              min={0}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </Field>
          <Field label="Категорія">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <Select.Trigger>
                <Select.Value placeholder="Оберіть категорію" />
              </Select.Trigger>
              <Select.Content>
                {categories.map((category) => (
                  <Select.Item key={category.id} value={category.id}>
                    {category.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Опис">
              <Textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading level="h2">Фото</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Перше фото — головне. До 10 штук.
            </Text>
          </div>
          <Button type="button" size="small" variant="secondary" isLoading={uploading} asChild>
            <label className="cursor-pointer">
              <Plus /> Завантажити
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  upload(e.target.files)
                  e.target.value = ""
                }}
              />
            </label>
          </Button>
        </div>
        <div className="flex flex-wrap gap-3 px-6 py-4">
          {images.length === 0 && (
            <Text size="small" className="text-ui-fg-muted">
              Фото ще немає.
            </Text>
          )}
          {images.map((url, index) => (
            <div key={url} className="relative h-28 w-28 overflow-hidden rounded-lg border">
              <img src={url} alt="" className="h-full w-full object-cover" />
              {index === 0 && (
                <span className="absolute left-1 top-1 rounded bg-ui-bg-base px-1.5 text-xs">
                  Головне
                </span>
              )}
              <IconButton
                type="button"
                size="2xsmall"
                className="absolute right-1 top-1"
                aria-label="Прибрати фото"
                onClick={() => setImages((current) => current.filter((entry) => entry !== url))}
              >
                <XMark />
              </IconButton>
            </div>
          ))}
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading level="h2">Платні опції</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Галочки на сайті, напр. «Фарбування» +150 грн. Можна лишити порожнім.
            </Text>
          </div>
          <Button
            type="button"
            size="small"
            variant="secondary"
            onClick={() =>
              setAddons((current) => [...current, { key: Date.now(), title: "", price: "" }])
            }
          >
            <Plus /> Додати опцію
          </Button>
        </div>
        {addons.length > 0 && (
          <div className="flex flex-col gap-3 px-6 py-4">
            {addons.map((row) => (
              <div key={row.key} className="flex items-center gap-2">
                <Input
                  placeholder="Назва, напр. Фарбування"
                  value={row.title}
                  onChange={(e) =>
                    setAddons((current) =>
                      current.map((entry) =>
                        entry.key === row.key ? { ...entry, title: e.target.value } : entry
                      )
                    )
                  }
                />
                <div className="flex w-40 shrink-0 items-center gap-2">
                  <Input
                    placeholder="150"
                    inputMode="decimal"
                    value={row.price}
                    onChange={(e) =>
                      setAddons((current) =>
                        current.map((entry) =>
                          entry.key === row.key ? { ...entry, price: e.target.value } : entry
                        )
                      )
                    }
                  />
                  <Text size="small">грн</Text>
                </div>
                <IconButton
                  type="button"
                  variant="transparent"
                  aria-label="Видалити опцію"
                  onClick={() =>
                    setAddons((current) => current.filter((entry) => entry.key !== row.key))
                  }
                >
                  <Trash />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </Container>

      <Container className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Switch id="publish" checked={publish} onCheckedChange={setPublish} />
          <Label htmlFor="publish" size="small">
            Одразу показати на сайті
          </Label>
        </div>
        <Button type="submit" isLoading={saving} disabled={uploading}>
          Створити товар
        </Button>
      </Container>
    </form>
  )
}

export const config = defineRouteConfig({
  label: "Новий товар",
  icon: Plus,
})

export default NewProductPage
