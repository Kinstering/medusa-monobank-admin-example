/**
 * Счётчик попыток в памяти процесса.
 *
 * Бэкенд работает одним процессом, поэтому общего хранилища не
 * нужно: состояние живёт столько же, сколько процесс. Появится вторая реплика —
 * счётчики придётся переносить в Redis, иначе потолок умножится на их число.
 *
 * Ключи хешируются: в них попадает адрес почты из запроса, а его длину задаёт
 * клиент. Хеш фиксированной длины не даёт превратить карту в способ съесть
 * память сервера.
 */
import { createHash } from "node:crypto"

type Bucket = { hits: number; expiresAt: number }

const buckets = new Map<string, Bucket>()

/** Больше этого числа ключей карта не растёт: лишнее вытесняется по сроку. */
const MAX_KEYS = 20_000

const prune = (now: number) => {
	buckets.forEach((bucket, key) => {
		if (bucket.expiresAt <= now) {
			buckets.delete(key)
		}
	})

	// Если всё ещё тесно, значит окна длинные и живых записей слишком много —
	// выбрасываем те, что истекут раньше всех.
	if (buckets.size > MAX_KEYS) {
		const byExpiry = [...buckets.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)
		byExpiry.slice(0, buckets.size - MAX_KEYS).forEach(([key]) => buckets.delete(key))
	}
}

const digest = (key: string) => createHash("sha256").update(key).digest("base64url")

export type RateLimitResult = { allowed: boolean; retryAfter: number }

export const rateLimit = ({
	key,
	limit,
	windowMs,
}: {
	key: string
	limit: number
	windowMs: number
}): RateLimitResult => {
	const now = Date.now()
	const hashed = digest(key)
	const existing = buckets.get(hashed)

	if (!existing || existing.expiresAt <= now) {
		buckets.set(hashed, { hits: 1, expiresAt: now + windowMs })
		if (buckets.size > MAX_KEYS) {
			prune(now)
		}
		return { allowed: true, retryAfter: 0 }
	}

	existing.hits += 1

	return existing.hits > limit
		? { allowed: false, retryAfter: Math.ceil((existing.expiresAt - now) / 1000) }
		: { allowed: true, retryAfter: 0 }
}

/**
 * Адрес клиента за обратным прокси.
 *
 * Заголовок подделывается кем угодно, поэтому он никогда не бывает
 * единственным ключом — только дополнением к тому, что назвал сам запрос
 * (адрес почты). Иначе подменой заголовка снимался бы любой лимит, а без него
 * все посетители попадали бы в одно ведро и один злоумышленник закрывал бы
 * вход всему магазину.
 */
export const clientIp = (headers: Record<string, unknown>) => {
	const forwarded = headers["x-forwarded-for"]
	const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded) as string | undefined
	return first?.split(",")[0]?.trim() ?? ""
}
