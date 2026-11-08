/**
 * Ukrainian (and Russian) titles to URL handles: "Худі оверсайз" →
 * "khudi-oversaiz". Latin handles survive every link shortener and
 * messenger preview, which Cyrillic ones (percent-encoded) do not.
 */
const MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  є: "ie",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  ї: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  ю: "iu",
  я: "ia",
  ы: "y",
  э: "e",
  ё: "io",
  ъ: "",
}

const MAX_LENGTH = 80

export function toHandle(title: string): string {
  const latin = [...title.toLowerCase()].map((char) => MAP[char] ?? char).join("")
  return latin
    .replace(/['’ʼ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, "")
}

/** First free handle: "futbolka", then "futbolka-2", "futbolka-3"… */
export function uniqueHandle(base: string, taken: Set<string>): string {
  const root = base || "tovar"
  if (!taken.has(root)) {
    return root
  }
  let n = 2
  while (taken.has(`${root}-${n}`)) {
    n++
  }
  return `${root}-${n}`
}
