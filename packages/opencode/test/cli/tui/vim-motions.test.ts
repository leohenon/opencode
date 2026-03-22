import { describe, expect, test } from "bun:test"
import type { TextareaRenderable } from "@opentui/core"
import { createSignal } from "solid-js"
import { createVimHandler } from "../../../src/cli/cmd/tui/component/vim/vim-handler"
import { createVimState } from "../../../src/cli/cmd/tui/component/vim/vim-state"
import type { VimScroll } from "../../../src/cli/cmd/tui/component/vim/vim-scroll"
import { vimScroll } from "../../../src/cli/cmd/tui/component/vim/vim-scroll"
import type { VimJump } from "../../../src/cli/cmd/tui/component/vim/vim-motion-jump"

function rowColToOffset(text: string, row: number, col: number) {
  let index = 0
  let current = 0
  while (current < row) {
    const next = text.indexOf("\n", index)
    if (next === -1) return text.length
    index = next + 1
    current++
  }
  return Math.min(index + col, text.length)
}

function offsetToRowCol(text: string, offset: number) {
  let row = 0
  let col = 0
  let index = 0
  while (index < offset && index < text.length) {
    if (text[index] === "\n") {
      row++
      col = 0
      index++
      continue
    }
    col++
    index++
  }
  return { row, col }
}

function createTextarea(text: string) {
  let sel: { start: number; end: number } | null = null
  let anchor: number | null = null
  const textarea = {
    plainText: text,
    cursorOffset: 0,
    get logicalCursor() {
      return offsetToRowCol(textarea.plainText, textarea.cursorOffset)
    },
    insertText(value: string) {
      const head = textarea.plainText.slice(0, textarea.cursorOffset)
      const tail = textarea.plainText.slice(textarea.cursorOffset)
      textarea.plainText = head + value + tail
      textarea.cursorOffset += value.length
    },
    deleteRange(startRow: number, startCol: number, endRow: number, endCol: number) {
      const start = rowColToOffset(textarea.plainText, startRow, startCol)
      const end = rowColToOffset(textarea.plainText, endRow, endCol)
      textarea.plainText = textarea.plainText.slice(0, start) + textarea.plainText.slice(end)
      textarea.cursorOffset = start
    },
    updateSelectionForMovement(shift: boolean, before: boolean) {
      if (!shift) {
        anchor = null
        sel = null
        return
      }
      if (before) {
        anchor = textarea.cursorOffset
        return
      }
      if (anchor === null) return
      sel = { start: Math.min(anchor, textarea.cursorOffset), end: Math.max(anchor, textarea.cursorOffset) }
    },
    editorView: {
      setSelection(start: number, end: number) {
        sel = { start, end }
      },
      resetSelection() {
        sel = null
        anchor = null
      },
      getSelection() {
        return sel
      },
      hasSelection() {
        return sel !== null
      },
      getSelectedText() {
        if (!sel) return ""
        return textarea.plainText.slice(sel.start, sel.end)
      },
      deleteSelectedText() {
        if (!sel) return
        textarea.plainText = textarea.plainText.slice(0, sel.start) + textarea.plainText.slice(sel.end)
        textarea.cursorOffset = sel.start
        sel = null
      },
    },
  }
  return textarea as unknown as TextareaRenderable
}

function createEvent(name: string, options?: { shift?: boolean; ctrl?: boolean; meta?: boolean; super?: boolean }) {
  let prevented = false
  return {
    event: {
      name,
      shift: options?.shift,
      ctrl: options?.ctrl,
      meta: options?.meta,
      super: options?.super,
      preventDefault() {
        prevented = true
      },
    },
    prevented: () => prevented,
  }
}

function createHandler(
  text: string,
  options?: {
    enabled?: boolean
    mode?: "normal" | "insert" | "replace" | "visual" | "visual-line"
    submit?: () => void
    autocomplete?: () => false | "@" | "/"
    flash?: (span: { start: number; end: number }) => void
  },
) {
  const textarea = createTextarea(text)
  const [enabled] = createSignal(options?.enabled ?? true)
  const [mode, setMode] = createSignal<"normal" | "insert" | "replace" | "visual" | "visual-line">(
    options?.mode ?? "normal",
  )
  const [pending, setPending] = createSignal<"" | "c" | "d" | "g" | "f" | "F" | "t" | "T" | "y">("")
  const [lastFind, setLastFind] = createSignal<{ char: string; forward: boolean; till: boolean } | null>(null)
  const [register, setRegister] = createSignal<{ text: string; linewise: boolean } | null>(null)
  const [anchor, setAnchor] = createSignal<number | null>(null)
  const [replace, setReplace] = createSignal<number | null>(null)
  const [typed, setTyped] = createSignal(false)
  const scrollCalls: VimScroll[] = []
  const jumpCalls: VimJump[] = []

  function clearPending() {
    setPending("")
  }

  function changeMode(next: "normal" | "insert" | "replace" | "visual" | "visual-line") {
    clearPending()
    if (next !== "visual" && next !== "visual-line") setAnchor(null)
    if (next !== "replace") {
      setReplace(null)
      setTyped(false)
    }
    setMode(next)
  }

  const state: ReturnType<typeof createVimState> = {
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
    isInsert: () => mode() === "insert",
    isReplace: () => mode() === "replace",
    isVisual: () => mode() === "visual" || mode() === "visual-line",
    isVisualLine: () => mode() === "visual-line",
  } as ReturnType<typeof createVimState>
  const handler = createVimHandler({
    enabled,
    state,
    textarea: () => textarea,
    submit: options?.submit ?? (() => {}),
    scroll(action) {
      scrollCalls.push(action)
    },
    jump(action) {
      jumpCalls.push(action)
    },
    autocomplete: options?.autocomplete,
    flash: options?.flash,
  })

  return { textarea, handler, state, scrollCalls, jumpCalls }
}

describe("vim motion handler", () => {
  test("moves with h j k l and clamps to line", () => {
    const ctx = createHandler("abc\nxy")

    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)
    expect(ctx.textarea.cursorOffset).toBe(2)

    ctx.handler.handleKey(createEvent("j").event)
    expect(ctx.textarea.cursorOffset).toBe(5)

    ctx.handler.handleKey(createEvent("h").event)
    expect(ctx.textarea.cursorOffset).toBe(4)

    ctx.handler.handleKey(createEvent("k").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("h clamps at line start", () => {
    const ctx = createHandler("abc\ndef")
    ctx.textarea.cursorOffset = 4
    ctx.handler.handleKey(createEvent("h").event)
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("l clamps at line end", () => {
    const ctx = createHandler("ab\ncd")
    ctx.textarea.cursorOffset = 1
    ctx.handler.handleKey(createEvent("l").event)
    expect(ctx.textarea.cursorOffset).toBe(1)
  })

  test("j on last line stays", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 1
    ctx.handler.handleKey(createEvent("j").event)
    expect(ctx.textarea.cursorOffset).toBe(1)
  })

  test("k on first line stays", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 1
    ctx.handler.handleKey(createEvent("k").event)
    expect(ctx.textarea.cursorOffset).toBe(1)
  })

  test("j/k move across leading empty first line", () => {
    const text = "\nline1\nline2\nline3\n"
    const ctx = createHandler(text)
    ctx.textarea.cursorOffset = rowColToOffset(text, 1, 0)

    ctx.handler.handleKey(createEvent("k").event)
    expect(ctx.textarea.cursorOffset).toBe(rowColToOffset(text, 0, 0))

    ctx.handler.handleKey(createEvent("j").event)
    expect(ctx.textarea.cursorOffset).toBe(rowColToOffset(text, 1, 0))
  })

  test("j/k move across trailing empty last line", () => {
    const text = "\nline1\nline2\nline3\n"
    const ctx = createHandler(text)
    ctx.textarea.cursorOffset = rowColToOffset(text, 3, 0)

    ctx.handler.handleKey(createEvent("j").event)
    expect(ctx.textarea.cursorOffset).toBe(rowColToOffset(text, 4, 0))

    ctx.handler.handleKey(createEvent("k").event)
    expect(ctx.textarea.cursorOffset).toBe(rowColToOffset(text, 3, 0))
  })

  test("supports word and big-word key shapes", () => {
    const ctx = createHandler("foo,bar baz")

    const w = createEvent("w")
    expect(ctx.handler.handleKey(w.event)).toBe(true)
    expect(w.prevented()).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(4)

    const upperW = createEvent("W")
    expect(ctx.handler.handleKey(upperW.event)).toBe(true)
    expect(upperW.prevented()).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(8)

    ctx.textarea.cursorOffset = 0
    const shiftW = createEvent("w", { shift: true })
    expect(ctx.handler.handleKey(shiftW.event)).toBe(true)
    expect(shiftW.prevented()).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(8)

    const upperE = createEvent("E")
    expect(ctx.handler.handleKey(upperE.event)).toBe(true)
    expect(upperE.prevented()).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(10)

    const upperB = createEvent("B")
    expect(ctx.handler.handleKey(upperB.event)).toBe(true)
    expect(upperB.prevented()).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(8)
  })

  test("e stays on single-char word", () => {
    const ctx = createHandler("a")
    ctx.textarea.cursorOffset = 0
    ctx.handler.handleKey(createEvent("e").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("e from end of word moves to next word end", () => {
    const ctx = createHandler("a b")
    ctx.textarea.cursorOffset = 0
    ctx.handler.handleKey(createEvent("e").event)
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("e from word end moves to next word end", () => {
    const ctx = createHandler("ab cd")
    ctx.textarea.cursorOffset = 1
    ctx.handler.handleKey(createEvent("e").event)
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("e from whitespace moves to next word end", () => {
    const ctx = createHandler("ab  cd")
    ctx.textarea.cursorOffset = 2
    ctx.handler.handleKey(createEvent("e").event)
    expect(ctx.textarea.cursorOffset).toBe(5)
  })

  test("b moves to previous word start", () => {
    const ctx = createHandler("foo bar baz")
    ctx.textarea.cursorOffset = 8
    ctx.handler.handleKey(createEvent("b").event)
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("b at start of text stays", () => {
    const ctx = createHandler("foo bar")
    ctx.textarea.cursorOffset = 0
    ctx.handler.handleKey(createEvent("b").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("b skips punctuation to previous word", () => {
    const ctx = createHandler("foo,bar")
    ctx.textarea.cursorOffset = 4
    ctx.handler.handleKey(createEvent("b").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("0 moves to line beginning", () => {
    const ctx = createHandler("  hello")
    ctx.textarea.cursorOffset = 4
    ctx.handler.handleKey(createEvent("0").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("0 on multiline moves to current line start", () => {
    const ctx = createHandler("abc\n  def")
    ctx.textarea.cursorOffset = 7
    ctx.handler.handleKey(createEvent("0").event)
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("^ moves to first non-whitespace", () => {
    const ctx = createHandler("  hello")
    ctx.textarea.cursorOffset = 5
    ctx.handler.handleKey(createEvent("^").event)
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("^ on line with no leading whitespace goes to column 0", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 3
    ctx.handler.handleKey(createEvent("^").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("_ moves to first non-whitespace like ^", () => {
    const ctx = createHandler("  hello")
    ctx.textarea.cursorOffset = 5
    ctx.handler.handleKey(createEvent("_").event)
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("$ moves to last char of line", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 0
    ctx.handler.handleKey(createEvent("$").event)
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("$ on multiline moves to last char of current line", () => {
    const ctx = createHandler("abc\ndef")
    ctx.textarea.cursorOffset = 0
    ctx.handler.handleKey(createEvent("$").event)
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("$ on single char stays put", () => {
    const ctx = createHandler("a")
    ctx.textarea.cursorOffset = 0
    ctx.handler.handleKey(createEvent("$").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("^ on all-whitespace line goes to end", () => {
    const ctx = createHandler("   ")
    ctx.textarea.cursorOffset = 0
    ctx.handler.handleKey(createEvent("^").event)
    expect(ctx.textarea.cursorOffset).toBe(3)
  })

  test("$ on empty line in multiline", () => {
    const ctx = createHandler("abc\n\ndef")
    ctx.textarea.cursorOffset = 4
    ctx.handler.handleKey(createEvent("$").event)
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("supports insert transitions for A I O", () => {
    const i0 = createHandler("abc")
    i0.textarea.cursorOffset = 1
    expect(i0.handler.handleKey(createEvent("i").event)).toBe(true)
    expect(i0.state.mode()).toBe("insert")
    expect(i0.textarea.cursorOffset).toBe(1)

    const i = createHandler("  abc")
    i.textarea.cursorOffset = 1
    expect(i.handler.handleKey(createEvent("I").event)).toBe(true)
    expect(i.state.mode()).toBe("insert")
    expect(i.textarea.cursorOffset).toBe(2)

    const a = createHandler("  abc")
    a.textarea.cursorOffset = 1
    expect(a.handler.handleKey(createEvent("A").event)).toBe(true)
    expect(a.state.mode()).toBe("insert")
    expect(a.textarea.cursorOffset).toBe(5)

    const o = createHandler("abc")
    o.textarea.cursorOffset = 1
    expect(o.handler.handleKey(createEvent("o", { shift: true }).event)).toBe(true)
    expect(o.state.mode()).toBe("insert")
    expect(o.textarea.plainText).toBe("\nabc")
  })

  test("a appends after cursor", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 1
    expect(ctx.handler.handleKey(createEvent("a").event)).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("a at end of line stays at end", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 2
    expect(ctx.handler.handleKey(createEvent("a").event)).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.textarea.cursorOffset).toBe(3)
  })

  test("o opens line below and enters insert", () => {
    const ctx = createHandler("abc\ndef")
    ctx.textarea.cursorOffset = 1
    expect(ctx.handler.handleKey(createEvent("o").event)).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.textarea.plainText).toBe("abc\n\ndef")
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("o on last line opens line below", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 1
    expect(ctx.handler.handleKey(createEvent("o").event)).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.textarea.plainText).toBe("abc\n")
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("O on first line inserts line above", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 1
    expect(ctx.handler.handleKey(createEvent("O").event)).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.textarea.plainText).toBe("\nabc")
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("backspace is consumed in normal mode", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 1
    const bs = createEvent("backspace")
    expect(ctx.handler.handleKey(bs.event)).toBe(true)
    expect(bs.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("abc")
    expect(ctx.textarea.cursorOffset).toBe(1)
  })

  test("delete is consumed in normal mode", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 1
    const del = createEvent("delete")
    expect(ctx.handler.handleKey(del.event)).toBe(true)
    expect(del.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("abc")
    expect(ctx.textarea.cursorOffset).toBe(1)
  })

  test("printable keys are consumed in normal mode", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 1
    const z = createEvent("z")
    expect(ctx.handler.handleKey(z.event)).toBe(true)
    expect(z.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("abc")
    expect(ctx.textarea.cursorOffset).toBe(1)
  })

  test("printable keys with modifiers pass through", () => {
    const ctx = createHandler("abc")
    const v = createEvent("v", { ctrl: true })
    expect(ctx.handler.handleKey(v.event)).toBe(false)
    expect(v.prevented()).toBe(false)
  })

  test("x deletes under cursor and no-ops at end", () => {
    const a = createHandler("abc")
    a.textarea.cursorOffset = 1
    const x = createEvent("x")
    expect(a.handler.handleKey(x.event)).toBe(true)
    expect(x.prevented()).toBe(true)
    expect(a.textarea.plainText).toBe("ac")

    const b = createHandler("ab\ncd")
    b.textarea.cursorOffset = 2
    expect(b.handler.handleKey(createEvent("x").event)).toBe(true)
    expect(b.textarea.plainText).toBe("ab\ncd")
  })

  test("x on empty string is a no-op", () => {
    const ctx = createHandler("")
    const x = createEvent("x")
    expect(ctx.handler.handleKey(x.event)).toBe(true)
    expect(x.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("")
  })

  test("S clears current line and enters insert", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5
    const s = createEvent("S")

    expect(ctx.handler.handleKey(s.event)).toBe(true)
    expect(s.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.textarea.plainText).toBe("one\n\nthree")
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("S clears single line", () => {
    const ctx = createHandler("abc")
    const s = createEvent("S")

    expect(ctx.handler.handleKey(s.event)).toBe(true)
    expect(s.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.textarea.plainText).toBe("")
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("S keeps empty buffer", () => {
    const ctx = createHandler("")
    const s = createEvent("S")

    expect(ctx.handler.handleKey(s.event)).toBe(true)
    expect(s.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.textarea.plainText).toBe("")
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("cc clears current line and enters insert", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    const c1 = createEvent("c")
    expect(ctx.handler.handleKey(c1.event)).toBe(true)
    expect(c1.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("c")

    const c2 = createEvent("c")
    expect(ctx.handler.handleKey(c2.event)).toBe(true)
    expect(c2.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.textarea.plainText).toBe("one\n\nthree")
    expect(ctx.textarea.cursorOffset).toBe(4)
    expect(ctx.state.pending()).toBe("")
  })

  test("cw deletes to next word and enters insert", () => {
    const ctx = createHandler("hello world test")
    ctx.textarea.cursorOffset = 0

    const c = createEvent("c")
    expect(ctx.handler.handleKey(c.event)).toBe(true)
    expect(ctx.state.pending()).toBe("c")

    const w = createEvent("w")
    expect(ctx.handler.handleKey(w.event)).toBe(true)
    expect(w.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("world test")
    expect(ctx.textarea.cursorOffset).toBe(0)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.state.pending()).toBe("")
  })

  test("pending c clears on escape", () => {
    const ctx = createHandler("hello world")

    expect(ctx.handler.handleKey(createEvent("c").event)).toBe(true)
    expect(ctx.state.pending()).toBe("c")

    const esc = createEvent("escape")
    expect(ctx.handler.handleKey(esc.event)).toBe(true)
    expect(esc.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.textarea.plainText).toBe("hello world")
  })

  test("pending c clears on modifier key", () => {
    const ctx = createHandler("abc")

    expect(ctx.handler.handleKey(createEvent("c").event)).toBe(true)
    expect(ctx.state.pending()).toBe("c")

    const mod = createEvent("j", { ctrl: true })
    expect(ctx.handler.handleKey(mod.event)).toBe(false)
    expect(mod.prevented()).toBe(false)
    expect(ctx.state.pending()).toBe("")
  })

  test("pending c clears on non-motion key and key is handled", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 2

    expect(ctx.handler.handleKey(createEvent("c").event)).toBe(true)
    expect(ctx.state.pending()).toBe("c")

    const h = createEvent("h")
    expect(ctx.handler.handleKey(h.event)).toBe(true)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.textarea.cursorOffset).toBe(1)
  })

  test("escape in normal mode with no pending returns false", () => {
    const ctx = createHandler("abc")
    const esc = createEvent("escape")
    expect(ctx.handler.handleKey(esc.event)).toBe(false)
    expect(esc.prevented()).toBe(false)
    expect(ctx.state.mode()).toBe("normal")
  })

  test("insert mode only handles escape", () => {
    const ctx = createHandler("abc", { mode: "insert" })

    const w = createEvent("w")
    expect(ctx.handler.handleKey(w.event)).toBe(false)
    expect(w.prevented()).toBe(false)

    const esc = createEvent("escape")
    expect(ctx.handler.handleKey(esc.event)).toBe(true)
    expect(esc.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("normal")
  })

  test("R enters replace mode and escape exits", () => {
    const ctx = createHandler("abc")

    const enter = createEvent("R")
    expect(ctx.handler.handleKey(enter.event)).toBe(true)
    expect(enter.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("replace")

    const esc = createEvent("escape")
    expect(ctx.handler.handleKey(esc.event)).toBe(true)
    expect(esc.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("normal")
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("shift+r also enters replace mode", () => {
    const ctx = createHandler("abc")

    const enter = createEvent("r", { shift: true })
    expect(ctx.handler.handleKey(enter.event)).toBe(true)
    expect(enter.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("replace")
  })

  test("R clears pending operator when entering replace mode", () => {
    const ctx = createHandler("abc")
    ctx.state.setPending("d")

    expect(ctx.handler.handleKey(createEvent("R").event)).toBe(true)
    expect(ctx.state.mode()).toBe("replace")
    expect(ctx.state.pending()).toBe("")
  })

  test("replace mode overwrites characters and advances", () => {
    const ctx = createHandler("abcd")
    ctx.textarea.cursorOffset = 1

    ctx.handler.handleKey(createEvent("R").event)
    ctx.handler.handleKey(createEvent("X").event)
    ctx.handler.handleKey(createEvent("Y").event)

    expect(ctx.textarea.plainText).toBe("aXYd")
    expect(ctx.textarea.cursorOffset).toBe(3)
    expect(ctx.state.mode()).toBe("replace")
  })

  test("replace mode overwrites with space key", () => {
    const ctx = createHandler("abcd", { mode: "replace" })
    ctx.textarea.cursorOffset = 1

    const key = createEvent("space")
    expect(ctx.handler.handleKey(key.event)).toBe(true)
    expect(key.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("a cd")
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("replace mode inserts at line end without removing newline", () => {
    const ctx = createHandler("ab\ncd", { mode: "replace" })
    ctx.textarea.cursorOffset = 2

    const key = createEvent("X")
    expect(ctx.handler.handleKey(key.event)).toBe(true)
    expect(key.prevented()).toBe(true)

    expect(ctx.textarea.plainText).toBe("abX\ncd")
    expect(ctx.textarea.cursorOffset).toBe(3)
  })

  test("replace mode keeps appending before newline", () => {
    const ctx = createHandler("ab\ncd", { mode: "replace" })
    ctx.textarea.cursorOffset = 2

    ctx.handler.handleKey(createEvent("X").event)
    ctx.handler.handleKey(createEvent("Y").event)

    expect(ctx.textarea.plainText).toBe("abXY\ncd")
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("replace mode appends at end of buffer", () => {
    const ctx = createHandler("ab", { mode: "replace" })
    ctx.textarea.cursorOffset = 2

    expect(ctx.handler.handleKey(createEvent("X").event)).toBe(true)
    expect(ctx.textarea.plainText).toBe("abX")
    expect(ctx.textarea.cursorOffset).toBe(3)
  })

  test("escape from replace mode moves cursor back like vim", () => {
    const ctx = createHandler("abcd")
    ctx.textarea.cursorOffset = 1

    ctx.handler.handleKey(createEvent("R").event)
    ctx.handler.handleKey(createEvent("X").event)
    ctx.handler.handleKey(createEvent("Y").event)
    ctx.handler.handleKey(createEvent("escape").event)

    expect(ctx.textarea.plainText).toBe("aXYd")
    expect(ctx.textarea.cursorOffset).toBe(2)
    expect(ctx.state.mode()).toBe("normal")
  })

  test("escape from replace mode without edits keeps cursor in place", () => {
    const ctx = createHandler("abcd")
    ctx.textarea.cursorOffset = 2

    ctx.handler.handleKey(createEvent("R").event)
    ctx.handler.handleKey(createEvent("escape").event)

    expect(ctx.textarea.plainText).toBe("abcd")
    expect(ctx.textarea.cursorOffset).toBe(2)
    expect(ctx.state.mode()).toBe("normal")
  })

  test("escape after appending at line end lands on last inserted char", () => {
    const ctx = createHandler("ab\ncd")
    ctx.textarea.cursorOffset = 2

    ctx.handler.handleKey(createEvent("R").event)
    ctx.handler.handleKey(createEvent("X").event)
    ctx.handler.handleKey(createEvent("Y").event)
    ctx.handler.handleKey(createEvent("escape").event)

    expect(ctx.textarea.plainText).toBe("abXY\ncd")
    expect(ctx.textarea.cursorOffset).toBe(3)
    expect(ctx.state.mode()).toBe("normal")
  })

  test("replace mode ignores modified printable keys", () => {
    const ctx = createHandler("abcd", { mode: "replace" })
    ctx.textarea.cursorOffset = 1

    const key = createEvent("X", { ctrl: true })
    expect(ctx.handler.handleKey(key.event)).toBe(false)
    expect(key.prevented()).toBe(false)
    expect(ctx.textarea.plainText).toBe("abcd")
    expect(ctx.textarea.cursorOffset).toBe(1)
  })

  test("replace mode tracks replace session state", () => {
    const ctx = createHandler("abcd")
    ctx.textarea.cursorOffset = 1

    ctx.handler.handleKey(createEvent("R").event)
    expect(ctx.state.replace()).toBe(1)
    expect(ctx.state.typed()).toBe(false)

    ctx.handler.handleKey(createEvent("X").event)
    expect(ctx.state.replace()).toBe(1)
    expect(ctx.state.typed()).toBe(true)

    ctx.handler.handleKey(createEvent("escape").event)
    expect(ctx.state.replace()).toBe(null)
    expect(ctx.state.typed()).toBe(false)
  })

  test("/ and @ stay in normal mode without autocomplete", () => {
    const ctx = createHandler("abc", { mode: "normal" })

    const slash = createEvent("/")
    expect(ctx.handler.handleKey(slash.event)).toBe(true)
    expect(slash.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("normal")

    const at = createEvent("@")
    expect(ctx.handler.handleKey(at.event)).toBe(true)
    expect(at.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("normal")
  })

  test("/ enters insert on empty input with autocomplete visible", () => {
    const ctx = createHandler("", {
      mode: "normal",
      autocomplete: () => "/",
    })
    const slash = createEvent("/")

    expect(ctx.handler.handleKey(slash.event)).toBe(false)
    expect(slash.prevented()).toBe(false)
    expect(ctx.state.mode()).toBe("insert")
  })

  test("@ enters insert on empty input with autocomplete visible", () => {
    const ctx = createHandler("", {
      mode: "normal",
      autocomplete: () => "@",
    })
    const at = createEvent("@")

    expect(ctx.handler.handleKey(at.event)).toBe(false)
    expect(at.prevented()).toBe(false)
    expect(ctx.state.mode()).toBe("insert")
  })

  test("/ stays normal on non-empty input with autocomplete visible", () => {
    const ctx = createHandler("abc", {
      mode: "normal",
      autocomplete: () => "/",
    })
    const slash = createEvent("/")

    expect(ctx.handler.handleKey(slash.event)).toBe(true)
    expect(slash.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("normal")
  })

  test("submit from normal keeps mode and clears pending", () => {
    let calls = 0
    const ctx = createHandler("", {
      mode: "normal",
      submit() {
        calls++
      },
    })
    ctx.state.setPending("d")

    ctx.handler.handleKey(createEvent("return").event)

    expect(calls).toBe(1)
    expect(ctx.state.mode()).toBe("normal")
    expect(ctx.state.pending()).toBe("")
  })

  test("vim disabled does not intercept keys", () => {
    const ctx = createHandler("abc", { enabled: false })
    const keys = [
      createEvent("h"),
      createEvent("x"),
      createEvent("d"),
      createEvent("g"),
      createEvent("d", { ctrl: true }),
    ]

    for (const key of keys) {
      expect(ctx.handler.handleKey(key.event)).toBe(false)
      expect(key.prevented()).toBe(false)
    }

    expect(ctx.scrollCalls.length).toBe(0)
    expect(ctx.jumpCalls.length).toBe(0)
  })

  test("dd deletes current line", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    const d1 = createEvent("d")
    expect(ctx.handler.handleKey(d1.event)).toBe(true)
    expect(d1.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const d2 = createEvent("d")
    expect(ctx.handler.handleKey(d2.event)).toBe(true)
    expect(d2.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("one\nthree")
    expect(ctx.textarea.cursorOffset).toBe(4)
    expect(ctx.state.pending()).toBe("")
  })

  test("dd on last line lands at resulting line start", () => {
    const ctx = createHandler("one\ntwo")
    ctx.textarea.cursorOffset = 5

    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.textarea.plainText).toBe("one")
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("dw deletes to next word and clears pending", () => {
    const ctx = createHandler("hello world test")
    ctx.textarea.cursorOffset = 0

    const d = createEvent("d")
    expect(ctx.handler.handleKey(d.event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const w = createEvent("w")
    expect(ctx.handler.handleKey(w.event)).toBe(true)
    expect(w.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("world test")
    expect(ctx.textarea.cursorOffset).toBe(0)
    expect(ctx.state.pending()).toBe("")
  })

  test("dw at last word deletes to end", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("d").event)
    ctx.handler.handleKey(createEvent("w").event)
    expect(ctx.textarea.plainText).toBe("")
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("J joins current line with next", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 1

    const j = createEvent("J")
    expect(ctx.handler.handleKey(j.event)).toBe(true)
    expect(j.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("normal")
    expect(ctx.textarea.plainText).toBe("one two\nthree")
    expect(ctx.textarea.cursorOffset).toBe(3)
  })

  test("J strips leading whitespace on next line", () => {
    const ctx = createHandler("one\n  two")
    ctx.textarea.cursorOffset = 0

    const j = createEvent("J")
    expect(ctx.handler.handleKey(j.event)).toBe(true)
    expect(ctx.textarea.plainText).toBe("one two")
    expect(ctx.textarea.cursorOffset).toBe(3)
  })

  test("J on last line is a no-op", () => {
    const ctx = createHandler("only line")
    ctx.textarea.cursorOffset = 2

    const j = createEvent("J")
    expect(ctx.handler.handleKey(j.event)).toBe(true)
    expect(j.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("only line")
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("J with empty next line", () => {
    const ctx = createHandler("one\n\nthree")
    ctx.textarea.cursorOffset = 0

    const j = createEvent("J")
    expect(ctx.handler.handleKey(j.event)).toBe(true)
    expect(ctx.textarea.plainText).toBe("one \nthree")
    expect(ctx.textarea.cursorOffset).toBe(3)
  })

  test("J strips tab indentation on next line", () => {
    const ctx = createHandler("one\n\t\ttwo")
    ctx.textarea.cursorOffset = 0

    const j = createEvent("J")
    expect(ctx.handler.handleKey(j.event)).toBe(true)
    expect(ctx.textarea.plainText).toBe("one two")
    expect(ctx.textarea.cursorOffset).toBe(3)
  })

  test("J skips space when current line has trailing whitespace", () => {
    const ctx = createHandler("one \ntwo")
    ctx.textarea.cursorOffset = 0

    const j = createEvent("J")
    expect(ctx.handler.handleKey(j.event)).toBe(true)
    expect(ctx.textarea.plainText).toBe("one two")
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("J skips space when next line starts with )", () => {
    const ctx = createHandler("foo(\n)")
    ctx.textarea.cursorOffset = 0

    const j = createEvent("J")
    expect(ctx.handler.handleKey(j.event)).toBe(true)
    expect(ctx.textarea.plainText).toBe("foo()")
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("f finds character forward", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("f").event)
    expect(ctx.state.pending()).toBe("f")

    const o = createEvent("o")
    expect(ctx.handler.handleKey(o.event)).toBe(true)
    expect(o.prevented()).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(4)
    expect(ctx.state.pending()).toBe("")
  })

  test("F finds character backward", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 8

    ctx.handler.handleKey(createEvent("F").event)
    expect(ctx.state.pending()).toBe("F")

    const o = createEvent("o")
    expect(ctx.handler.handleKey(o.event)).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(7)
  })

  test("f not found stays put", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("f").event)
    ctx.handler.handleKey(createEvent("z").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("f stays on current line", () => {
    const ctx = createHandler("abc\ndef")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("f").event)
    ctx.handler.handleKey(createEvent("d").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("f clears pending after char", () => {
    const ctx = createHandler("abcabc")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("f").event)
    expect(ctx.state.pending()).toBe("f")
    ctx.handler.handleKey(createEvent("b").event)
    expect(ctx.state.pending()).toBe("")
  })

  test("f pending clears on escape", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("f").event)
    expect(ctx.state.pending()).toBe("f")
    ctx.handler.handleKey(createEvent("escape").event)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("; repeats last find forward", () => {
    const ctx = createHandler("abcabc")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("f").event)
    ctx.handler.handleKey(createEvent("b").event)
    expect(ctx.textarea.cursorOffset).toBe(1)

    ctx.handler.handleKey(createEvent(";").event)
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test(", repeats last find in reverse", () => {
    const ctx = createHandler("abcabc")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("f").event)
    ctx.handler.handleKey(createEvent("b").event)
    expect(ctx.textarea.cursorOffset).toBe(1)

    ctx.handler.handleKey(createEvent(";").event)
    expect(ctx.textarea.cursorOffset).toBe(4)

    const comma = createEvent(",")
    expect(ctx.handler.handleKey(comma.event)).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(1)
  })

  test("; with no previous find is no-op", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 2

    const semi = createEvent(";")
    expect(ctx.handler.handleKey(semi.event)).toBe(true)
    expect(semi.prevented()).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("F then ; repeats backward", () => {
    const ctx = createHandler("abcabc")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("F").event)
    ctx.handler.handleKey(createEvent("a").event)
    expect(ctx.textarea.cursorOffset).toBe(3)

    ctx.handler.handleKey(createEvent(";").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("t stops one before target", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("t").event)
    expect(ctx.state.pending()).toBe("t")

    const o = createEvent("o")
    expect(ctx.handler.handleKey(o.event)).toBe(true)
    expect(o.prevented()).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(3)
    expect(ctx.state.pending()).toBe("")
  })

  test("T stops one after target backward", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 8

    ctx.handler.handleKey(createEvent("T").event)
    expect(ctx.state.pending()).toBe("T")

    const o = createEvent("o")
    expect(ctx.handler.handleKey(o.event)).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(8)
  })

  test("t not found stays put", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("t").event)
    ctx.handler.handleKey(createEvent("z").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("t stays on current line", () => {
    const ctx = createHandler("abc\ndef")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("t").event)
    ctx.handler.handleKey(createEvent("d").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("; after t repeats as till", () => {
    const ctx = createHandler("axbxbx")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("t").event)
    ctx.handler.handleKey(createEvent("b").event)
    expect(ctx.textarea.cursorOffset).toBe(1)

    ctx.handler.handleKey(createEvent(";").event)
    expect(ctx.textarea.cursorOffset).toBe(3)
  })

  test(", after t reverses as till", () => {
    const ctx = createHandler("axbxxbxc")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("t").event)
    ctx.handler.handleKey(createEvent("b").event)
    expect(ctx.textarea.cursorOffset).toBe(1)

    ctx.handler.handleKey(createEvent(";").event)
    expect(ctx.textarea.cursorOffset).toBe(4)

    ctx.handler.handleKey(createEvent(",").event)
    expect(ctx.textarea.cursorOffset).toBe(3)
  })

  test("yy yanks current line into register", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("y").event)
    expect(ctx.state.pending()).toBe("y")

    ctx.handler.handleKey(createEvent("y").event)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.state.register()).toEqual({ text: "two", linewise: true })
    expect(ctx.textarea.cursorOffset).toBe(5)
    expect(ctx.textarea.plainText).toBe("one\ntwo\nthree")
  })

  test("yy flashes current line span", () => {
    const spans: Array<{ start: number; end: number }> = []
    const ctx = createHandler("one\ntwo\nthree", {
      flash(span) {
        spans.push(span)
      },
    })
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("y").event)
    ctx.handler.handleKey(createEvent("y").event)

    expect(spans).toEqual([{ start: 4, end: 7 }])
  })

  test("yw yanks word into register", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("y").event)
    ctx.handler.handleKey(createEvent("w").event)
    expect(ctx.state.register()).toEqual({ text: "hello ", linewise: false })
    expect(ctx.textarea.cursorOffset).toBe(0)
    expect(ctx.textarea.plainText).toBe("hello world")
  })

  test("yw flashes yanked word span", () => {
    const spans: Array<{ start: number; end: number }> = []
    const ctx = createHandler("hello world", {
      flash(span) {
        spans.push(span)
      },
    })
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("y").event)
    ctx.handler.handleKey(createEvent("w").event)

    expect(spans).toEqual([{ start: 0, end: 6 }])
  })

  test("p pastes linewise below current line", () => {
    const ctx = createHandler("one\ntwo")
    ctx.textarea.cursorOffset = 1

    ctx.handler.handleKey(createEvent("y").event)
    ctx.handler.handleKey(createEvent("y").event)

    ctx.handler.handleKey(createEvent("p").event)
    expect(ctx.textarea.plainText).toBe("one\none\ntwo")
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("P pastes linewise above current line", () => {
    const ctx = createHandler("one\ntwo")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("y").event)
    ctx.handler.handleKey(createEvent("y").event)

    ctx.handler.handleKey(createEvent("P").event)
    expect(ctx.textarea.plainText).toBe("one\ntwo\ntwo")
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("p pastes characterwise after cursor", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("y").event)
    ctx.handler.handleKey(createEvent("w").event)

    ctx.textarea.cursorOffset = 6
    ctx.handler.handleKey(createEvent("p").event)
    expect(ctx.textarea.plainText).toBe("hello whello orld")
    expect(ctx.textarea.cursorOffset).toBe(12)
  })

  test("P pastes characterwise before cursor", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("y").event)
    ctx.handler.handleKey(createEvent("w").event)

    ctx.textarea.cursorOffset = 6
    ctx.handler.handleKey(createEvent("P").event)
    expect(ctx.textarea.plainText).toBe("hello hello world")
    expect(ctx.textarea.cursorOffset).toBe(11)
  })

  test("p with empty register is no-op", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 2

    const p = createEvent("p")
    expect(ctx.handler.handleKey(p.event)).toBe(true)
    expect(p.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("hello")
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("yy then p multiple times", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("y").event)
    ctx.handler.handleKey(createEvent("y").event)

    ctx.handler.handleKey(createEvent("p").event)
    expect(ctx.textarea.plainText).toBe("abc\nabc")

    ctx.handler.handleKey(createEvent("p").event)
    expect(ctx.textarea.plainText).toBe("abc\nabc\nabc")
  })

  test("dd populates register", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("d").event)
    ctx.handler.handleKey(createEvent("d").event)
    expect(ctx.state.register()).toEqual({ text: "two", linewise: true })
  })

  test("dw populates register", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("d").event)
    ctx.handler.handleKey(createEvent("w").event)
    expect(ctx.state.register()).toEqual({ text: "hello ", linewise: false })
  })

  test("x populates register", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 1

    ctx.handler.handleKey(createEvent("x").event)
    expect(ctx.state.register()).toEqual({ text: "b", linewise: false })
  })

  test("pending y clears on escape", () => {
    const ctx = createHandler("hello")

    ctx.handler.handleKey(createEvent("y").event)
    expect(ctx.state.pending()).toBe("y")

    ctx.handler.handleKey(createEvent("escape").event)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.state.register()).toBe(null)
  })

  test("pending y clears on invalid key", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 2

    ctx.handler.handleKey(createEvent("y").event)
    expect(ctx.state.pending()).toBe("y")

    ctx.handler.handleKey(createEvent("h").event)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.textarea.cursorOffset).toBe(1)
  })

  test("pending y clears on modifier key", () => {
    const ctx = createHandler("abc")

    ctx.handler.handleKey(createEvent("y").event)
    expect(ctx.state.pending()).toBe("y")

    const mod = createEvent("j", { ctrl: true })
    expect(ctx.handler.handleKey(mod.event)).toBe(false)
    expect(mod.prevented()).toBe(false)
    expect(ctx.state.pending()).toBe("")
  })

  test("dd then p pastes deleted line below", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("d").event)
    ctx.handler.handleKey(createEvent("d").event)
    expect(ctx.textarea.plainText).toBe("one\nthree")

    ctx.handler.handleKey(createEvent("p").event)
    expect(ctx.textarea.plainText).toBe("one\nthree\ntwo")
  })

  test("pending d clears on escape", () => {
    const ctx = createHandler("hello world")

    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const esc = createEvent("escape")
    expect(ctx.handler.handleKey(esc.event)).toBe(true)
    expect(esc.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.textarea.plainText).toBe("hello world")
  })

  test("pending d clears on invalid key and key is handled normally", () => {
    const ctx = createHandler("abc")

    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const i = createEvent("i")
    expect(ctx.handler.handleKey(i.event)).toBe(true)
    expect(i.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.state.mode()).toBe("insert")
  })

  test("mode switch clears pending state", () => {
    const ctx = createHandler("abc")
    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    expect(ctx.handler.handleKey(createEvent("i").event)).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.state.pending()).toBe("")

    expect(ctx.handler.handleKey(createEvent("escape").event)).toBe(true)
    expect(ctx.state.mode()).toBe("normal")
    expect(ctx.state.pending()).toBe("")

    const h = createEvent("h")
    expect(ctx.handler.handleKey(h.event)).toBe(true)
    expect(h.prevented()).toBe(true)
  })

  test("pending d clears on modifier key and event is not consumed", () => {
    const ctx = createHandler("abc")

    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const mod = createEvent("j", { ctrl: true })
    expect(ctx.handler.handleKey(mod.event)).toBe(false)
    expect(mod.prevented()).toBe(false)
    expect(ctx.state.pending()).toBe("")
  })

  test("ctrl scroll keys trigger actions", () => {
    const ctx = createHandler("abc")
    const keys: Array<[string, VimScroll]> = [
      ["e", "line-down"],
      ["y", "line-up"],
      ["d", "half-down"],
      ["u", "half-up"],
      ["f", "page-down"],
      ["b", "page-up"],
    ]

    for (const [key, action] of keys) {
      const evt = createEvent(key, { ctrl: true })
      expect(ctx.handler.handleKey(evt.event)).toBe(true)
      expect(evt.prevented()).toBe(true)
      expect(ctx.scrollCalls.at(-1)).toBe(action)
    }
  })

  test("ctrl scroll clears pending operator", () => {
    const ctx = createHandler("abc")
    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const evt = createEvent("d", { ctrl: true })
    expect(ctx.handler.handleKey(evt.event)).toBe(true)
    expect(evt.prevented()).toBe(true)
    expect(ctx.scrollCalls.at(-1)).toBe("half-down")
    expect(ctx.state.pending()).toBe("")
  })

  test("ctrl scroll not handled in insert mode", () => {
    const ctx = createHandler("abc", { mode: "insert" })
    const evt = createEvent("e", { ctrl: true })
    expect(ctx.handler.handleKey(evt.event)).toBe(false)
    expect(evt.prevented()).toBe(false)
    expect(ctx.scrollCalls.length).toBe(0)
  })

  test("ctrl scroll not handled when vim disabled", () => {
    const ctx = createHandler("abc", { enabled: false })
    const evt = createEvent("e", { ctrl: true })
    expect(ctx.handler.handleKey(evt.event)).toBe(false)
    expect(evt.prevented()).toBe(false)
    expect(ctx.scrollCalls.length).toBe(0)
  })

  test("g and G jump to top or bottom", () => {
    const ctx = createHandler("abc")

    const g = createEvent("g")
    expect(ctx.handler.handleKey(g.event)).toBe(true)
    expect(g.prevented()).toBe(true)
    expect(ctx.jumpCalls.length).toBe(0)
    expect(ctx.state.pending()).toBe("g")

    const g2 = createEvent("g")
    expect(ctx.handler.handleKey(g2.event)).toBe(true)
    expect(g2.prevented()).toBe(true)
    expect(ctx.jumpCalls.at(-1)).toBe("top")
    expect(ctx.state.pending()).toBe("")

    const G = createEvent("G")
    expect(ctx.handler.handleKey(G.event)).toBe(true)
    expect(G.prevented()).toBe(true)
    expect(ctx.jumpCalls.at(-1)).toBe("bottom")
  })

  test("pending g cancels on other keys", () => {
    const ctx = createHandler("abc")
    expect(ctx.handler.handleKey(createEvent("g").event)).toBe(true)
    expect(ctx.state.pending()).toBe("g")

    const w = createEvent("w")
    expect(ctx.handler.handleKey(w.event)).toBe(true)
    expect(w.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")
  })

  test("pending transition d to g", () => {
    const ctx = createHandler("abc")
    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const g = createEvent("g")
    expect(ctx.handler.handleKey(g.event)).toBe(true)
    expect(g.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("g")

    const g2 = createEvent("g")
    expect(ctx.handler.handleKey(g2.event)).toBe(true)
    expect(g2.prevented()).toBe(true)
    expect(ctx.jumpCalls.at(-1)).toBe("top")
    expect(ctx.scrollCalls.length).toBe(0)
    expect(ctx.state.pending()).toBe("")
  })

  test("pending d then G clears and jumps", () => {
    const ctx = createHandler("abc")
    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const G = createEvent("G")
    expect(ctx.handler.handleKey(G.event)).toBe(true)
    expect(G.prevented()).toBe(true)
    expect(ctx.jumpCalls.at(-1)).toBe("bottom")
    expect(ctx.state.pending()).toBe("")
  })

  test("g not handled in insert mode", () => {
    const ctx = createHandler("abc", { mode: "insert" })
    const g = createEvent("g")
    expect(ctx.handler.handleKey(g.event)).toBe(false)
    expect(g.prevented()).toBe(false)
    expect(ctx.jumpCalls.length).toBe(0)
  })

  test("g not handled when vim disabled", () => {
    const ctx = createHandler("abc", { enabled: false })
    const g = createEvent("g")
    expect(ctx.handler.handleKey(g.event)).toBe(false)
    expect(g.prevented()).toBe(false)
    expect(ctx.jumpCalls.length).toBe(0)
  })

  test("repeated ctrl scroll keeps pending clear", () => {
    const ctx = createHandler("abc")
    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const first = createEvent("d", { ctrl: true })
    expect(ctx.handler.handleKey(first.event)).toBe(true)
    expect(first.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")

    const second = createEvent("d", { ctrl: true })
    expect(ctx.handler.handleKey(second.event)).toBe(true)
    expect(second.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")

    expect(ctx.scrollCalls).toEqual(["half-down", "half-down"])
  })

  test("repeated G does not create pending", () => {
    const ctx = createHandler("abc")

    const first = createEvent("G")
    expect(ctx.handler.handleKey(first.event)).toBe(true)
    expect(first.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")

    const second = createEvent("G")
    expect(ctx.handler.handleKey(second.event)).toBe(true)
    expect(second.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")

    expect(ctx.jumpCalls).toEqual(["bottom", "bottom"])
  })

  test("v enters visual mode and sets selection", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 2

    const v = createEvent("v")
    expect(ctx.handler.handleKey(v.event)).toBe(true)
    expect(v.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("visual")
    expect(ctx.state.anchor()).toBe(2)
  })

  test("v then motion extends selection", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("v").event)
    expect(ctx.state.mode()).toBe("visual")

    ctx.handler.handleKey(createEvent("l").event)
    expect(ctx.textarea.cursorOffset).toBe(1)
    expect((ctx.textarea as any).editorView.getSelection()).toEqual({ start: 0, end: 2 })

    ctx.handler.handleKey(createEvent("l").event)
    expect(ctx.textarea.cursorOffset).toBe(2)
    expect((ctx.textarea as any).editorView.getSelection()).toEqual({ start: 0, end: 3 })
  })

  test("v then w extends selection by word", () => {
    const ctx = createHandler("hello world test")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("v").event)
    ctx.handler.handleKey(createEvent("w").event)
    expect(ctx.textarea.cursorOffset).toBe(6)
    expect((ctx.textarea as any).editorView.getSelection()).toEqual({ start: 0, end: 7 })
  })

  test("v then escape exits visual mode", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 2

    ctx.handler.handleKey(createEvent("v").event)
    expect(ctx.state.mode()).toBe("visual")

    ctx.handler.handleKey(createEvent("escape").event)
    expect(ctx.state.mode()).toBe("normal")
    expect((ctx.textarea as any).editorView.getSelection()).toBe(null)
  })

  test("i does not enter insert in visual mode", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 2

    ctx.handler.handleKey(createEvent("v").event)
    expect(ctx.state.mode()).toBe("visual")

    const i = createEvent("i")
    expect(ctx.handler.handleKey(i.event)).toBe(true)
    expect(i.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("visual")
  })

  test("v twice toggles back to normal", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 1

    ctx.handler.handleKey(createEvent("v").event)
    expect(ctx.state.mode()).toBe("visual")

    ctx.handler.handleKey(createEvent("v").event)
    expect(ctx.state.mode()).toBe("normal")
    expect((ctx.textarea as any).editorView.getSelection()).toBe(null)
  })

  test("visual d deletes selection and populates register", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("v").event)
    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)

    ctx.handler.handleKey(createEvent("d").event)
    expect(ctx.textarea.plainText).toBe(" world")
    expect(ctx.state.mode()).toBe("normal")
    expect(ctx.state.register()).toEqual({ text: "hello", linewise: false })
  })

  test("visual d falls back to anchor when editor selection is cleared", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 1

    ctx.handler.handleKey(createEvent("v").event)
    ;(ctx.textarea as any).editorView.resetSelection()

    ctx.handler.handleKey(createEvent("d").event)
    expect(ctx.textarea.plainText).toBe("hllo")
    expect(ctx.state.register()).toEqual({ text: "e", linewise: false })
    expect(ctx.state.mode()).toBe("normal")
  })

  test("visual y yanks selection without deleting", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("v").event)
    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)

    ctx.handler.handleKey(createEvent("y").event)
    expect(ctx.textarea.plainText).toBe("hello world")
    expect(ctx.state.mode()).toBe("normal")
    expect(ctx.state.register()).toEqual({ text: "hello", linewise: false })
  })

  test("visual c deletes selection and enters insert", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("v").event)
    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)

    ctx.handler.handleKey(createEvent("c").event)
    expect(ctx.textarea.plainText).toBe(" world")
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.state.register()).toEqual({ text: "hello", linewise: false })
  })

  test("visual x is same as d", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("v").event)
    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)

    ctx.handler.handleKey(createEvent("x").event)
    expect(ctx.textarea.plainText).toBe("lo world")
    expect(ctx.state.mode()).toBe("normal")
    expect(ctx.state.register()).toEqual({ text: "hel", linewise: false })
  })

  test("visual p replaces selection with register", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 6

    ctx.handler.handleKey(createEvent("y").event)
    ctx.handler.handleKey(createEvent("w").event)
    expect(ctx.state.register()).toEqual({ text: "world", linewise: false })

    ctx.textarea.cursorOffset = 0
    ctx.handler.handleKey(createEvent("v").event)
    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)

    ctx.handler.handleKey(createEvent("p").event)
    expect(ctx.textarea.plainText).toBe("world world")
    expect(ctx.state.mode()).toBe("normal")
  })

  test("visual mode with backward motion", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("v").event)
    ctx.handler.handleKey(createEvent("h").event)
    ctx.handler.handleKey(createEvent("h").event)
    expect(ctx.textarea.cursorOffset).toBe(3)
    expect((ctx.textarea as any).editorView.getSelection()).toEqual({ start: 3, end: 6 })
  })

  test("visual mode $ selects to end of line", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 6

    ctx.handler.handleKey(createEvent("v").event)
    ctx.handler.handleKey(createEvent("$").event)
    expect(ctx.textarea.cursorOffset).toBe(10)
    expect((ctx.textarea as any).editorView.getSelection()).toEqual({ start: 6, end: 11 })
  })

  test("V enters visual-line mode", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    const v = createEvent("V")
    expect(ctx.handler.handleKey(v.event)).toBe(true)
    expect(v.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("visual-line")
    expect(ctx.state.anchor()).toBe(5)
    expect((ctx.textarea as any).editorView.getSelection()).toEqual({ start: 4, end: 8 })
  })

  test("V selects full current line on single line", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 2

    ctx.handler.handleKey(createEvent("V").event)
    expect((ctx.textarea as any).editorView.getSelection()).toEqual({ start: 0, end: 5 })
  })

  test("V then j extends by full line", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 1

    ctx.handler.handleKey(createEvent("V").event)
    expect((ctx.textarea as any).editorView.getSelection()).toEqual({ start: 0, end: 4 })

    ctx.handler.handleKey(createEvent("j").event)
    expect((ctx.textarea as any).editorView.getSelection()).toEqual({ start: 0, end: 8 })
  })

  test("V then k extends upward by full line", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("V").event)
    ctx.handler.handleKey(createEvent("k").event)
    expect((ctx.textarea as any).editorView.getSelection()).toEqual({ start: 0, end: 8 })
  })

  test("V then d deletes full lines with linewise register", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("V").event)
    ctx.handler.handleKey(createEvent("d").event)
    expect(ctx.textarea.plainText).toBe("one\nthree")
    expect(ctx.state.mode()).toBe("normal")
    expect(ctx.state.register()?.linewise).toBe(true)
  })

  test("V then d falls back to anchor when editor selection is cleared", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("V").event)
    ;(ctx.textarea as any).editorView.resetSelection()

    ctx.handler.handleKey(createEvent("d").event)
    expect(ctx.textarea.plainText).toBe("one\nthree")
    expect(ctx.state.register()).toEqual({ text: "two\n", linewise: true })
    expect(ctx.state.mode()).toBe("normal")
  })

  test("V then y yanks full lines with linewise register", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("V").event)
    ctx.handler.handleKey(createEvent("y").event)
    expect(ctx.textarea.plainText).toBe("one\ntwo\nthree")
    expect(ctx.state.mode()).toBe("normal")
    expect(ctx.state.register()).toEqual({ text: "two\n", linewise: true })
  })

  test("V select lines 2-4 then d places cursor at line 1 start", () => {
    const ctx = createHandler("line 1\nline 2\nline 3\nline 4")
    ctx.textarea.cursorOffset = 7

    ctx.handler.handleKey(createEvent("V").event)
    ctx.handler.handleKey(createEvent("j").event)
    ctx.handler.handleKey(createEvent("j").event)

    ctx.handler.handleKey(createEvent("d").event)
    expect(ctx.textarea.plainText).toBe("line 1")
    expect(ctx.textarea.cursorOffset).toBe(0)
    expect(ctx.state.mode()).toBe("normal")
  })

  test("V delete middle line places cursor at next line start", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("V").event)
    ctx.handler.handleKey(createEvent("d").event)
    expect(ctx.textarea.plainText).toBe("one\nthree")
    expect(ctx.textarea.cursorOffset).toBe(4)
    expect(ctx.state.mode()).toBe("normal")
  })

  test("V then escape exits", () => {
    const ctx = createHandler("hello")
    ctx.handler.handleKey(createEvent("V").event)
    expect(ctx.state.mode()).toBe("visual-line")

    ctx.handler.handleKey(createEvent("escape").event)
    expect(ctx.state.mode()).toBe("normal")
    expect((ctx.textarea as any).editorView.getSelection()).toBe(null)
  })

  test("V twice toggles off", () => {
    const ctx = createHandler("hello")
    ctx.handler.handleKey(createEvent("V").event)
    expect(ctx.state.mode()).toBe("visual-line")

    ctx.handler.handleKey(createEvent("V").event)
    expect(ctx.state.mode()).toBe("normal")
  })

  test("v in visual-line switches to characterwise", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("V").event)
    expect(ctx.state.mode()).toBe("visual-line")

    ctx.handler.handleKey(createEvent("v").event)
    expect(ctx.state.mode()).toBe("visual")
    expect(ctx.state.anchor()).toBe(5)
  })

  test("V in characterwise visual switches to visual-line", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("v").event)
    expect(ctx.state.mode()).toBe("visual")

    ctx.handler.handleKey(createEvent("V").event)
    expect(ctx.state.mode()).toBe("visual-line")
    expect(ctx.state.anchor()).toBe(5)
  })
})

describe("vim scroll mapping", () => {
  test("vimScroll maps ctrl keys to actions", () => {
    expect(vimScroll(createEvent("e", { ctrl: true }).event)).toBe("line-down")
    expect(vimScroll(createEvent("y", { ctrl: true }).event)).toBe("line-up")
    expect(vimScroll(createEvent("d", { ctrl: true }).event)).toBe("half-down")
    expect(vimScroll(createEvent("u", { ctrl: true }).event)).toBe("half-up")
    expect(vimScroll(createEvent("f", { ctrl: true }).event)).toBe("page-down")
    expect(vimScroll(createEvent("b", { ctrl: true }).event)).toBe("page-up")
    expect(vimScroll(createEvent("b", { ctrl: true, meta: true }).event)).toBe(undefined)
    expect(vimScroll(createEvent("b", { ctrl: false }).event)).toBe(undefined)
  })
})
