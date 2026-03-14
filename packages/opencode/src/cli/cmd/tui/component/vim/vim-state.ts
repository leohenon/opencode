import { createEffect, createMemo, createSignal, type Accessor } from "solid-js"

export type VimMode = "normal" | "insert"
export type VimPending = "" | "c" | "d" | "g" | "f" | "F" | "t" | "T" | "y"
export type VimFind = { char: string; forward: boolean; till: boolean } | null
export type VimRegister = { text: string; linewise: boolean } | null

export function createVimState(input: { enabled: Accessor<boolean>; initial?: Accessor<VimMode | undefined> }) {
  const [mode, setMode] = createSignal<VimMode>(input.initial?.() ?? "insert")
  const [pending, setPending] = createSignal<VimPending>("")
  const [lastFind, setLastFind] = createSignal<VimFind>(null)
  const [register, setRegister] = createSignal<VimRegister>(null)

  function clearPending() {
    if (pending()) setPending("")
  }

  function changeMode(next: VimMode) {
    clearPending()
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
    reset() {
      clearPending()
      setMode("insert")
    },
    isInsert: createMemo(() => mode() === "insert"),
  }
}
