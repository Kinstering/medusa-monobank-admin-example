import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { StarSolid, Trash } from "@medusajs/icons"
import { Button, Container, Heading, IconButton, Input, Label, Text, Textarea, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { adminFetch } from "../lib/api"

type Review = { id: string; author: string; rating: number; content: string; reviewed_at: string }

const today = () => new Date().toISOString().slice(0, 10)

function Stars({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          aria-label={`${star} з 5`}
          onClick={() => onChange?.(star)}
          className={star <= value ? "text-ui-tag-orange-icon" : "text-ui-fg-disabled"}
        >
          <StarSolid />
        </button>
      ))}
    </div>
  )
}

/**
 * Reviews shown on the product page of the site. The shop enters them here;
 * the storefront reads them from /store/reviews.
 */
const ProductReviewsWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const [reviews, setReviews] = useState<Review[]>([])
  const [author, setAuthor] = useState("")
  const [rating, setRating] = useState(5)
  const [content, setContent] = useState("")
  const [date, setDate] = useState(today)
  const [saving, setSaving] = useState(false)

  const load = () =>
    adminFetch<{ reviews: Review[] }>(`/admin/products/${product.id}/reviews`)
      .then((data) => setReviews(data.reviews))
      .catch(() => toast.error("Не вдалося завантажити відгуки"))

  useEffect(() => {
    load()
  }, [product.id])

  const add = async () => {
    setSaving(true)
    try {
      await adminFetch(`/admin/products/${product.id}/reviews`, {
        method: "POST",
        body: { author, rating, content, reviewed_at: date },
      })
      setAuthor("")
      setContent("")
      setRating(5)
      setDate(today())
      toast.success("Відгук додано")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося додати відгук")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm("Видалити цей відгук?")) {
      return
    }
    try {
      await adminFetch(`/admin/reviews/${id}`, { method: "DELETE" })
      setReviews((current) => current.filter((review) => review.id !== id))
    } catch {
      toast.error("Не вдалося видалити відгук")
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Відгуки</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Показуються на сторінці товару на сайті.
        </Text>
      </div>

      <div className="grid gap-4 px-6 py-4">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
          <div className="grid gap-1.5">
            <Label size="small">Ім'я</Label>
            <Input placeholder="Олег, Київ" value={author} onChange={(event) => setAuthor(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label size="small">Оцінка</Label>
            <div className="flex h-8 items-center">
              <Stars value={rating} onChange={setRating} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label size="small">Дата</Label>
            <Input type="date" max={today()} value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label size="small">Текст відгуку</Label>
          <Textarea rows={3} value={content} onChange={(event) => setContent(event.target.value)} />
        </div>
        <div className="flex justify-end">
          <Button size="small" onClick={add} isLoading={saving} disabled={!author.trim() || !content.trim()}>
            Додати відгук
          </Button>
        </div>
      </div>

      {reviews.length > 0 && (
        <ul className="divide-y">
          {reviews.map((review) => (
            <li key={review.id} className="flex items-start justify-between gap-4 px-6 py-4">
              <div className="grid gap-1">
                <div className="flex items-center gap-3">
                  <Stars value={review.rating} />
                  <Text size="small" weight="plus">
                    {review.author}
                  </Text>
                  <Text size="small" className="text-ui-fg-muted">
                    {new Date(review.reviewed_at).toLocaleDateString("uk-UA")}
                  </Text>
                </div>
                <Text size="small" className="text-ui-fg-subtle">
                  {review.content}
                </Text>
              </div>
              <IconButton variant="transparent" aria-label="Видалити відгук" onClick={() => remove(review.id)}>
                <Trash />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductReviewsWidget
