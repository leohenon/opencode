import type { Accessor } from "solid-js"
import type { createVimState } from "./vim-state"
import type { TextareaRenderable } from "@opentui/core"
import { vimScroll, type VimScroll } from "./vim-scroll"
import { vimJump, type VimJump } from "./vim-motion-jump"
import {
  appendAfterCursor,
  appendLineEnd,
  clearSelection,
  deleteLine,
  deleteSelection,
  deleteUnderCursor,
  deleteWord,
  findChar,
  findCharInLine,
  firstNonWhitespace,
  insertLineStart,
  joinLines,
  moveBigWordEnd,
  moveBigWordNext,
  moveBigWordPrev,
  moveFirstNonWhitespace,
  moveLeft,
  moveLineBeginning,
  moveLineDown,
  moveLineUp,
  moveRight,
  moveLineEnd,
  moveWordEnd,
  moveWordNext,
  moveWordPrev,
  nextWordStart,
  openLineAbove,
  openLineBelow,
  pasteAfter,
  pasteBefore,
  prevWordStart,
  replaceUnderCursor,
  substituteLine,
  syncSelection,
  wordEnd,
  yankLine,
  yankLineSpan,
  yankSelection,
  yankWord,
  yankWordSpan,
} from "./vim-motions"

export type VimEvent = {
  name?: string
  shift?: boolean
  ctrl?: boolean
  meta?: boolean
  super?: boolean
  preventDefault: () => void
}

export type VimCopyMove = "up" | "down" | "left" | "right"

export function createVimHandler(input: {
  enabled: Accessor<boolean>
  state: ReturnType<typeof createVimState>
  textarea: Accessor<TextareaRenderable>
  submit: () => void
  scroll: (action: VimScroll) => void
  jump: (action: VimJump) => void
  copy?: (action: VimCopyMove) => void
  copyVisual?: (mode: "char" | "line") => void
  copyExitVisual?: () => void
  copyYank?: () => void
  copyCopy?: () => void
  copyIsVisual?: () => boolean
  copyJump?: (action: VimJump) => void
  copyWordNext?: (big: boolean) => boolean
  copyText?: () => string
  copyCol?: () => number
  setCopyCol?: (offset: number) => void
  autocomplete?: () => false | "@" | "/"
  flash?: (span: { start: number; end: number }) => void
}) {
  function hasModifier(event: VimEvent) {
    return !!event.ctrl || !!event.meta || !!event.super
  }

  function isPrintable(event: VimEvent) {
    return !!event.name && (event.name.length === 1 || event.name === "space")
  }

  function value(event: VimEvent) {
    if (event.name === "space") return " "
    return event.name ?? ""
  }

  function isShifted(event: VimEvent, key: string) {
    return event.name === key.toUpperCase() || (event.name === key && !!event.shift)
  }

  function dispatch(event: VimEvent, key: string): boolean {
    const scroll = vimScroll(event)
    if (scroll) {
      input.state.clearPending()
      input.scroll(scroll)
      event.preventDefault()
      return true
    }

    const jump = vimJump(event, input.state)
    if (jump.handled) {
      if (jump.action) {
        input.state.clearPending()
        input.jump(jump.action)
      }
      event.preventDefault()
      return true
    }

    if (key === "escape") {
      if (input.state.isVisual()) {
        clearSelection(input.textarea())
        input.state.setMode("normal")
        event.preventDefault()
        return true
      }
      if (!input.state.pending()) return false
      input.state.clearPending()
      event.preventDefault()
      return true
    }

    if (input.state.isVisual()) {
      const a = input.state.anchor()
      const lw = input.state.isVisualLine()

      if ((key === "i" || key === "a" || key === "o") && !event.shift && !hasModifier(event)) {
        event.preventDefault()
        return true
      }

      if ((isShifted(event, "i") || isShifted(event, "a") || isShifted(event, "o")) && !hasModifier(event)) {
        event.preventDefault()
        return true
      }

      if ((key === "d" || key === "x") && !hasModifier(event)) {
        const reg = deleteSelection(input.textarea(), lw, a ?? undefined)
        if (reg) input.state.setRegister(reg)
        clearSelection(input.textarea())
        input.state.setMode("normal")
        event.preventDefault()
        return true
      }

      if (key === "y" && !event.shift && !hasModifier(event)) {
        const reg = yankSelection(input.textarea(), lw, a ?? undefined)
        if (reg) input.state.setRegister(reg)
        clearSelection(input.textarea())
        input.state.setMode("normal")
        event.preventDefault()
        return true
      }

      if (key === "c" && !event.shift && !hasModifier(event)) {
        const reg = deleteSelection(input.textarea(), lw, a ?? undefined)
        if (reg) input.state.setRegister(reg)
        clearSelection(input.textarea())
        input.state.setMode("insert")
        event.preventDefault()
        return true
      }

      if (key === "p" && !event.shift && !hasModifier(event)) {
        const reg = input.state.register()
        if (reg) {
          deleteSelection(input.textarea(), false, a ?? undefined)
          clearSelection(input.textarea())
          input.textarea().insertText(reg.text)
          input.textarea().cursorOffset = input.textarea().cursorOffset - 1
        }
        input.state.setMode("normal")
        event.preventDefault()
        return true
      }

      if (key === "v" && !event.shift && !hasModifier(event)) {
        if (lw) {
          input.state.setMode("visual")
          event.preventDefault()
          return true
        }
        clearSelection(input.textarea())
        input.state.setMode("normal")
        event.preventDefault()
        return true
      }

      if (isShifted(event, "v") && !hasModifier(event)) {
        if (lw) {
          clearSelection(input.textarea())
          input.state.setMode("normal")
          event.preventDefault()
          return true
        }
        input.state.setMode("visual-line")
        event.preventDefault()
        return true
      }
    }

    if (input.state.pending() === "c") {
      if (key === "c" && !event.shift && !hasModifier(event)) {
        const reg = substituteLine(input.textarea())
        if (reg) input.state.setRegister(reg)
        input.state.clearPending()
        input.state.setMode("insert")
        event.preventDefault()
        return true
      }

      if (key === "w" && !event.shift && !hasModifier(event)) {
        const reg = deleteWord(input.textarea())
        if (reg) input.state.setRegister(reg)
        input.state.clearPending()
        input.state.setMode("insert")
        event.preventDefault()
        return true
      }

      if (hasModifier(event)) {
        input.state.clearPending()
        return false
      }

      input.state.clearPending()
    }

    if (input.state.pending() === "d") {
      if (key === "d" && !event.shift && !hasModifier(event)) {
        const reg = deleteLine(input.textarea())
        if (reg) input.state.setRegister(reg)
        input.state.clearPending()
        event.preventDefault()
        return true
      }

      if (key === "w" && !event.shift && !hasModifier(event)) {
        const reg = deleteWord(input.textarea())
        if (reg) input.state.setRegister(reg)
        input.state.clearPending()
        event.preventDefault()
        return true
      }

      if (hasModifier(event)) {
        input.state.clearPending()
        return false
      }

      input.state.clearPending()
    }

    if (input.state.pending() === "y") {
      if (key === "y" && !event.shift && !hasModifier(event)) {
        const span = yankLineSpan(input.textarea())
        const reg = yankLine(input.textarea())
        if (reg) input.state.setRegister(reg)
        if (span.end > span.start) input.flash?.(span)
        input.state.clearPending()
        event.preventDefault()
        return true
      }

      if (key === "w" && !event.shift && !hasModifier(event)) {
        const span = yankWordSpan(input.textarea())
        const reg = yankWord(input.textarea())
        if (reg) input.state.setRegister(reg)
        if (span && span.end > span.start) input.flash?.(span)
        input.state.clearPending()
        event.preventDefault()
        return true
      }

      if (hasModifier(event)) {
        input.state.clearPending()
        return false
      }

      input.state.clearPending()
    }

    const find = input.state.pending()
    if (find === "f" || find === "F" || find === "t" || find === "T") {
      if (isPrintable(event) && !hasModifier(event)) {
        const forward = find === "f" || find === "t"
        const till = find === "t" || find === "T"
        findChar(input.textarea(), key, forward, till)
        input.state.setLastFind({ char: key, forward, till })
        input.state.clearPending()
        event.preventDefault()
        return true
      }
      input.state.clearPending()
      event.preventDefault()
      return true
    }

    if (key === "return" && !hasModifier(event)) {
      input.submit()
      input.state.clearPending()
      event.preventDefault()
      return true
    }

    if ((key === "/" || key === "@") && !hasModifier(event)) {
      if (input.autocomplete?.() && input.textarea().cursorOffset === 0 && input.textarea().plainText.length === 0) {
        input.state.setMode("insert")
        return false
      }
      event.preventDefault()
      return true
    }

    if (key === "c" && !event.shift && !hasModifier(event)) {
      input.state.setPending("c")
      event.preventDefault()
      return true
    }

    if (key === "d" && !event.shift && !hasModifier(event)) {
      input.state.setPending("d")
      event.preventDefault()
      return true
    }

    if (key === "y" && !event.shift && !hasModifier(event)) {
      input.state.setPending("y")
      event.preventDefault()
      return true
    }

    if (key === "p" && !event.shift && !hasModifier(event)) {
      pasteAfter(input.textarea(), input.state.register())
      event.preventDefault()
      return true
    }

    if (isShifted(event, "p") && !hasModifier(event)) {
      pasteBefore(input.textarea(), input.state.register())
      event.preventDefault()
      return true
    }

    if (key === "f" && !event.shift && !hasModifier(event)) {
      input.state.setPending("f")
      event.preventDefault()
      return true
    }

    if (isShifted(event, "f") && !hasModifier(event)) {
      input.state.setPending("F")
      event.preventDefault()
      return true
    }

    if (key === "t" && !event.shift && !hasModifier(event)) {
      input.state.setPending("t")
      event.preventDefault()
      return true
    }

    if (isShifted(event, "t") && !hasModifier(event)) {
      input.state.setPending("T")
      event.preventDefault()
      return true
    }

    if (key === ";" && !event.shift && !hasModifier(event)) {
      const last = input.state.lastFind()
      if (last) findChar(input.textarea(), last.char, last.forward, last.till, true)
      event.preventDefault()
      return true
    }

    if (key === "," && !event.shift && !hasModifier(event)) {
      const last = input.state.lastFind()
      if (last) findChar(input.textarea(), last.char, !last.forward, last.till, true)
      event.preventDefault()
      return true
    }

    if (isShifted(event, "s") && !hasModifier(event)) {
      input.state.clearPending()
      const reg = substituteLine(input.textarea())
      if (reg) input.state.setRegister(reg)
      input.state.setMode("insert")
      event.preventDefault()
      return true
    }

    if (isShifted(event, "r") && !hasModifier(event)) {
      input.state.setReplace(input.textarea().cursorOffset)
      input.state.setTyped(false)
      input.state.setMode("replace")
      event.preventDefault()
      return true
    }

    if (key === "v" && !event.shift && !hasModifier(event)) {
      input.state.setAnchor(input.textarea().cursorOffset)
      input.state.setMode("visual")
      syncSelection(input.textarea(), input.textarea().cursorOffset)
      event.preventDefault()
      return true
    }

    if (isShifted(event, "v") && !hasModifier(event)) {
      input.state.setAnchor(input.textarea().cursorOffset)
      input.state.setMode("visual-line")
      syncSelection(input.textarea(), input.textarea().cursorOffset, true)
      event.preventDefault()
      return true
    }

    if (key === "i" && !event.shift && !hasModifier(event)) {
      input.state.setMode("insert")
      event.preventDefault()
      return true
    }

    if (isShifted(event, "i") && !hasModifier(event)) {
      insertLineStart(input.textarea())
      input.state.setMode("insert")
      event.preventDefault()
      return true
    }

    if (key === "a" && !event.shift && !hasModifier(event)) {
      appendAfterCursor(input.textarea())
      input.state.setMode("insert")
      event.preventDefault()
      return true
    }

    if (isShifted(event, "a") && !hasModifier(event)) {
      appendLineEnd(input.textarea())
      input.state.setMode("insert")
      event.preventDefault()
      return true
    }

    if (key === "o" && !event.shift && !hasModifier(event)) {
      openLineBelow(input.textarea())
      input.state.setMode("insert")
      event.preventDefault()
      return true
    }

    if (isShifted(event, "o") && !hasModifier(event)) {
      openLineAbove(input.textarea())
      input.state.setMode("insert")
      event.preventDefault()
      return true
    }

    if (key === "h" && !event.shift && !hasModifier(event)) {
      moveLeft(input.textarea())
      event.preventDefault()
      return true
    }

    if (key === "l" && !event.shift && !hasModifier(event)) {
      moveRight(input.textarea())
      event.preventDefault()
      return true
    }

    if (isShifted(event, "j") && !hasModifier(event)) {
      input.state.clearPending()
      joinLines(input.textarea())
      event.preventDefault()
      return true
    }

    if (key === "j" && !event.shift && !hasModifier(event)) {
      moveLineDown(input.textarea())
      event.preventDefault()
      return true
    }

    if (key === "k" && !event.shift && !hasModifier(event)) {
      moveLineUp(input.textarea())
      event.preventDefault()
      return true
    }

    if (key === "0" && !event.shift && !hasModifier(event)) {
      moveLineBeginning(input.textarea())
      event.preventDefault()
      return true
    }

    if ((key === "^" || key === "_") && !hasModifier(event)) {
      moveFirstNonWhitespace(input.textarea())
      event.preventDefault()
      return true
    }

    if (key === "$" && !hasModifier(event)) {
      moveLineEnd(input.textarea())
      event.preventDefault()
      return true
    }

    if (key === "x" && !event.shift && !hasModifier(event)) {
      const reg = deleteUnderCursor(input.textarea())
      if (reg) input.state.setRegister(reg)
      event.preventDefault()
      return true
    }

    if (key === "w" && !event.shift && !hasModifier(event)) {
      moveWordNext(input.textarea())
      event.preventDefault()
      return true
    }

    if (key === "b" && !event.shift && !hasModifier(event)) {
      moveWordPrev(input.textarea())
      event.preventDefault()
      return true
    }

    if (key === "e" && !event.shift && !hasModifier(event)) {
      moveWordEnd(input.textarea())
      event.preventDefault()
      return true
    }

    if (isShifted(event, "w") && !hasModifier(event)) {
      moveBigWordNext(input.textarea())
      event.preventDefault()
      return true
    }

    if (isShifted(event, "b") && !hasModifier(event)) {
      moveBigWordPrev(input.textarea())
      event.preventDefault()
      return true
    }

    if (isShifted(event, "e") && !hasModifier(event)) {
      moveBigWordEnd(input.textarea())
      event.preventDefault()
      return true
    }

    if (key === "backspace" || key === "delete") {
      event.preventDefault()
      return true
    }

    if (isPrintable(event) && !hasModifier(event)) {
      event.preventDefault()
      return true
    }

    return false
  }

  function copyMotion(offset: number) {
    input.setCopyCol?.(offset)
  }

  function copy(event: VimEvent, key: string): boolean {
    if (key === "q") {
      input.state.setMode("normal")
      event.preventDefault()
      return true
    }

    if (key === "escape") {
      if (input.copyIsVisual?.()) {
        input.copyExitVisual?.()
        event.preventDefault()
        return true
      }
      input.state.setMode("normal")
      event.preventDefault()
      return true
    }

    const scroll = vimScroll(event)
    if (scroll) {
      input.scroll(scroll)
      event.preventDefault()
      return true
    }

    const jump = vimJump(event, input.state)
    if (jump.handled) {
      if (jump.action) input.copyJump ? input.copyJump(jump.action) : input.jump(jump.action)
      event.preventDefault()
      return true
    }

    if (hasModifier(event)) return false

    if (isShifted(event, "v")) {
      input.copyVisual?.("line")
      event.preventDefault()
      return true
    }

    if (key === "v" && !event.shift) {
      input.copyVisual?.("char")
      event.preventDefault()
      return true
    }

    if (key === "y") {
      input.copyYank?.()
      input.state.setMode("normal")
      event.preventDefault()
      return true
    }

    if (key === "return") {
      input.copyCopy?.()
      input.state.setMode("normal")
      event.preventDefault()
      return true
    }

    // pending find-char
    const pending = input.state.pending()
    if (pending === "f" || pending === "F" || pending === "t" || pending === "T") {
      if (key.length === 1) {
        const forward = pending === "f" || pending === "t"
        const till = pending === "t" || pending === "T"
        const text = input.copyText?.() ?? ""
        const pos = input.copyCol?.() ?? 0
        const col = findCharInLine(text, pos, key, forward, till)
        input.state.setLastFind({ char: key, forward, till })
        input.state.clearPending()
        copyMotion(col)
        event.preventDefault()
        return true
      }
      input.state.clearPending()
      event.preventDefault()
      return true
    }

    if (key === "j") {
      input.copy?.("down")
      event.preventDefault()
      return true
    }

    if (key === "k") {
      input.copy?.("up")
      event.preventDefault()
      return true
    }

    if (key === "h") {
      input.copy?.("left")
      event.preventDefault()
      return true
    }

    if (key === "l") {
      input.copy?.("right")
      event.preventDefault()
      return true
    }

    // line motions
    if (key === "0") {
      copyMotion(0)
      event.preventDefault()
      return true
    }

    if (key === "^" || key === "_") {
      const text = input.copyText?.() ?? ""
      copyMotion(firstNonWhitespace(text, 0))
      event.preventDefault()
      return true
    }

    if (key === "$") {
      const text = input.copyText?.() ?? ""
      copyMotion(Math.max(0, text.length - 1))
      event.preventDefault()
      return true
    }

    // word motions
    const pos = input.copyCol?.() ?? 0

    if (key === "w" && !event.shift) {
      if (input.copyWordNext?.(false)) {
        event.preventDefault()
        return true
      }
      const text = input.copyText?.() ?? ""
      const col = nextWordStart(text, pos, false)
      copyMotion(Math.min(col, Math.max(0, text.length - 1)))
      event.preventDefault()
      return true
    }

    if (key === "b" && !event.shift) {
      const text = input.copyText?.() ?? ""
      copyMotion(prevWordStart(text, pos, false))
      event.preventDefault()
      return true
    }

    if (key === "e" && !event.shift) {
      const text = input.copyText?.() ?? ""
      copyMotion(wordEnd(text, pos, false))
      event.preventDefault()
      return true
    }

    if (isShifted(event, "w")) {
      if (input.copyWordNext?.(true)) {
        event.preventDefault()
        return true
      }
      const text = input.copyText?.() ?? ""
      const col = nextWordStart(text, pos, true)
      copyMotion(Math.min(col, Math.max(0, text.length - 1)))
      event.preventDefault()
      return true
    }

    if (isShifted(event, "b")) {
      const text = input.copyText?.() ?? ""
      copyMotion(prevWordStart(text, pos, true))
      event.preventDefault()
      return true
    }

    if (isShifted(event, "e")) {
      const text = input.copyText?.() ?? ""
      copyMotion(wordEnd(text, pos, true))
      event.preventDefault()
      return true
    }

    // find-char pending
    if ((key === "f" || key === "t") && !event.shift) {
      input.state.setPending(key)
      event.preventDefault()
      return true
    }

    if (isShifted(event, "f")) {
      input.state.setPending("F")
      event.preventDefault()
      return true
    }

    if (isShifted(event, "t")) {
      input.state.setPending("T")
      event.preventDefault()
      return true
    }

    // repeat find
    if (key === ";") {
      const last = input.state.lastFind()
      if (last) {
        const text = input.copyText?.() ?? ""
        copyMotion(findCharInLine(text, pos, last.char, last.forward, last.till, true))
      }
      event.preventDefault()
      return true
    }

    if (key === ",") {
      const last = input.state.lastFind()
      if (last) {
        const text = input.copyText?.() ?? ""
        copyMotion(findCharInLine(text, pos, last.char, !last.forward, last.till, true))
      }
      event.preventDefault()
      return true
    }

    if (isPrintable(event)) {
      event.preventDefault()
      return true
    }

    return false
  }

  return {
    handleKey(event: VimEvent) {
      if (!input.enabled()) return false

      if (input.state.isReplace()) {
        if (event.name === "escape") {
          const start = input.state.replace()
          const typed = input.state.typed()
          input.state.setMode("normal")
          if (typed && start !== null) {
            input.textarea().cursorOffset = Math.max(start, input.textarea().cursorOffset - 1)
          }
          event.preventDefault()
          return true
        }

        if (isPrintable(event) && !hasModifier(event)) {
          replaceUnderCursor(input.textarea(), value(event))
          input.state.setTyped(true)
          event.preventDefault()
          return true
        }

        return false
      }

      if (input.state.isCopy()) {
        return copy(event, event.name ?? "")
      }

      if (input.state.isInsert()) {
        if (event.name !== "escape") return false
        input.state.setMode("normal")
        event.preventDefault()
        return true
      }

      const key = event.name ?? ""
      const result = dispatch(event, key)

      if (result && input.state.isVisual()) {
        const a = input.state.anchor()
        if (a !== null) syncSelection(input.textarea(), a, input.state.isVisualLine())
      }

      return result
    },
  }
}
