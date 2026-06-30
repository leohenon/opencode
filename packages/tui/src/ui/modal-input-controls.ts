import type { KeyEvent } from "@opentui/core"
import {
  createSingleLineVimMotions,
  isSingleLineVimPrintableKey,
  singleLineVimKeyName,
  type SingleLineVimKeyEvent,
} from "./single-line-vim-motions"

export type ModalInputMode = "insert" | "normal"

export type ModalInputKeyEvent = SingleLineVimKeyEvent

export function createModalInputControls(input: {
  mode: () => ModalInputMode
  setMode: (mode: ModalInputMode) => void
  move: (direction: 1 | -1) => void
  moveToStart: () => void
  moveToEnd: () => void
  focus: () => void
  text: () => string
  cursor: () => number
  setCursor: (offset: number) => void
  setText: (text: string) => void
}) {
  let pending = ""
  const motions = createSingleLineVimMotions({
    text: input.text,
    cursor: input.cursor,
    setCursor: input.setCursor,
    setText: input.setText,
    enterInsert: () => input.setMode("insert"),
    focus: input.focus,
  })

  return {
    handleKey(event: ModalInputKeyEvent) {
      if (hasModifier(event)) {
        pending = ""
        motions.handleKey(event)
        return false
      }
      const key = keyName(event)
      if (input.mode() === "insert") {
        if (key !== "escape") return false
        pending = ""
        input.setMode("normal")
        event.preventDefault()
        return true
      }

      if (key === "escape") return false
      if (key === "i" || key === "a" || key === "/") {
        pending = ""
        motions.clearPending()
        input.setMode("insert")
        input.focus()
        event.preventDefault()
        return true
      }
      if (motions.handleKey(event)) {
        pending = ""
        return true
      }
      if (key === "j") {
        pending = ""
        input.move(1)
        event.preventDefault()
        return true
      }
      if (key === "k") {
        pending = ""
        input.move(-1)
        event.preventDefault()
        return true
      }
      if (key === "G") {
        pending = ""
        input.moveToEnd()
        event.preventDefault()
        return true
      }
      if (key === "g") {
        if (pending === "g") {
          pending = ""
          input.moveToStart()
          event.preventDefault()
          return true
        }
        pending = "g"
        event.preventDefault()
        return true
      }

      pending = ""
      if (isSingleLineVimPrintableKey(key) || key === "backspace" || key === "delete") {
        event.preventDefault()
        return true
      }
      return false
    },
  }
}

function hasModifier(event: KeyEvent) {
  return !!event.ctrl || !!event.meta || !!event.super
}

function keyName(event: KeyEvent) {
  if (event.name === "escape") return "escape"
  if (event.shift && event.name === "g") return "G"
  return singleLineVimKeyName(event)
}
