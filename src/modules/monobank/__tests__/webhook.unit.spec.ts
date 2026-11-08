import { webhookResult } from "../webhook"

/**
 * Регрессия на дефект, из-за которого вебхук не создал ни одного заказа:
 * провайдер возвращал Medusa номер счёта банка вместо идентификатора её
 * собственной платёжной сессии. Покупатель платил, не возвращался на сайт — и
 * оставался без заказа при списанных деньгах.
 */
describe("webhookResult", () => {
	const SESSION = "payses_01ABCDEF"
	const INVOICE = "2411081234abcd"

	it("отдаёт идентификатор сессии Medusa, а не счёта банка", () => {
		const result = webhookResult("success", SESSION, 41000)

		expect(result.data?.session_id).toBe(SESSION)
		expect(result.data?.session_id).not.toBe(INVOICE)
	})

	it("переводит копейки в основные единицы", () => {
		const result = webhookResult("success", SESSION, 41000)

		expect(Number(result.data?.amount)).toBe(410)
	})

	it.each([
		["success", "captured"],
		["hold", "authorized"],
		["failure", "failed"],
		["expired", "failed"],
	])("статус %s -> действие %s", (status, action) => {
		expect(webhookResult(status as never, SESSION, 100).action).toBe(action)
	})

	it("не трогает заказ на промежуточных статусах", () => {
		expect(webhookResult("processing" as never, SESSION, 100).action).toBe("not_supported")
		expect(webhookResult("created" as never, SESSION, 100).action).toBe("not_supported")
	})
})
