import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { assertPayableCart, type CartLike } from "../../lib/payment-guard"

/**
 * Последняя проверка перед созданием заказа.
 *
 * Тот же запрет, что и в middlewares.ts, но не привязанный к форме маршрута.
 * Там он стоит на POST /store/payment-collections/:id/payment-sessions — то
 * есть держится на том, что этот маршрут единственный, кто создаёт сессии.
 * Обновление Medusa, добавившее второй такой маршрут, молча вернуло бы
 * бесплатные заказы. Здесь же проверка стоит на пути, через который проходит
 * любое оформление, каким бы способом сессия ни появилась.
 */
completeCartWorkflow.hooks.validate(async ({ cart }) => {
	assertPayableCart(cart as CartLike)
})
