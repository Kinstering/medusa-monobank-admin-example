import { BigNumber } from "@medusajs/framework/utils"
import type { WebhookActionResult } from "@medusajs/types"
import type { InvoiceStatus } from "./client"

/**
 * Событие банка -> действие Medusa.
 *
 * Вынесено из сервиса, чтобы это можно было проверить тестом: сам сервис в
 * конструкторе поднимает HTTP-клиент банка.
 *
 * Ключевая деталь — session_id. Medusa ищет платёжную сессию по СВОЕМУ
 * идентификатору (process-payment.js:49), а не по номеру счёта банка. Вернуть
 * сюда invoiceId — значит не найти ничего: воркфлоу падает, заказ не
 * создаётся, а деньги уже списаны. Именно так и было до аудита.
 */
export const webhookResult = (
	status: InvoiceStatus,
	sessionId: string,
	amountMinorUnits: number,
): WebhookActionResult => {
	const data = { session_id: sessionId, amount: new BigNumber(amountMinorUnits / 100) }

	switch (status) {
		case "success":
			return { action: "captured", data }
		case "hold":
			return { action: "authorized", data }
		case "failure":
		case "expired":
			return { action: "failed", data }
		default:
			return { action: "not_supported" }
	}
}
