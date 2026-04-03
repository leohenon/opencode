import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { useVimIndicator } from "../../../src/cli/cmd/tui/component/vim/vim-indicator"
import { createVimState, type VimMode, type VimPending } from "../../../src/cli/cmd/tui/component/vim/vim-state"

function label(opts?: {
  enabled?: boolean
  active?: boolean
  mode?: VimMode
  pending?: VimPending
  copy?: undefined | "char" | "line"
}) {
  return createRoot((dispose) => {
    const [enabled] = createSignal(opts?.enabled ?? true)
    const [active] = createSignal(opts?.active ?? true)
    const [copy] = createSignal(opts?.copy)
    const state = createVimState({
      enabled,
      initial: () => opts?.mode ?? "normal",
    })

    if (opts?.mode && opts.mode !== "normal") state.setMode(opts.mode)
    if (opts?.pending) state.setPending(opts.pending)

    const result = useVimIndicator({
      enabled,
      active,
      state,
      copyVisual: copy,
    })()

    dispose()
    return result
  })
}

describe("vim indicator", () => {
  test("shows pending key as an unfinished command", () => {
    expect(label({ pending: "d" })).toBe("d..")
    expect(label({ pending: "y" })).toBe("y..")
  })

  test("pending key takes priority over copy label", () => {
    expect(label({ mode: "copy", pending: "z" })).toBe("z..")
  })

  test("shows copy label when no key is pending", () => {
    expect(label({ mode: "copy" })).toBe("COPY")
  })
})
