/**
 * Calls the admin API from a widget. The dashboard is served by the same
 * backend and signs in with a session cookie, so a same-origin fetch that sends
 * cookies is authenticated exactly like the dashboard's own requests.
 */
export async function adminFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof data?.message === "string" ? data.message : `Помилка ${response.status}`)
  }
  return data as T
}
