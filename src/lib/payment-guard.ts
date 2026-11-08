import { MedusaError } from "@medusajs/framework/utils"

/**
 * Единственный провайдер, которым покупателю разрешено платить, и проверка
 * корзины перед созданием заказа.
 *
 * Живёт отдельным модулем, потому что применяется в двух местах — в middleware
 * на маршруте создания сессий и в хуке completeCartWorkflow — и потому что
 * иначе это невозможно покрыть тестом: и middleware, и хук тянут за собой
 * половину Medusa.
 *
 * Проверять есть что: pp_system_default регистрируется в Medusa безусловно, а
 * его authorizePayment отвечает «авторизовано», не сходив никуда. Заказ на
 * такой сессии оформляется бесплатно.
 */
export const ALLOWED_PAYMENT_PROVIDERS = ["pp_monobank_monobank"]

export const isAllowedProvider = (providerId: unknown) =>
	typeof providerId === "string" && ALLOWED_PAYMENT_PROVIDERS.includes(providerId)

/** Статусы, на которых Medusa соглашается завершить корзину. */
const PROCESSABLE = ["pending", "requires_more", "authorized", "captured", "pending_authorization"]

/** Копейки: сравнивать суммы как дробные числа нельзя. */
const minor = (value: unknown) => Math.round(Number(value ?? 0) * 100)

export type PaymentSessionLike = {
	id?: string
	provider_id?: unknown
	status?: string
	amount?: unknown
	currency_code?: string
}

export type CartLike = {
	total?: unknown
	currency_code?: string
	payment_collection?: { payment_sessions?: PaymentSessionLike[] } | null
}

/**
 * Бросает, если корзину нельзя оплачивать так, как она сейчас выглядит.
 *
 * Medusa по собственной документации не сверяет оплаченную сумму с суммой
 * корзины: она полагается на то, что сессия пересоздаётся при любом изменении.
 * Для инварианта «заказ равен оплате» одной этой механики мало.
 */
export const assertPayableCart = (cart: CartLike | undefined | null) => {
	const sessions = cart?.payment_collection?.payment_sessions ?? []

	if (!sessions.length) {
		throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Немає платіжної сесії для замовлення")
	}

	const foreign = sessions.find((session) => !isAllowedProvider(session.provider_id))

	if (foreign) {
		throw new MedusaError(
			MedusaError.Types.NOT_ALLOWED,
			`Оплата провайдером ${String(foreign.provider_id ?? "(не вказано)")} недоступна`,
		)
	}

	const total = minor(cart?.total)
	const currency = String(cart?.currency_code ?? "").toLowerCase()

	const mismatched = sessions
		.filter((session) => PROCESSABLE.includes(String(session.status ?? "")))
		.find(
			(session) =>
				minor(session.amount) !== total ||
				(session.currency_code ? session.currency_code.toLowerCase() !== currency : false),
		)

	if (mismatched) {
		throw new MedusaError(
			MedusaError.Types.NOT_ALLOWED,
			"Сума оплати не збігається з кошиком — оновіть замовлення",
		)
	}
}
