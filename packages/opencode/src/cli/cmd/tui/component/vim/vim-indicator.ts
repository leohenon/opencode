import { createMemo, type Accessor } from "solid-js"
import type { createVimState } from "./vim-state"

export function useVimIndicator(input: {
  enabled: Accessor<boolean>
  active: Accessor<boolean>
  state: ReturnType<typeof createVimState>
  copyVisual?: Accessor<undefined | "char" | "line">
}) {
  return createMemo(() => {
    if (!input.enabled() || !input.active()) return
    const key = input.state.pending()
    if (key) return key + ".."
    if (input.state.isCopy()) {
      if (input.copyVisual?.() === "char") return "V-COPY"
      if (input.copyVisual?.() === "line") return "VL-COPY"
      return "COPY"
    }
    if (input.state.isInsert()) return "INSERT"
    if (input.state.isReplace()) return "REPLACE"
    if (input.state.isVisualLine()) return "V-LINE"
    if (input.state.isVisual()) return "VISUAL"
    return undefined
  })
}
