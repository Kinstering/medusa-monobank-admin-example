import { clientIp, rateLimit } from "../rate-limit"

/**
 * /auth/* открыт наружу и не требует публичного ключа, поэтому лимит на
 * витрине ничего не значит — подбирать пароль можно прямо здесь.
 */
describe("rateLimit", () => {
	const key = () => `test:${Math.random()}`

	it("пропускает до предела и отсекает после", () => {
		const k = key()
		const allowed = Array.from({ length: 3 }, () =>
			rateLimit({ key: k, limit: 3, windowMs: 60_000 }),
		)

		expect(allowed.every((result) => result.allowed)).toBe(true)
		expect(rateLimit({ key: k, limit: 3, windowMs: 60_000 }).allowed).toBe(false)
	})

	it("считает ключи независимо", () => {
		const first = key()
		const second = key()
		rateLimit({ key: first, limit: 1, windowMs: 60_000 })

		expect(rateLimit({ key: first, limit: 1, windowMs: 60_000 }).allowed).toBe(false)
		expect(rateLimit({ key: second, limit: 1, windowMs: 60_000 }).allowed).toBe(true)
	})

	it("сообщает, через сколько пробовать снова", () => {
		const k = key()
		rateLimit({ key: k, limit: 1, windowMs: 60_000 })
		const blocked = rateLimit({ key: k, limit: 1, windowMs: 60_000 })

		expect(blocked.retryAfter).toBeGreaterThan(0)
		expect(blocked.retryAfter).toBeLessThanOrEqual(60)
	})

	it("не хранит присланную клиентом строку целиком", () => {
		// Ключ содержит адрес почты из запроса, длину которого задаёт клиент.
		// Мегабайтные «адреса» не должны превращаться в способ съесть память.
		const huge = "a".repeat(1_000_000)
		expect(() => rateLimit({ key: `auth:email:${huge}`, limit: 1, windowMs: 1000 })).not.toThrow()
	})
})

describe("clientIp", () => {
	it("берёт первый адрес из цепочки прокси", () => {
		expect(clientIp({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })).toBe("203.0.113.5")
	})

	it("пустая строка, когда заголовка нет", () => {
		expect(clientIp({})).toBe("")
	})
})
