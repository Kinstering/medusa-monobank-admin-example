import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { AbstractPaymentProvider, BigNumber, MedusaError } from "@medusajs/framework/utils"
import { CURRENCY_CODES, type InvoiceState, type InvoiceStatus, MonobankClient } from "./client"
import { webhookResult } from "./webhook"

export type MonobankOptions = {
  token: string
  /** Публичный адрес бэкенда: из него собирается webHookUrl для банка. */
  backendUrl?: string
  /** Куда банк вернёт покупателя после оплаты. */
  redirectUrl?: string
  /** Время жизни счёта в секундах. По умолчанию сутки. */
  validity?: number
}

type SessionData = {
  invoiceId?: string
  pageUrl?: string
  amount?: number
  ccy?: number
}

/**
 * Монобанк Эквайринг как платёжный провайдер Medusa.
 *
 * Главный инвариант: заказ не должен появляться без денег. Поэтому
 * `authorizePayment` не возвращает `pending_authorization` — этот статус
 * разрешает Medusa завершить корзину и создать заказ со статусом «ожидает
 * оплаты». Здесь успех подтверждается только ответом банка (`success` или
 * `hold`), в остальных случаях метод бросает ошибку и корзина не завершается.
 */
export class MonobankPaymentService extends AbstractPaymentProvider<MonobankOptions> {
  static identifier = "monobank"

  #client: MonobankClient
  #options: MonobankOptions
  #logger: Logger

  static validateOptions(options: Record<string, unknown>) {
    if (!options.token) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Monobank: не задан token (MONOBANK_TOKEN)",
      )
    }
  }

  constructor(container: { logger: Logger }, options: MonobankOptions) {
    super(container, options)
    this.#options = options
    this.#logger = container.logger
    this.#client = new MonobankClient(options.token)
  }

  /** Копейки. Medusa отдаёт сумму в основных единицах. */
  #minorUnits(amount: unknown) {
    return Math.round(Number(amount) * 100)
  }

  #currency(code: string) {
    const ccy = CURRENCY_CODES[code.toLowerCase()]
    if (!ccy) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Monobank: валюта ${code} не поддерживается`,
      )
    }
    return ccy
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const amount = this.#minorUnits(input.amount)
    const ccy = this.#currency(input.currency_code)

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Monobank: сумма счёта должна быть больше нуля")
    }

    // Метка счёта — идентификатор платёжной сессии Medusa: она уже создана к
    // этому моменту и приходит в context.idempotency_key (payment-module.js:154).
    // Именно по этому значению вебхук потом находит сессию, поэтому терять его
    // нельзя; cart_id остаётся запасным вариантом.
    const reference = String(
      (input.context as Record<string, unknown> | undefined)?.idempotency_key ??
        (input.data as Record<string, unknown> | undefined)?.cart_id ??
        "",
    )

    const invoice = await this.#client.createInvoice({
      amount,
      ccy,
      reference,
      redirectUrl: this.#options.redirectUrl,
      webHookUrl: this.#options.backendUrl
        ? `${this.#options.backendUrl.replace(/\/$/, "")}/hooks/payment/monobank_monobank`
        : undefined,
      validity: this.#options.validity ?? 60 * 60 * 24,
    })

    this.#logger.info(`Monobank: счёт ${invoice.invoiceId} на ${amount} (${ccy}) создан`)

    return {
      id: invoice.invoiceId,
      // Публично доступно витрине — только идентификатор и ссылка на оплату.
      data: { invoiceId: invoice.invoiceId, pageUrl: invoice.pageUrl, amount, ccy },
    }
  }

  #invoiceId(data: unknown) {
    const invoiceId = (data as SessionData | undefined)?.invoiceId
    if (!invoiceId) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Monobank: в сессии нет invoiceId")
    }
    return invoiceId
  }

  #mapStatus(status: InvoiceStatus): GetPaymentStatusOutput["status"] {
    switch (status) {
      case "success":
        return "captured"
      case "hold":
        return "authorized"
      case "created":
      case "processing":
        return "pending"
      case "reversed":
        return "canceled"
      default:
        return "error"
    }
  }

  /**
   * Вызывается при завершении корзины. Возвращает успех только если банк
   * подтвердил деньги; иначе бросает — тогда Medusa не создаст заказ.
   */
  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const invoiceId = this.#invoiceId(input.data)
    const invoice = await this.#client.invoiceStatus(invoiceId)

    // Счёт создаётся здесь же, на сервере, но сверка суммы стоит дёшево и
    // ловит рассинхрон сессии и счёта, если корзину изменили после создания.
    const expected = (input.data as SessionData).amount
    if (typeof expected === "number" && invoice.amount !== expected) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Monobank: сумма счёта ${invoice.amount} не совпадает с ожидаемой ${expected}`,
      )
    }

    if (invoice.status === "success" || invoice.status === "hold") {
      return {
        status: this.#mapStatus(invoice.status),
        data: { ...(input.data as SessionData), ...invoice },
      }
    }

    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Monobank: счёт ${invoiceId} не оплачен (статус ${invoice.status}${
        invoice.failureReason ? `: ${invoice.failureReason}` : ""
      })`,
    )
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const invoice = await this.#client.invoiceStatus(this.#invoiceId(input.data))
    return { status: this.#mapStatus(invoice.status), data: { ...invoice } }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const invoiceId = this.#invoiceId(input.data)
    const invoice = await this.#client.invoiceStatus(invoiceId)

    // Обычный счёт списывается сразу — списывать нечего. Доснять нужно только холд.
    if (invoice.status === "hold") {
      await this.#client.finalizeInvoice(invoiceId, invoice.amount)
      return { data: { ...(input.data as SessionData), status: "success" } }
    }

    if (invoice.status !== "success") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Monobank: счёт ${invoiceId} нельзя списать (статус ${invoice.status})`,
      )
    }

    return { data: { ...(input.data as SessionData), ...invoice } }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const invoiceId = this.#invoiceId(input.data)
    const amount = this.#minorUnits(input.amount)

    // Без этой проверки частичный возврат тихо становится полным: Medusa может
    // передать сумму объектом BigNumber, Number() даст NaN, а cancelInvoice
    // выбрасывает пустую сумму из тела запроса — и банк отменяет счёт целиком.
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Monobank: сумма возврата должна быть больше нуля (получено ${String(input.amount)})`,
      )
    }

    await this.#client.cancelInvoice(invoiceId, amount)
    return { data: { ...(input.data as SessionData) } }
  }

  /**
   * Кричать, когда деньги остались у банка, а сессия под ними исчезла.
   *
   * Medusa удаляет платёжную сессию при любом изменении суммы корзины. Если к
   * этому моменту счёт уже оплачен, снять его нельзя — и покупатель остаётся
   * без заказа, а деньги списаны. Раньше это была одна строка warn в логах,
   * то есть о таком случае никто не узнавал.
   */
  async #alertOrphanedPayment(invoiceId: string, reason: unknown) {
    const invoice = await this.#client.invoiceStatus(invoiceId).catch(() => null)

    if (!invoice || (invoice.status !== "success" && invoice.status !== "hold")) {
      this.#logger.warn(`Monobank: счёт ${invoiceId} не снят: ${reason}`)
      return
    }

    const amount = (invoice.amount / 100).toFixed(2)
    this.#logger.error(
      `Monobank: счёт ${invoiceId} ОПЛАЧЕН (${amount}), но сессия удалена — заказа не будет`,
    )

    // Сюда стоит подключить живое оповещение (Telegram, e-mail, Slack):
    // такой случай требует ручного действия — оформить заказ или вернуть деньги.
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const invoiceId = this.#invoiceId(input.data)
    try {
      await this.#client.removeInvoice(invoiceId)
    } catch (error) {
      // Оплаченный счёт снять нельзя — это возврат, а не отмена.
      await this.#alertOrphanedPayment(invoiceId, error)
    }
    return { data: { ...(input.data as SessionData) } }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return this.cancelPayment(input as CancelPaymentInput)
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    const invoice = await this.#client.invoiceStatus(this.#invoiceId(input.data))
    return { data: { ...invoice } }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // У Монобанка счёт неизменяем: сумму меняют, снимая старый и выставляя новый.
    const previous = input.data as SessionData
    if (previous?.invoiceId) {
      await this.cancelPayment({ data: previous } as CancelPaymentInput)
    }
    return this.initiatePayment(input as unknown as InitiatePaymentInput)
  }

  /**
   * Идентификатор платёжной сессии Medusa по счёту банка.
   *
   * Обычно приходит прямо в теле вебхука, но если банк его не прислал —
   * доспрашиваем статус счёта. Потерять это значение означает потерять оплату:
   * заказ не создастся, а деньги останутся списанными.
   */
  async #sessionId(invoice: InvoiceState) {
    const fromBody = invoice.reference?.trim()
    if (fromBody) {
      return fromBody
    }
    const status = await this.#client.invoiceStatus(invoice.invoiceId).catch(() => null)
    return status?.reference?.trim() ?? ""
  }

  /**
   * Адрес вебхука публичный, поэтому доверять телу запроса без подписи нельзя:
   * иначе оплату подделывает любой, кто знает URL. Подпись проверяется по
   * сырым байтам открытым ключом банка; не сошлась — событие игнорируется.
   */
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"],
  ): Promise<WebhookActionResult> {
    const signature =
      (payload.headers?.["x-sign"] as string | undefined) ??
      (payload.headers?.["X-Sign"] as string | undefined) ??
      ""

    const rawBody = payload.rawData as Buffer | string
    const valid = await this.#client.verifySignature(rawBody, signature)

    if (!valid) {
      this.#logger.warn("Monobank: вебхук с неверной подписью отклонён")
      return { action: "not_supported" }
    }

    const invoice = payload.data as unknown as InvoiceState

    // Medusa ищет сессию по СВОЕМУ идентификатору (process-payment.js:49), а не
    // по номеру счёта банка. Вернуть сюда invoiceId — значит не найти ничего:
    // воркфлоу падает, заказ не создаётся, а деньги уже списаны.
    const sessionId = await this.#sessionId(invoice)

    if (!sessionId) {
      this.#logger.error(
        `Monobank: у счёта ${invoice.invoiceId} нет reference — сессию Medusa не найти, оплата потеряна`,
      )
      return { action: "not_supported" }
    }

    if (!sessionId.startsWith("payses_")) {
      this.#logger.warn(`Monobank: reference счёта ${invoice.invoiceId} не похож на сессию: ${sessionId}`)
    }

    // Тело вебхука подписано, но сумму всё равно берём из ответа банка по
    // статусу счёта: так источник истины один, а не два.
    return webhookResult(invoice.status, sessionId, invoice.amount)
  }
}
