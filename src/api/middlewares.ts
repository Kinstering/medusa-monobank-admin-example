import {
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { clientIp, rateLimit } from "../lib/rate-limit"
import { isAllowedProvider } from "../lib/payment-guard"
import { MAX_UPLOAD_BYTES } from "../../medusa-config"

/**
 * Medusa не сверяет provider_id при создании платёжной сессии со списком,
 * включённым для региона: GET /store/payment-providers отдаёт только monobank,
 * но POST .../payment-sessions принимает любой идентификатор. Список и разбор
 * лежат в lib/payment-guard, потому что та же проверка стоит вторым слоем в
 * хуке completeCartWorkflow (src/workflows/hooks/validate-cart-completion.ts).
 */
export const restrictPaymentProvider = (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const body = (req.body ?? {}) as { provider_id?: unknown }
  const providerId = typeof body.provider_id === "string" ? body.provider_id : ""

  if (!isAllowedProvider(providerId)) {
    res.status(400).json({
      type: "invalid_data",
      message: `Платёжный провайдер ${providerId || "(не указан)"} недоступен`,
    })
    return
  }

  next()
}

/**
 * Ограничение попыток входа.
 *
 * /auth/* открыт наружу и не требует даже публичного ключа, поэтому лимит на
 * витрине ничего не значит: подбирать пароль можно прямо здесь. Сюда же
 * приходит восстановление пароля, которое без ограничения превращается в
 * рассылку писем с вашего домена по любому известному адресу.
 *
 * Ключей два, и это важно. Адрес почты ловит подбор одного аккаунта откуда
 * угодно; адрес клиента ловит перебор адресов из одной точки. По отдельности
 * каждый обходится, вместе — нет.
 */
const AUTH_LIMIT_WINDOW = 15 * 60 * 1000
const AUTH_LIMIT_PER_ACCOUNT = 10
const AUTH_LIMIT_PER_IP = 40

const throttleAuth = (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  const body = (req.body ?? {}) as { email?: unknown }
  // Длину задаёт клиент, поэтому режем до предела почтового адреса по RFC.
  const email = (typeof body.email === "string" ? body.email : "").toLowerCase().slice(0, 254)
  const ip = clientIp(req.headers as Record<string, unknown>)

  const checks = [
    email ? { key: `auth:email:${email}`, limit: AUTH_LIMIT_PER_ACCOUNT } : null,
    ip ? { key: `auth:ip:${ip}`, limit: AUTH_LIMIT_PER_IP } : null,
  ].filter((check): check is { key: string; limit: number } => check !== null)

  const blocked = checks
    .map((check) => rateLimit({ ...check, windowMs: AUTH_LIMIT_WINDOW }))
    .find((result) => !result.allowed)

  if (blocked) {
    res.setHeader("Retry-After", String(blocked.retryAfter))
    res.status(429).json({
      type: "too_many_requests",
      message: "Забагато спроб. Спробуйте пізніше.",
    })
    return
  }

  next()
}

/**
 * Потолок на размер загрузки.
 *
 * Medusa держит загружаемый файл в памяти (multer memoryStorage), а
 * maxUploadFileSize в конфиге — настройка только для дашборда: API принимает
 * что угодно. Заголовок проверяется до разбора тела, поэтому гигантский запрос
 * отваливается, не успев занять память.
 */
const limitUploadSize = (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  const declared = Number(req.headers["content-length"] ?? 0)

  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    res.status(413).json({
      type: "invalid_data",
      message: `Файл завеликий: максимум ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ`,
    })
    return
  }

  next()
}

/**
 * Заголовки безопасности. Без защиты от встраивания в фрейм форму входа в
 * админку можно накрыть чужой страницей, а без HSTS первый запрос уходит по http.
 *
 * Оговорка: /app и /static монтируются ДО роутера API, поэтому сюда попадают
 * только маршруты API. Полностью закрыть админку можно лишь прокси перед
 * сервисом (например, Cloudflare).
 */
const securityHeaders = (_req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'")
  res.setHeader("Strict-Transport-Security", "max-age=63072000")
  res.removeHeader("X-Powered-By")
  next()
}

export default defineMiddlewares({
  routes: [
    { matcher: "/*", middlewares: [securityHeaders] },
    // Все методы: у Medusa POST /auth/:actor/:provider просто зовёт GET-обработчик,
    // поэтому ограничивать только POST бессмысленно.
    { matcher: "/auth/*", middlewares: [throttleAuth] },
    { matcher: "/admin/uploads", methods: ["POST"], middlewares: [limitUploadSize] },
    {
      matcher: "/store/payment-collections/:id/payment-sessions",
      methods: ["POST"],
      middlewares: [restrictPaymentProvider],
    },
  ],
})
