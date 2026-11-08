import { assertPayableCart, isAllowedProvider } from "../payment-guard"

/**
 * Главный инвариант магазина: заказ не появляется без денег.
 *
 * pp_system_default регистрируется в Medusa безусловно и авторизует платёж
 * сам себя, ничего не списывая: заказ на такой сессии вышел бы бесплатным.
 */
describe("isAllowedProvider", () => {
	it("пропускает только монобанк", () => {
		expect(isAllowedProvider("pp_monobank_monobank")).toBe(true)
	})

	it.each([
		"pp_system_default",
		"PP_MONOBANK_MONOBANK",
		" pp_monobank_monobank",
		"",
		null,
		undefined,
		["pp_monobank_monobank"],
		{ toString: () => "pp_monobank_monobank" },
	])("отвергает %p", (value) => {
		expect(isAllowedProvider(value)).toBe(false)
	})
})

describe("assertPayableCart", () => {
	const cart = (sessions: unknown[]) => ({
		total: 410,
		currency_code: "uah",
		payment_collection: { payment_sessions: sessions as never },
	})

	const monobank = { provider_id: "pp_monobank_monobank", status: "pending", amount: 410 }

	it("пропускает корзину, оплаченную монобанком на её сумму", () => {
		expect(() => assertPayableCart(cart([monobank]))).not.toThrow()
	})

	it("не даёт оформить бесплатный заказ через pp_system_default", () => {
		expect(() =>
			assertPayableCart(cart([{ ...monobank, provider_id: "pp_system_default" }])),
		).toThrow(/недоступна/)
	})

	it("отвергает корзину, где к разрешённой сессии подмешана чужая", () => {
		expect(() =>
			assertPayableCart(cart([monobank, { provider_id: "pp_system_default", status: "pending" }])),
		).toThrow(/недоступна/)
	})

	it("требует хотя бы одну сессию", () => {
		expect(() => assertPayableCart(cart([]))).toThrow(/сесії/)
		expect(() => assertPayableCart({ total: 410, payment_collection: null })).toThrow(/сесії/)
		expect(() => assertPayableCart(undefined)).toThrow(/сесії/)
	})

	it("отвергает оплату меньше суммы корзины", () => {
		expect(() => assertPayableCart(cart([{ ...monobank, amount: 1 }]))).toThrow(/не збігається/)
	})

	it("отвергает оплату в другой валюте", () => {
		expect(() => assertPayableCart(cart([{ ...monobank, currency_code: "usd" }]))).toThrow(
			/не збігається/,
		)
	})

	it("сравнивает суммы в копейках, а не как дробные числа", () => {
		const penny = {
			total: 0.1 + 0.2,
			currency_code: "uah",
			payment_collection: {
				payment_sessions: [{ ...monobank, amount: 0.3 }] as never,
			},
		}
		expect(() => assertPayableCart(penny)).not.toThrow()
	})
})
