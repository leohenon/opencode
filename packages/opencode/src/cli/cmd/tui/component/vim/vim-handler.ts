import type { Accessor } from "solid-js"
import type { createVimState, VimRegister, VimSnapshot } from "./vim-state"
import type { TextareaRenderable } from "@opentui/core"
import { vimScroll, type VimScroll } from "./vim-scroll"
import { vimJump, type VimJump } from "./vim-motion-jump"
import { vimWindowNavigation, type VimWindowNavigation } from "./vim-motion-window-navigation"
import { createVimRepeat } from "./vim-repeat"
import {
  appendAfterCursor,
  appendLineEnd,
  clearSelection,
  deleteLine,
  deleteLineEnd,
  deleteSelection,
  deleteSpan,
  deleteUnderCursor,
  findChar,
  findCharInLine,
  findCharTargetInLine,
  firstNonWhitespace,
  firstNonWhitespaceOperation,
  getLineColumn,
  insertLineStart,
  joinLines,
  lineBeginningOperation,
  lineEndOperation,
  matchingBracketOperation,
  matchingBracketTarget,
  moveBigWordEnd,
  moveBigWordNext,
  moveBigWordPrev,
  moveFirstNonWhitespace,
  moveLeft,
  moveLineBeginning,
  moveLineDown,
  moveLineUp,
  moveMatchingBracket,
  moveNextParagraph,
  movePreviousParagraph,
  moveRight,
  moveLineEnd,
  moveWordEnd,
  moveWordNext,
  moveWordPrev,
  nextParagraphOperation,
  nextWordStart,
  openLineAbove,
  openLineBelow,
  type VimOperator,
  type VimOperatorResult,
  type VimSpan,
  type VimWantedColumn,
  pasteAfter,
  pasteBefore,
  previousParagraphOperation,
  bracketTextObjectOperation,
  quoteTextObjectOperation,
  prevWordStart,
  replaceUnderCursor,
  replaceSelection,
  substituteLine,
  substituteLineEnd,
  syncSelection,
  toggleVisualEnd,
  toggleCase,
  toggleSelectionCase,
  wordEnd,
  wordTextObjectOperation,
  yankLine,
  yankLineSpan,
  yankSelection,
} from "./vim-motions"

export type VimEvent = {
  name?: string
  shift?: boolean
  ctrl?: boolean
  meta?: boolean
  super?: boolean
  sequence?: string
  raw?: string
  preventDefault: () => void
}

export type VimCopyMove = "up" | "down" | "left" | "right"
type VimFindOperator = "f" | "F" | "t" | "T"
type VimSearchDirection = "forward" | "backward"
type VimTextObjectScope = "inner" | "around"

type VimKeyLike = { name?: string; shift?: boolean; sequence?: string; raw?: string }

export function vimLangmapKeyName(event: VimKeyLike) {
  return vimEventText(event) ?? normalizedKeyName(event)
}

function vimEventText(event: VimKeyLike) {
  return event.sequence?.length === 1 ? event.sequence : event.raw?.length === 1 ? event.raw : undefined
}

function normalizedKeyName(event: VimKeyLike) {
  if (event.name === "backspace" || event.sequence === "\b" || event.sequence === "\x7f" || event.raw === "\b" || event.raw === "\x7f") return "backspace"
  if (event.name === "slash") return event.shift ? "?" : "/"
  if (event.name === "at") return "@"
  if (event.name === "quote") return '"'
  if (event.name === "apostrophe") return "'"
  if (event.name === "backtick") return "`"
  const text = vimEventText(event)
  if (text && (text === "/" || text === "?" || text === "@" || text === '"' || text === "'" || text === "`" || "()[]{}<>".includes(text))) return text
  if (event.shift) {
    if (event.name === "9") return "("
    if (event.name === "0") return ")"
    if (event.name === "[") return "{"
    if (event.name === "]") return "}"
    if (event.name === ",") return "<"
    if (event.name === ".") return ">"
  }
  return event.name ?? ""
}

export function createVimHandler(input: {
  enabled: Accessor<boolean>
  state: ReturnType<typeof createVimState>
  textarea: Accessor<TextareaRenderable>
  submit: () => void
  scroll: (action: VimScroll) => void
  jump: (action: VimJump) => void
  navigate?: (action: VimWindowNavigation) => void
  copy?: (action: VimCopyMove) => void
  copyVisual?: (mode: "char" | "line") => void
  copyExitVisual?: () => void
  copyExit?: (scrollToBottom?: boolean) => void
  copyExitPreserveScroll?: () => void
  copyFocusInput?: () => void
  copyYank?: () => void
  copyYankLine?: () => void
  copyYankMatchingBracket?: () => boolean
  copyToggleVisualEnd?: () => void
  copyCopy?: () => void
  copyIsVisual?: () => boolean
  copyJump?: (action: VimJump) => void
  copyWordNext?: (big: boolean) => boolean
  copyWordPrev?: (big: boolean) => boolean
  copyWordEnd?: (big: boolean) => boolean
  copyMatchingBracket?: () => boolean
  copyNextParagraph?: () => boolean
  copyPreviousParagraph?: () => boolean
  copySearchStart?: (direction: VimSearchDirection) => void
  copySearchAppend?: (value: string) => boolean
  copySearchBackspace?: () => boolean
  copySearchSubmit?: () => boolean
  copySearchCancel?: () => void
  copySearchClear?: () => boolean
  copySearchActive?: () => boolean
  copySearchHighlighted?: () => boolean
  copySearchNext?: () => boolean
  copySearchPrevious?: () => boolean
  copyText?: () => string
  copyCol?: () => number
  setCopyCol?: (offset: number) => void
  setCopyStick?: (stick: "start" | "first" | "end") => void
  copyScroll?: (action: "center" | "top" | "bottom") => void
  autocomplete?: () => false | "@" | "/"
  flash?: (span: { start: number; end: number }) => void
  history?: () => boolean
  snapshot?: () => VimSnapshot
  snapshotDataEqual?: (before: unknown, after: unknown) => boolean
  restore?: (next: VimSnapshot) => void
  register?: () => VimRegister
  setRegister?: (register: VimRegister, notify?: boolean) => void
  langmap?: Accessor<Record<string, string> | undefined>
}) {
  let wantedColumn: VimWantedColumn | undefined
  let pendingOperatorFind: { operation: VimOperator; find: VimFindOperator } | undefined
  let pendingTextObject: { operation: VimOperator; scope: VimTextObjectScope } | undefined

  function hasModifier(event: VimEvent) {
    return !!event.ctrl || !!event.meta || !!event.super
  }

  function isPrintable(event: VimEvent) {
    const key = normalizedKeyName(event)
    return key.length === 1 || key === "space"
  }

  function value(event: VimEvent) {
    const key = normalizedKeyName(event)
    if (key === "space") return " "
    if (event.shift && key.length === 1 && /[a-z]/.test(key)) return key.toUpperCase()
    return key
  }

  function replaceValue(event: VimEvent, visual = false) {
    if (event.name === "return") return visual ? "\r" : "\n"
    if (isPrintable(event)) return value(event)
    return null
  }

  function langmapped(event: VimEvent) {
    if (hasModifier(event)) return event
    if (["r", "vr", "f", "F", "t", "T"].includes(input.state.pending())) return event
    const key = vimLangmapKeyName(event)
    if (key.length !== 1) return event
    const langmap = input.langmap?.()
    const mapped = langmap?.[key] ?? (event.shift ? langmap?.[key.toLowerCase()]?.toUpperCase() : undefined)
    if (!mapped || mapped.length !== 1) return event
    return {
      ...event,
      name: mapped,
      sequence: mapped,
      raw: mapped,
      shift: /[A-Z]/.test(mapped),
      preventDefault: () => event.preventDefault(),
    }
  }

  function isShifted(event: VimEvent, key: string) {
    return event.name === key.toUpperCase() || (event.name === key && !!event.shift)
  }

  function tracked() {
    return input.history?.() ?? true
  }

  function register() {
    if (input.register) return input.register()
    return input.state.register()
  }

  function setRegister(next: VimRegister, notify = false) {
    if (input.setRegister) {
      input.setRegister(next, notify)
      return
    }
    input.state.setRegister(next)
  }

  function clearWantedColumn() {
    wantedColumn = undefined
  }

  function moveVertical(direction: "up" | "down") {
    const column = wantedColumn ?? getLineColumn(input.textarea())
    if (direction === "up") moveLineUp(input.textarea(), column)
    else moveLineDown(input.textarea(), column)
    wantedColumn = column
  }

  function preservesWantedColumn(event: VimEvent, key: string) {
    if ((key === "j" || key === "k" || key === "down" || key === "up") && !event.shift && !hasModifier(event))
      return true
    return (key === "v" || isShifted(event, "v")) && !hasModifier(event)
  }

  function snapshot(): VimSnapshot {
    if (input.snapshot) return input.snapshot()
    return {
      text: input.textarea().plainText,
      cursor: input.textarea().cursorOffset,
    }
  }

  function restore(next: VimSnapshot) {
    clearWantedColumn()
    clearSelection(input.textarea())
    input.state.clearPending()
    input.state.setMode("normal")
    input.state.cancelEdit()
    if (input.restore) {
      input.restore(next)
      return
    }
    input.textarea().setText(next.text)
    input.textarea().cursorOffset = Math.max(0, Math.min(next.cursor, next.text.length))
  }

  const repeat = createVimRepeat({
    state: input.state,
    textarea: input.textarea,
    snapshot,
    snapshotDataEqual: input.snapshotDataEqual,
    tracked,
  })
  const edit = repeat.edit
  const begin = repeat.begin

  function applyOperatorYank(result: VimOperatorResult) {
    if (result.register) setRegister(result.register, true)
    if (result.span && result.span.end > result.span.start) input.flash?.(result.span)
    input.state.clearPending()
  }

  function applyOperatorEdit(result: () => VimOperatorResult, operation: "d" | "c") {
    const apply = () => {
      const next = result()
      if (!next.span && !next.register) {
        input.state.clearPending()
        return false
      }
      if (next.span && next.span.end > next.span.start) deleteSpan(input.textarea(), next.span)
      if (next.span && next.span.end === next.span.start) input.textarea().cursorOffset = next.span.start
      if (next.register) setRegister(next.register)
      input.state.clearPending()
      if (operation === "c") input.state.setMode("insert")
      return true
    }
    if (operation === "c") begin(apply)
    else edit(apply)
  }

  function applyOperatorResult(result: () => VimOperatorResult, operation: VimOperator) {
    const initial = result()

    // no motion: vim no-ops the operator without editing or changing mode.
    if (!initial.span && !initial.register) {
      input.state.clearPending()
      return
    }
    if (operation === "y") {
      applyOperatorYank(initial)
      return
    }
    applyOperatorEdit(result, operation)
  }

  function paragraphOperator(key: string, operation: VimOperator): boolean {
    if (key !== "{" && key !== "}") return false

    applyOperatorResult(
      () =>
        key === "}"
          ? nextParagraphOperation(input.textarea(), operation)
          : previousParagraphOperation(input.textarea(), operation),
      operation,
    )

    return true
  }

  function matchingBracketOperator(key: string, operation: VimOperator): boolean {
    if (key !== "%") return false

    applyOperatorResult(() => matchingBracketOperation(input.textarea()), operation)

    return true
  }

  function charwiseOperation(span: VimSpan | null): VimOperatorResult {
    if (!span) return { span: null, register: null }
    return { span, register: { text: input.textarea().plainText.slice(span.start, span.end), linewise: false } }
  }

  function nextWordOperation(big: boolean) {
    const textarea = input.textarea()
    const start = textarea.cursorOffset
    const end = nextWordStart(textarea.plainText, start, big)
    return charwiseOperation(end > start ? { start, end } : null)
  }

  function previousWordOperation() {
    const textarea = input.textarea()
    const end = textarea.cursorOffset
    const start = prevWordStart(textarea.plainText, end, false)
    return charwiseOperation(start < end ? { start, end } : null)
  }

  function wordEndOperation(big: boolean) {
    const textarea = input.textarea()
    const start = textarea.cursorOffset
    if (start >= textarea.plainText.length) return charwiseOperation(null)
    const end = wordEnd(textarea.plainText, start, big) + 1
    return charwiseOperation(end > start ? { start, end } : null)
  }

  function changeWordOperation(big: boolean) {
    const textarea = input.textarea()
    const char = textarea.plainText[textarea.cursorOffset]
    return char && !/\s/.test(char) ? wordEndOperation(big) : nextWordOperation(big)
  }

  function wordOperator(event: VimEvent, key: string, operation: VimOperator): boolean {
    if ((key === "w" || isShifted(event, "w")) && !hasModifier(event)) {
      const big = isShifted(event, "w")
      applyOperatorResult(() => (operation === "c" ? changeWordOperation(big) : nextWordOperation(big)), operation)
      return true
    }
    if (key === "b" && !event.shift && !hasModifier(event) && operation !== "y") {
      applyOperatorResult(() => previousWordOperation(), operation)
      return true
    }
    if ((key === "e" || isShifted(event, "e")) && !hasModifier(event)) {
      applyOperatorResult(() => wordEndOperation(isShifted(event, "e")), operation)
      return true
    }
    return false
  }

  function lineBoundaryMotion(event: VimEvent, key: string, operation: VimOperator): boolean {
    if (key === "$" && !hasModifier(event)) {
      applyOperatorResult(() => lineEndOperation(input.textarea()), operation)
      return true
    }
    if (key === "0" && !event.shift && !hasModifier(event)) {
      applyOperatorResult(() => lineBeginningOperation(input.textarea()), operation)
      return true
    }
    if (key === "^" && !hasModifier(event)) {
      applyOperatorResult(() => firstNonWhitespaceOperation(input.textarea()), operation)
      return true
    }
    return false
  }

  function findOperation(char: string, forward: boolean, till: boolean) {
    const textarea = input.textarea()
    const start = textarea.cursorOffset
    const lineStart = textarea.plainText.lastIndexOf("\n", start - 1) + 1
    const lineEnd = textarea.plainText.indexOf("\n", start)
    const target = findCharTargetInLine(
      textarea.plainText.slice(lineStart, lineEnd === -1 ? textarea.plainText.length : lineEnd),
      start - lineStart,
      char,
      forward,
    )
    if (target === null) return charwiseOperation(null)

    const offset = lineStart + target
    if (forward) {
      const spanEnd = till ? offset : offset + 1
      return charwiseOperation(spanEnd > start ? { start, end: spanEnd } : null)
    }

    const spanStart = till ? offset + 1 : offset
    return charwiseOperation(spanStart < start ? { start: spanStart, end: start } : null)
  }

  function startOperatorFind(event: VimEvent, operation: VimOperator, find: VimFindOperator) {
    pendingOperatorFind = { operation, find }
    input.state.setPending(find, operation + find)
    event.preventDefault()
    return true
  }

  function operatorFind(event: VimEvent, key: string, operation: VimOperator) {
    if (key === "f" && !event.shift && !hasModifier(event)) return startOperatorFind(event, operation, "f")
    if (isShifted(event, "f") && !hasModifier(event)) return startOperatorFind(event, operation, "F")
    if (key === "t" && !event.shift && !hasModifier(event)) return startOperatorFind(event, operation, "t")
    if (isShifted(event, "t") && !hasModifier(event)) return startOperatorFind(event, operation, "T")
    return false
  }

  function startTextObject(event: VimEvent, operation: VimOperator, scope: VimTextObjectScope) {
    pendingTextObject = { operation, scope }
    input.state.setPending(operation, operation + (scope === "around" ? "a" : "i"))
    event.preventDefault()
    return true
  }

  function operatorTextObject(event: VimEvent, key: string, operation: VimOperator) {
    if (key === "i" && !event.shift && !hasModifier(event)) return startTextObject(event, operation, "inner")
    if (key === "a" && !event.shift && !hasModifier(event)) return startTextObject(event, operation, "around")
    return false
  }

  function resolveTextObject(event: VimEvent, key: string, scope: VimTextObjectScope, operation: VimOperator) {
    if ((key === "w" || isShifted(event, "w")) && !hasModifier(event)) {
      const big = isShifted(event, "w")
      return () => wordTextObjectOperation(input.textarea(), scope === "around", big)
    }
    if ((key === '"' || key === "'" || key === "`") && !hasModifier(event)) {
      return () => quoteTextObjectOperation(input.textarea(), scope === "around", key)
    }
    if ("()[]{}<>".includes(key) && !hasModifier(event)) {
      return () => bracketTextObjectOperation(input.textarea(), scope === "around", key, operation)
    }
  }

  function pendingTextObjectOperator(event: VimEvent, key: string): boolean {
    if (!pendingTextObject) return false
    if (input.state.pending() !== pendingTextObject.operation) {
      pendingTextObject = undefined
      return false
    }

    const textObject = pendingTextObject
    const operation = resolveTextObject(event, key, textObject.scope, textObject.operation)
    pendingTextObject = undefined
    if (operation) {
      applyOperatorResult(operation, textObject.operation)
      event.preventDefault()
      return true
    }

    input.state.clearPending()
    event.preventDefault()
    return true
  }

  function pendingFindOperator(event: VimEvent): boolean {
    if (!pendingOperatorFind) return false
    if (input.state.pending() !== pendingOperatorFind.find) {
      pendingOperatorFind = undefined
      return false
    }
    if (isPrintable(event) && !hasModifier(event)) {
      const forward = pendingOperatorFind.find === "f" || pendingOperatorFind.find === "t"
      const till = pendingOperatorFind.find === "t" || pendingOperatorFind.find === "T"
      const char = value(event)
      const operation = pendingOperatorFind.operation
      pendingOperatorFind = undefined
      applyOperatorResult(() => findOperation(char, forward, till), operation)
      input.state.setLastFind({ char, forward, till })
      event.preventDefault()
      return true
    }
    pendingOperatorFind = undefined
    input.state.clearPending()
    event.preventDefault()
    return true
  }

  function undo() {
    if (!tracked()) return false
    const next = input.state.undo(snapshot())
    if (!next) return false
    restore(next)
    return true
  }

  function redo() {
    if (!tracked()) return false
    const next = input.state.redo(snapshot())
    if (!next) return false
    restore(next)
    return true
  }

  function dispatch(event: VimEvent, key: string): boolean {
    if (!preservesWantedColumn(event, key)) clearWantedColumn()

    if (input.state.pending() === "r") {
      if (hasModifier(event)) {
        input.state.clearPending()
        return false
      }

      const next = replaceValue(event)
      if (next !== null) {
        edit(() => {
          const offset = input.textarea().cursorOffset
          if (deleteUnderCursor(input.textarea())) {
            input.textarea().cursorOffset = offset
            input.textarea().insertText(next)
            input.textarea().cursorOffset = next === "\n" ? offset + 1 : offset
            input.state.clearPending()
            return true
          }
          input.state.clearPending()
        })
        event.preventDefault()
        return true
      }

      input.state.clearPending()
      event.preventDefault()
      return true
    }

    if (pendingFindOperator(event)) return true
    if (pendingTextObjectOperator(event, key)) return true

    if (input.state.pending() === "vr" && input.state.isVisual()) {
      if (hasModifier(event)) {
        input.state.clearPending()
        return false
      }

      const next = replaceValue(event, true)
      if (next !== null) {
        edit(() => {
          replaceSelection(input.textarea(), next, input.state.isVisualLine(), input.state.anchor() ?? undefined)
          clearSelection(input.textarea())
          input.state.clearPending()
          input.state.setMode("normal")
        })
        event.preventDefault()
        return true
      }

      input.state.clearPending()
      event.preventDefault()
      return true
    }

    const find = input.state.pending()
    if (find === "f" || find === "F" || find === "t" || find === "T") {
      if (isPrintable(event) && !hasModifier(event)) {
        const forward = find === "f" || find === "t"
        const till = find === "t" || find === "T"
        const char = value(event)
        findChar(input.textarea(), char, forward, till)
        input.state.setLastFind({ char, forward, till })
        input.state.clearPending()
        event.preventDefault()
        return true
      }
      input.state.clearPending()
      event.preventDefault()
      return true
    }

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

    const navigation = vimWindowNavigation(event, input.state)
    if (navigation.handled) {
      if (navigation.action) {
        input.state.clearPending()
        input.navigate?.(navigation.action)
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

    if (key === "." && !event.shift && !hasModifier(event) && !input.state.isVisual() && !input.state.pending()) {
      const repeat = input.state.repeat()
      if (repeat) repeat.run()
      event.preventDefault()
      return true
    }

    if (key === "u" && !event.shift && !hasModifier(event) && !input.state.isVisual() && !input.state.pending()) {
      undo()
      event.preventDefault()
      return true
    }

    if (
      key === "r" &&
      !!event.ctrl &&
      !event.shift &&
      !event.meta &&
      !event.super &&
      !input.state.isVisual() &&
      !input.state.pending()
    ) {
      redo()
      event.preventDefault()
      return true
    }

    if (input.state.isVisual()) {
      const a = input.state.anchor()
      const lw = input.state.isVisualLine()

      if (key === "~" && !hasModifier(event)) {
        edit(() => {
          toggleSelectionCase(input.textarea(), lw, a ?? undefined)
          clearSelection(input.textarea())
          input.state.setMode("normal")
        })
        event.preventDefault()
        return true
      }

      if (key === "r" && !event.shift && !hasModifier(event)) {
        input.state.setPending("vr")
        event.preventDefault()
        return true
      }

      if ((key === "i" || key === "a") && !event.shift && !hasModifier(event)) {
        event.preventDefault()
        return true
      }

      if (key === "o" && !event.shift && !hasModifier(event)) {
        const cursor = input.textarea().cursorOffset
        const anchor = input.state.anchor()

        if (anchor !== null) {
            input.textarea().cursorOffset = anchor
            input.state.setAnchor(cursor)
          toggleVisualEnd(input.textarea(), cursor, input.state.isVisualLine())
        }
        event.preventDefault()
        return true
      }

      if ((isShifted(event, "i") || isShifted(event, "a") || isShifted(event, "o")) && !hasModifier(event)) {
        event.preventDefault()
        return true
      }

      if ((key === "d" || key === "x") && !event.shift && !hasModifier(event)) {
        edit(() => {
          const reg = deleteSelection(input.textarea(), lw, a ?? undefined)
          if (reg) setRegister(reg)
          clearSelection(input.textarea())
          input.state.setMode("normal")
        })
        event.preventDefault()
        return true
      }

      if (isShifted(event, "d") && !hasModifier(event)) {
        edit(() => {
          const reg = deleteLine(input.textarea(), a ?? undefined)
          if (reg) setRegister(reg)
          clearSelection(input.textarea())
          input.state.setMode("normal")
        })
        event.preventDefault()
        return true
      }

      if (key === "y" && !event.shift && !hasModifier(event)) {
        const reg = yankSelection(input.textarea(), lw, a ?? undefined)
        if (reg) setRegister(reg, true)
        clearSelection(input.textarea())
        input.state.setMode("normal")
        event.preventDefault()
        return true
      }

      if (key === "c" && !event.shift && !hasModifier(event)) {
        begin(() => {
          const reg = deleteSelection(input.textarea(), lw, a ?? undefined)
          if (reg) setRegister(reg)
          clearSelection(input.textarea())
          input.state.setMode("insert")
        })
        event.preventDefault()
        return true
      }

      if (isShifted(event, "c") && !hasModifier(event)) {
        begin(() => {
          const reg = substituteLine(input.textarea(), a ?? undefined)
          if (reg) setRegister(reg)
          clearSelection(input.textarea())
          input.state.setMode("insert")
        })
        event.preventDefault()
        return true
      }

      if (key === "p" && !event.shift && !hasModifier(event)) {
        edit(() => {
          const reg = register()
          if (reg) {
            deleteSelection(input.textarea(), false, a ?? undefined)
            clearSelection(input.textarea())
            input.textarea().insertText(reg.text)
            input.textarea().cursorOffset = input.textarea().cursorOffset - 1
          }
          input.state.setMode("normal")
        })
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
      if (hasModifier(event)) {
        input.state.clearPending()
        return false
      }

      if (key === "c" && !event.shift) {
        begin(() => {
          const reg = substituteLine(input.textarea())
          if (reg) setRegister(reg)
          input.state.clearPending()
          input.state.setMode("insert")
        })
        event.preventDefault()
        return true
      }

      if (wordOperator(event, key, "c")) {
        event.preventDefault()
        return true
      }

      if (lineBoundaryMotion(event, key, "c")) {
        event.preventDefault()
        return true
      }

      if (operatorTextObject(event, key, "c")) return true

      if (paragraphOperator(key, "c")) {
        event.preventDefault()
        return true
      }

      if (matchingBracketOperator(key, "c")) {
        event.preventDefault()
        return true
      }

      if (operatorFind(event, key, "c")) return true

      pendingTextObject = undefined
      input.state.clearPending()
    }

    if (input.state.pending() === "d") {
      if (hasModifier(event)) {
        input.state.clearPending()
        return false
      }

      if (key === "d" && !event.shift) {
        edit(() => {
          const reg = deleteLine(input.textarea())
          if (reg) setRegister(reg)
          input.state.clearPending()
        })
        event.preventDefault()
        return true
      }

      if (wordOperator(event, key, "d")) {
        event.preventDefault()
        return true
      }

      if (lineBoundaryMotion(event, key, "d")) {
        event.preventDefault()
        return true
      }

      if (operatorTextObject(event, key, "d")) return true

      if (paragraphOperator(key, "d")) {
        event.preventDefault()
        return true
      }

      if (matchingBracketOperator(key, "d")) {
        event.preventDefault()
        return true
      }

      if (operatorFind(event, key, "d")) return true

      pendingTextObject = undefined
      input.state.clearPending()
    }

    if (input.state.pending() === "y") {
      if (hasModifier(event)) {
        input.state.clearPending()
        return false
      }

      if (key === "y" && !event.shift) {
        const span = yankLineSpan(input.textarea())
        const reg = yankLine(input.textarea())
        if (reg) setRegister(reg, true)
        if (span.end > span.start) input.flash?.(span)
        input.state.clearPending()
        event.preventDefault()
        return true
      }

      if (wordOperator(event, key, "y")) {
        event.preventDefault()
        return true
      }

      if (lineBoundaryMotion(event, key, "y")) {
        event.preventDefault()
        return true
      }

      if (operatorTextObject(event, key, "y")) return true

      if (paragraphOperator(key, "y")) {
        event.preventDefault()
        return true
      }

      if (matchingBracketOperator(key, "y")) {
        event.preventDefault()
        return true
      }

      pendingTextObject = undefined
      input.state.clearPending()
    }

    if (key === "return" && !hasModifier(event)) {
      input.submit()
      input.state.clearPending()
      event.preventDefault()
      return true
    }

    if ((key === "/" || key === "@") && !hasModifier(event)) {
      if (input.autocomplete && input.textarea().cursorOffset === 0 && input.textarea().plainText.length === 0) {
        input.state.setMode("insert")
        input.textarea().insertText(key)
        event.preventDefault()
        return true
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

    if (key === "r" && !event.shift && !hasModifier(event)) {
      input.state.setPending("r")
      event.preventDefault()
      return true
    }

    if (key === "p" && !event.shift && !hasModifier(event)) {
      const reg = register()
      edit(() => {
        pasteAfter(input.textarea(), reg)
      })
      event.preventDefault()
      return true
    }

    if (isShifted(event, "p") && !hasModifier(event)) {
      const reg = register()
      edit(() => {
        pasteBefore(input.textarea(), reg)
      })
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
      begin(() => {
        input.state.clearPending()
        const reg = substituteLine(input.textarea())
        if (reg) setRegister(reg)
        input.state.setMode("insert")
      })
      event.preventDefault()
      return true
    }

    if (isShifted(event, "d") && !hasModifier(event)) {
      edit(() => {
        const reg = deleteLineEnd(input.textarea())
        if (reg) setRegister(reg)
      })
      event.preventDefault()
      return true
    }

    if (isShifted(event, "c") && !hasModifier(event)) {
      begin(() => {
        const reg = substituteLineEnd(input.textarea())
        if (reg) setRegister(reg)
        input.state.setMode("insert")
      })
      event.preventDefault()
      return true
    }

    if (isShifted(event, "r") && !hasModifier(event)) {
      begin(
        () => {
          input.state.setReplace(input.textarea().cursorOffset)
          input.state.setTyped(false)
          input.state.setMode("replace")
        },
        { replace: true },
      )
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
      begin(() => {
        input.state.setMode("insert")
      })
      event.preventDefault()
      return true
    }

    if (isShifted(event, "i") && !hasModifier(event)) {
      begin(() => {
        insertLineStart(input.textarea())
        input.state.setMode("insert")
      })
      event.preventDefault()
      return true
    }

    if (key === "a" && !event.shift && !hasModifier(event)) {
      begin(() => {
        appendAfterCursor(input.textarea())
        input.state.setMode("insert")
      })
      event.preventDefault()
      return true
    }

    if (isShifted(event, "a") && !hasModifier(event)) {
      begin(() => {
        appendLineEnd(input.textarea())
        input.state.setMode("insert")
      })
      event.preventDefault()
      return true
    }

    if (key === "o" && !event.shift && !hasModifier(event)) {
      begin(() => {
        openLineBelow(input.textarea())
        input.state.setMode("insert")
      })
      event.preventDefault()
      return true
    }

    if (isShifted(event, "o") && !hasModifier(event)) {
      begin(() => {
        openLineAbove(input.textarea())
        input.state.setMode("insert")
      })
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
      edit(() => {
        input.state.clearPending()
        joinLines(input.textarea())
      })
      event.preventDefault()
      return true
    }

    if ((key === "j" || key === "down") && !event.shift && !hasModifier(event)) {
      moveVertical("down")
      event.preventDefault()
      return true
    }

    if (isShifted(event, "h") && !hasModifier(event)) {
      input.jump("high")
      event.preventDefault()
      return true
    }

    if (isShifted(event, "m") && !hasModifier(event)) {
      input.jump("middle")
      event.preventDefault()
      return true
    }

    if (isShifted(event, "l") && !hasModifier(event)) {
      input.jump("low")
      event.preventDefault()
      return true
    }

    if ((key === "k" || key === "up") && !event.shift && !hasModifier(event)) {
      moveVertical("up")
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
      wantedColumn = "end"
      event.preventDefault()
      return true
    }

    if (key === "%" && !hasModifier(event)) {
      moveMatchingBracket(input.textarea())
      event.preventDefault()
      return true
    }

    if (key === "{" && !hasModifier(event)) {
      movePreviousParagraph(input.textarea())
      event.preventDefault()
      return true
    }

    if (key === "}" && !hasModifier(event)) {
      moveNextParagraph(input.textarea())
      event.preventDefault()
      return true
    }

    if (key === "s" && !event.shift && !hasModifier(event)) {
      begin(() => {
        const cursor = input.textarea().cursorOffset
        const reg = deleteUnderCursor(input.textarea())
        if (reg) {
          setRegister(reg)
          input.textarea().cursorOffset = cursor
        }
        input.state.setMode("insert")
      })
      event.preventDefault()
      return true
    }

    if (key === "x" && !event.shift && !hasModifier(event)) {
      edit(() => {
        const reg = deleteUnderCursor(input.textarea())
        if (reg) setRegister(reg)
      })
      event.preventDefault()
      return true
    }

    if (key === "~" && !hasModifier(event)) {
      edit(() => {
        toggleCase(input.textarea())
      })
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

    if (key === "w" && event.ctrl && !event.shift && !event.meta && !event.super) {
      input.state.setPending("w")
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
    if (input.copySearchActive?.()) {
      if (key === "return") {
        input.copySearchSubmit?.()
        event.preventDefault()
        return true
      }
      if (key === "escape") {
        input.copySearchCancel?.()
        event.preventDefault()
        return true
      }
      if (key === "backspace" || key === "delete" || (key === "h" && event.ctrl && !event.meta && !event.super)) {
        input.copySearchBackspace?.()
        event.preventDefault()
        return true
      }
      if (!hasModifier(event) && isPrintable(event)) {
        input.copySearchAppend?.(value(event))
        event.preventDefault()
        return true
      }
      event.preventDefault()
      return true
    }

    if (input.state.pending() === "" && isShifted(event, "y") && !hasModifier(event)) {
      if (input.copyIsVisual?.()) {
        input.copyYank?.()
        input.state.setMode("normal")
        input.copyExit?.()
        event.preventDefault()
        return true
      }
      input.copyYankLine?.()
      setTimeout(() => {
        input.state.setMode("normal")
        input.copyExit?.()
      }, 70)
      event.preventDefault()
      return true
    }

    if (key === "y" && !event.shift && !hasModifier(event)) {
      if (input.copyIsVisual?.()) {
        input.copyYank?.()
        input.copyExitPreserveScroll?.()
        input.state.setMode("normal")
        event.preventDefault()
        return true
      }
      if (input.state.pending() === "y") {
        input.state.clearPending()
        input.copyYankLine?.()
        setTimeout(() => {
          input.copyExitPreserveScroll?.()
          input.state.setMode("normal")
        }, 70)
        event.preventDefault()
        return true
      }
      input.state.setPending("y")
      event.preventDefault()
      return true
    }

    const pending = input.state.pending()
    const clearCopyPending = () => {
      if (input.state.pending()) input.state.clearPending()
    }
    if (pending === "y") {
      input.state.clearPending()
    }

    if (key === "return") {
      input.copyCopy?.()
      if (event.shift) {
        input.state.setMode("normal")
        input.copyExit?.()
        event.preventDefault()
        return true
      }
      input.copyExitPreserveScroll?.()
      input.state.setMode("normal")
      event.preventDefault()
      return true
    }
    if (key === "q") {
      input.state.setMode("normal")
      event.preventDefault()
      return true
    }
    if (pending === "" && key === "i" && !event.shift && !hasModifier(event)) {
      begin()
      input.copyFocusInput?.()
      input.state.setMode("insert")
      event.preventDefault()
      return true
    }

    if (key === "escape") {
      if (input.copyIsVisual?.()) {
        input.copyExitVisual?.()
        event.preventDefault()
        return true
      }
      if (input.copySearchHighlighted?.() && input.copySearchClear?.()) {
        event.preventDefault()
        return true
      }
      input.state.setMode("normal")
      event.preventDefault()
      return true
    }

    if (input.state.pending() === "w") {
      if (key === "j" || key === "w") {
        if (input.copyIsVisual?.()) {
          input.copyExitVisual?.()
          event.preventDefault()
          return true
        }
        input.state.setSkipExitOnModeChange(true)
        input.state.setExitScrollToBottom(false)
        input.state.setMode("normal")
        input.copyExit?.(false)
        event.preventDefault()
        return true
      }
      input.state.clearPending()
    }

    if (key === "w" && event.ctrl && !event.shift && !event.meta && !event.super) {
      input.state.setPending("w")
      event.preventDefault()
      return true
    }

    const scroll = vimScroll(event)
    if (scroll) {
      clearCopyPending()
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

    if (hasModifier(event)) {
      clearCopyPending()
      return false
    }

    if (key === "/") {
      clearCopyPending()
      input.copySearchStart?.("forward")
      event.preventDefault()
      return true
    }

    if (key === "?") {
      clearCopyPending()
      input.copySearchStart?.("backward")
      event.preventDefault()
      return true
    }

    if (key === "n" && !event.shift) {
      clearCopyPending()
      input.copySearchNext?.()
      event.preventDefault()
      return true
    }

    if (isShifted(event, "n")) {
      clearCopyPending()
      input.copySearchPrevious?.()
      event.preventDefault()
      return true
    }

    if (isShifted(event, "h")) {
      clearCopyPending()
      input.copyJump?.("high")
      event.preventDefault()
      return true
    }

    if (isShifted(event, "m")) {
      clearCopyPending()
      input.copyJump?.("middle")
      event.preventDefault()
      return true
    }

    if (isShifted(event, "l")) {
      clearCopyPending()
      input.copyJump?.("low")
      event.preventDefault()
      return true
    }

    if (isShifted(event, "v")) {
      clearCopyPending()
      input.copyVisual?.("line")
      event.preventDefault()
      return true
    }

    if (key === "v" && !event.shift) {
      clearCopyPending()
      input.copyVisual?.("char")
      event.preventDefault()
      return true
    }

    if (key === "o" && !hasModifier(event) && input.copyIsVisual?.() && !isShifted(event, "o")) {
      input.copyToggleVisualEnd?.()
      event.preventDefault()
      return true
    }

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

    if (pending === "z") {
      input.state.clearPending()
      if (key === "z") input.copyScroll?.("center")
      else if (key === "t") input.copyScroll?.("top")
      else if (key === "b") input.copyScroll?.("bottom")
      event.preventDefault()
      return true
    }

    if (key === "j" || key === "down") {
      input.copy?.("down")
      event.preventDefault()
      return true
    }

    if (key === "k" || key === "up") {
      input.copy?.("up")
      event.preventDefault()
      return true
    }

    if (key === "h" || key === "left") {
      input.copy?.("left")
      event.preventDefault()
      return true
    }

    if (key === "l" || key === "right") {
      input.copy?.("right")
      event.preventDefault()
      return true
    }

    const pos = input.copyCol?.() ?? 0

    // line motions
    if (key === "0") {
      copyMotion(0)
      input.setCopyStick?.("start")
      event.preventDefault()
      return true
    }

    if (key === "^" || key === "_") {
      const text = input.copyText?.() ?? ""
      copyMotion(firstNonWhitespace(text, 0))
      input.setCopyStick?.("first")
      event.preventDefault()
      return true
    }

    if (key === "$") {
      const text = input.copyText?.() ?? ""
      copyMotion(Math.max(0, text.length - 1))
      input.setCopyStick?.("end")
      event.preventDefault()
      return true
    }

    if (key === "%") {
      if (pending === "y") {
        input.state.clearPending()
        if (input.copyYankMatchingBracket?.()) {
          setTimeout(() => {
            input.copyExitPreserveScroll?.()
            input.state.setMode("normal")
          }, 70)
        }
        event.preventDefault()
        return true
      }
      if (!input.copyMatchingBracket?.()) {
        const text = input.copyText?.() ?? ""
        const target = matchingBracketTarget(text, pos)
        if (target !== null) copyMotion(target)
      }
      event.preventDefault()
      return true
    }

    if (key === "z" && !event.shift) {
      input.state.setPending("z")
      event.preventDefault()
      return true
    }

    // word motions
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
      if (input.copyWordPrev?.(false)) {
        event.preventDefault()
        return true
      }
      const text = input.copyText?.() ?? ""
      copyMotion(prevWordStart(text, pos, false))
      event.preventDefault()
      return true
    }

    if (key === "e" && !event.shift) {
      if (input.copyWordEnd?.(false)) {
        event.preventDefault()
        return true
      }
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
      if (input.copyWordPrev?.(true)) {
        event.preventDefault()
        return true
      }
      const text = input.copyText?.() ?? ""
      copyMotion(prevWordStart(text, pos, true))
      event.preventDefault()
      return true
    }

    if (isShifted(event, "e")) {
      if (input.copyWordEnd?.(true)) {
        event.preventDefault()
        return true
      }
      const text = input.copyText?.() ?? ""
      copyMotion(wordEnd(text, pos, true))
      event.preventDefault()
      return true
    }

    // paragraph motions
    if (key === "{" && !hasModifier(event)) {
      input.copyPreviousParagraph?.()
      event.preventDefault()
      return true
    }

    if (key === "}" && !hasModifier(event)) {
      input.copyNextParagraph?.()
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

      // Keep dot replay atomic
      if (input.state.replaying()) {
        event.preventDefault()
        return true
      }

      if (input.state.isReplace()) {
        if (event.name === "escape") {
          const start = input.state.replace()
          const typed = input.state.typed()
          input.state.setMode("normal")
          if (typed && start !== null) {
            input.textarea().cursorOffset = Math.max(start, input.textarea().cursorOffset - 1)
          }
          input.state.commitEdit(snapshot())
          repeat.commit(snapshot())
          event.preventDefault()
          return true
        }

        if (isPrintable(event) && !hasModifier(event)) {
          const next = value(event)
          repeat.recordReplaceChar(next)
          replaceUnderCursor(input.textarea(), next)
          input.state.setTyped(true)
          event.preventDefault()
          return true
        }

        return false
      }

      if (input.state.isCopy()) {
        const mapped = langmapped(event)
        return copy(mapped, normalizedKeyName(mapped))
      }

      if (input.state.isInsert()) {
        if (event.name !== "escape") return false
        input.state.setMode("normal")
        input.state.commitEdit(snapshot())
        moveLeft(input.textarea())
        repeat.commit(snapshot())
        event.preventDefault()
        return true
      }

      const mapped = langmapped(event)
      const key = normalizedKeyName(mapped)
      const result = dispatch(mapped, key)

      if (result && input.state.isVisual()) {
        const a = input.state.anchor()
        if (a !== null) syncSelection(input.textarea(), a, input.state.isVisualLine())
      }

      return result
    },
  }
}
