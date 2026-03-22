import { createEffect, createMemo, createSignal, type Accessor } from "solid-js"

export type VimMode = "normal" | "insert" | "replace" | "visual" | "visual-line"
export type VimPending = "" | "c" | "d" | "g" | "f" | "F" | "t" | "T" | "y"
export type VimFind = { char: string; forward: boolean; till: boolean } | null
export type VimRegister = { text: string; linewise: boolean } | null

export function createVimState(input: { enabled: Accessor<boolean>; initial?: Accessor<VimMode | undefined> }) {
  const [mode, setMode] = createSignal<VimMode>(input.initial?.() ?? "insert")
  const [pending, setPending] = createSignal<VimPending>("")
  const [lastFind, setLastFind] = createSignal<VimFind>(null)
  const [register, setRegister] = createSignal<VimRegister>(null)
  const [anchor, setAnchor] = createSignal<number | null>(null)
  const [replace, setReplace] = createSignal<number | null>(null)
  const [typed, setTyped] = createSignal(false)

  function clearPending() {
    if (pending()) setPending("")
  }

  function changeMode(next: VimMode) {
    clearPending()
    if (next !== "visual" && next !== "visual-line") setAnchor(null)
    if (next !== "replace") {
      setReplace(null)
      setTyped(false)
    }
    setMode(next)
  }

  createEffect(() => {
    const enabled = input.enabled()

    if (!enabled) {
      if (mode() !== "insert") setMode("insert")
      clearPending()
      return
    }
  })

  return {
    mode,
    setMode: changeMode,
    pending,
    setPending,
    clearPending,
    lastFind,
    setLastFind,
    register,
    setRegister,
    anchor,
    setAnchor,
    replace,
    setReplace,
    typed,
    setTyped,
    reset() {
      clearPending()
      setAnchor(null)
      setReplace(null)
      setTyped(false)
      setMode("insert")
    },
    isInsert: createMemo(() => mode() === "insert"),
    isReplace: createMemo(() => mode() === "replace"),
    isVisual: createMemo(() => mode() === "visual" || mode() === "visual-line"),
    isVisualLine: createMemo(() => mode() === "visual-line"),
  }
}
