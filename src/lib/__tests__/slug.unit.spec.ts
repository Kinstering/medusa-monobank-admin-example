import { toHandle, uniqueHandle } from "../slug"

describe("toHandle", () => {
  it.each([
    ["Футболка для йоги / XL", "futbolka-dlia-iohy-xl"],
    ["Накладка на деку", "nakladka-na-deku"],
    ["Сумка під'їзд 3 л", "sumka-pidizd-3-l"],
    ["Ґанок Єнот Їжак", "ganok-ienot-izhak"],
    ["  ---  ", ""],
  ])("%s → %s", (title, handle) => {
    expect(toHandle(title)).toBe(handle)
  })

  it("keeps handles short", () => {
    expect(toHandle("дуже ".repeat(40)).length).toBeLessThanOrEqual(80)
  })
})

describe("uniqueHandle", () => {
  it("appends the first free number", () => {
    expect(uniqueHandle("futbolka", new Set())).toBe("futbolka")
    expect(uniqueHandle("futbolka", new Set(["futbolka", "futbolka-2"]))).toBe("futbolka-3")
    expect(uniqueHandle("", new Set())).toBe("tovar")
  })
})
