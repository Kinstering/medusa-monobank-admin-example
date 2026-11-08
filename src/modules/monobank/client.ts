import crypto from "node:crypto"

const API = "https://api.monobank.ua/api/merchant"

/** Монобанк принимает и возвращает суммы в копейках, валюту — числовым кодом ISO 4217. */
export const CURRENCY_CODES: Record<string, number> = {
  uah: 980,
  usd: 840,
  eur: 978,
}

export type InvoiceStatus =
  | "created"
  | "processing"
  | "hold"
  | "success"
  | "failure"
  | "reversed"
  | "expired"

export type InvoiceState = {
  invoiceId: string
  status: InvoiceStatus
  amount: number
  ccy: number
  failureReason?: string
  errCode?: string
  reference?: string
}

export type CreateInvoiceInput = {
  amount: number
  ccy: number
  reference: string
  destination?: string
  redirectUrl?: string
  webHookUrl?: string
  validity?: number
}

export class MonobankClient {
  #token: string
  /** Ключ меняется редко; тянуть его на каждый вебхук — лишний round-trip к банку. */
  #pubKey?: crypto.KeyObject

  constructor(token: string) {
    this.#token = token
  }

  async #call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "X-Token": this.#token,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      // Зависший банк не должен держать соединение до дефолтных пяти минут.
      signal: AbortSignal.timeout(15000),
    })

    const text = await response.text()

    if (!response.ok) {
      // Тело ошибки Монобанка — {errCode, errText}; оно нужно в логах целиком.
      throw new Error(`Monobank ${path} ответил ${response.status}: ${text.slice(0, 300)}`)
    }

    return JSON.parse(text) as T
  }

  createInvoice(input: CreateInvoiceInput) {
    return this.#call<{ invoiceId: string; pageUrl: string }>("/invoice/create", {
      method: "POST",
      body: input,
    })
  }

  invoiceStatus(invoiceId: string) {
    return this.#call<InvoiceState>(`/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`)
  }

  /** Отмена уже списанного платежа — возврат средств. Сумма в копейках. */
  cancelInvoice(invoiceId: string, amount?: number) {
    return this.#call<{ status: string; createdDate?: string }>("/invoice/cancel", {
      method: "POST",
      body: { invoiceId, ...(amount ? { amount } : {}) },
    })
  }

  /** Снятие неоплаченного счёта: работает только пока деньги не списаны. */
  removeInvoice(invoiceId: string) {
    return this.#call<Record<string, never>>("/invoice/remove", {
      method: "POST",
      body: { invoiceId },
    })
  }

  /** Списание ранее захолдированной суммы. */
  finalizeInvoice(invoiceId: string, amount: number) {
    return this.#call<{ status: string }>("/invoice/finalize", {
      method: "POST",
      body: { invoiceId, amount },
    })
  }

  async #publicKey(refresh = false) {
    if (!this.#pubKey || refresh) {
      const { key } = await this.#call<{ key: string }>("/pubkey")
      this.#pubKey = crypto.createPublicKey(Buffer.from(key, "base64").toString("utf8"))
    }
    return this.#pubKey
  }

  #verifyWith(key: crypto.KeyObject, rawBody: Buffer | string, signatureBase64: string) {
    return crypto
      .createVerify("SHA256")
      .update(typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody)
      .verify(key, Buffer.from(signatureBase64, "base64"))
  }

  /**
   * Вебхук — единственный канал, по которому банк сам сообщает об оплате, и
   * его адрес публичный. Без проверки подписи любой желающий объявляет свой
   * заказ оплаченным, поэтому подпись обязательна, а ошибка проверки — отказ.
   *
   * Подписывается СЫРОЕ тело запроса: повторная сериализация разобранного JSON
   * меняет байты и ломает проверку.
   */
  async verifySignature(rawBody: Buffer | string, signatureBase64: string) {
    if (!signatureBase64) {
      return false
    }

    try {
      if (this.#verifyWith(await this.#publicKey(), rawBody, signatureBase64)) {
        return true
      }

      // Ключ кэшируется на всё время жизни процесса, поэтому его ротация на
      // стороне банка иначе отклоняла бы все вебхуки до перезапуска
      // контейнера — и в логах это неотличимо от атаки. Перечитываем ключ
      // один раз и пробуем ещё; отказ остаётся отказом.
      return this.#verifyWith(await this.#publicKey(true), rawBody, signatureBase64)
    } catch {
      return false
    }
  }
}
