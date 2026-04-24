import type { TextareaRenderable } from "@opentui/core"
import type { VimRegister } from "./vim-state"

export type VimSpan = { start: number; end: number }
export type VimCopyRow = { col: number }

function lineStart(text: string, offset: number) {
  if (offset <= 0) return 0
  const index = text.lastIndexOf("\n", offset - 1)
  if (index === -1) return 0
  return index + 1
}

function lineEnd(text: string, offset: number) {
  const index = text.indexOf("\n", offset)
  if (index === -1) return text.length
  return index
}

function lineLast(text: string, offset: number) {
  const start = lineStart(text, offset)
  const end = lineEnd(text, offset)
  if (end > start) return end - 1
  return start
}

function prevLineStart(text: string, offset: number) {
  const start = lineStart(text, offset)
  if (start === 0) return undefined
  return lineStart(text, start - 1)
}

function nextLineStart(text: string, offset: number) {
  const end = lineEnd(text, offset)
  if (end >= text.length) return undefined
  return end + 1
}

function moveUp(text: string, offset: number) {
  const currentStart = lineStart(text, offset)
  const targetStart = prevLineStart(text, offset)
  if (targetStart === undefined) return offset
  const targetLast = lineLast(text, targetStart)
  const col = offset - currentStart
  return Math.min(targetStart + col, targetLast)
}

function moveDown(text: string, offset: number) {
  const currentStart = lineStart(text, offset)
  const targetStart = nextLineStart(text, offset)
  if (targetStart === undefined) return offset
  const targetLast = lineLast(text, targetStart)
  const col = offset - currentStart
  return Math.min(targetStart + col, targetLast)
}

export function moveLeft(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const start = lineStart(text, textarea.cursorOffset)
  textarea.cursorOffset = Math.max(start, textarea.cursorOffset - 1)
}

export function moveLineBeginning(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = lineStart(text, textarea.cursorOffset)
}

export function moveFirstNonWhitespace(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = firstNonWhitespace(text, textarea.cursorOffset)
}

export function moveLineEnd(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = lineLast(text, textarea.cursorOffset)
}

export function moveRight(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const last = lineLast(text, textarea.cursorOffset)
  textarea.cursorOffset = Math.min(last, textarea.cursorOffset + 1)
}

export function moveLineUp(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = moveUp(text, textarea.cursorOffset)
}

export function moveLineDown(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = moveDown(text, textarea.cursorOffset)
}

export function isWord(char: string) {
  return /[A-Za-z0-9_]/.test(char)
}

export function isBigWord(char: string) {
  return !/\s/.test(char)
}

export function nextWordStart(text: string, offset: number, big: boolean) {
  const match = big ? isBigWord : isWord
  let pos = offset
  if (pos < text.length && match(text[pos])) {
    while (pos < text.length && match(text[pos])) pos++
  }
  while (pos < text.length && !match(text[pos])) pos++
  return pos
}

export function prevWordStart(text: string, offset: number, big: boolean) {
  const match = big ? isBigWord : isWord
  let pos = offset
  while (pos > 0 && !match(text[pos - 1])) pos--
  while (pos > 0 && match(text[pos - 1])) pos--
  return pos
}

export function wordEnd(text: string, offset: number, big: boolean) {
  if (text.length === 0) return 0
  const match = big ? isBigWord : isWord
  let pos = offset
  if (pos >= text.length) pos = text.length - 1

  if (match(text[pos]) && (pos + 1 >= text.length || !match(text[pos + 1]))) {
    pos++
  }

  while (pos < text.length && !match(text[pos])) pos++
  if (pos >= text.length) return text.length - 1

  while (pos + 1 < text.length && match(text[pos + 1])) pos++
  return pos
}

function deleteOffsets(textarea: TextareaRenderable, startOffset: number, endOffset: number) {
  if (endOffset <= startOffset) return
  const end = Math.min(endOffset, textarea.plainText.length)
  if (end <= startOffset) return
  const start = textarea.editBuffer.offsetToPosition(startOffset)
  const pos = textarea.editBuffer.offsetToPosition(end)
  if (!start || !pos) return
  textarea.deleteRange(start.row, start.col, pos.row, pos.col)
  textarea.cursorOffset = startOffset
}

function swap(char: string) {
  const low = char.toLowerCase()
  const up = char.toUpperCase()
  if (char === low && char !== up) return up
  if (char === up && char !== low) return low
  return char
}

export function moveWordNext(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = nextWordStart(text, textarea.cursorOffset, false)
}

export function moveWordPrev(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = prevWordStart(text, textarea.cursorOffset, false)
}

export function moveWordEnd(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = wordEnd(text, textarea.cursorOffset, false)
}

export function moveBigWordNext(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = nextWordStart(text, textarea.cursorOffset, true)
}

export function moveBigWordPrev(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = prevWordStart(text, textarea.cursorOffset, true)
}

export function moveBigWordEnd(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = wordEnd(text, textarea.cursorOffset, true)
}

export function firstNonWhitespace(text: string, offset: number) {
  const start = lineStart(text, offset)
  const end = lineEnd(text, offset)
  let pos = start
  while (pos < end && /\s/.test(text[pos])) pos++
  return pos
}

export function findCharInLine(
  text: string,
  offset: number,
  char: string,
  forward: boolean,
  till = false,
  repeat = false,
) {
  const skip = till && repeat ? 2 : 1
  if (forward) {
    for (let i = offset + skip; i < text.length; i++) {
      if (text[i] === char) return till ? i - 1 : i
    }
  } else {
    for (let i = offset - skip; i >= 0; i--) {
      if (text[i] === char) return till ? i + 1 : i
    }
  }
  return offset
}

export function copyWordNext(rows: VimCopyRow[], get: (idx: number) => string, idx: number, col: number, big: boolean) {
  const row = rows[idx]
  if (!row) return { idx, col }
  const min = row.col
  const text = get(idx)
  const pos = Math.max(0, col - min)
  const next = nextWordStart(text, pos, big)
  if (next < text.length) return { idx, col: min + next }
  for (let i = idx + 1; i < rows.length; i++) {
    const nextRow = rows[i]
    if (!nextRow) continue
    const nextText = get(i)
    if (!nextText.length) return { idx: i, col: nextRow.col }
    const nextCol = nextWordStart(nextText, 0, big)
    if (nextCol < nextText.length) return { idx: i, col: nextRow.col + nextCol }
    if (nextText.length > 0) return { idx: i, col: nextRow.col + nextText.length - 1 }
  }
  return { idx, col: min + Math.max(0, text.length - 1) }
}

export function copyWordPrev(rows: VimCopyRow[], get: (idx: number) => string, idx: number, col: number, big: boolean) {
  const row = rows[idx]
  if (!row) return { idx, col }
  const min = row.col
  const text = get(idx)
  const pos = Math.max(0, col - min)
  const prev = prevWordStart(text, pos, big)
  if (prev < pos) return { idx, col: min + prev }
  for (let i = idx - 1; i >= 0; i--) {
    const prevRow = rows[i]
    if (!prevRow) continue
    const prevText = get(i)
    if (!prevText.length) return { idx: i, col: prevRow.col }
    const prevCol = prevWordStart(prevText, prevText.length, big)
    return { idx: i, col: prevRow.col + prevCol }
  }
  return { idx, col: min }
}

export function appendAfterCursor(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const end = lineEnd(text, textarea.cursorOffset)
  textarea.cursorOffset = Math.min(textarea.cursorOffset + 1, end)
}

export function appendLineEnd(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = lineEnd(text, textarea.cursorOffset)
}

export function insertLineStart(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = firstNonWhitespace(text, textarea.cursorOffset)
}

export function openLineBelow(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const end = lineEnd(text, textarea.cursorOffset)
  textarea.cursorOffset = end
  textarea.insertText("\n")
}

export function openLineAbove(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const start = lineStart(text, textarea.cursorOffset)
  textarea.cursorOffset = start
  textarea.insertText("\n")
  textarea.cursorOffset = start
}

export function deleteUnderCursor(textarea: TextareaRenderable): VimRegister {
  const text = textarea.plainText
  const startOffset = textarea.cursorOffset
  const end = lineEnd(text, startOffset)
  if (startOffset >= end) return null
  const yanked = text[startOffset]
  deleteOffsets(textarea, startOffset, startOffset + 1)
  return { text: yanked, linewise: false }
}

export function deleteWord(textarea: TextareaRenderable): VimRegister {
  const text = textarea.plainText
  const startOffset = textarea.cursorOffset
  const endOffset = nextWordStart(text, startOffset, false)
  if (endOffset <= startOffset) return null
  const yanked = text.slice(startOffset, endOffset)
  deleteOffsets(textarea, startOffset, endOffset)
  return { text: yanked, linewise: false }
}

export function deleteWordBackward(textarea: TextareaRenderable): VimRegister {
  const text = textarea.plainText
  const startOffset = textarea.cursorOffset
  const endOffset = prevWordStart(text, startOffset, false)
  if (endOffset >= startOffset) return null
  const yanked = text.slice(endOffset, startOffset)
  deleteOffsets(textarea, endOffset, startOffset)
  return { text: yanked, linewise: false }
}

export function deleteLine(textarea: TextareaRenderable): VimRegister {
  const text = textarea.plainText
  if (!text.length) return null

  const offset = textarea.cursorOffset
  const start = lineStart(text, offset)
  const end = lineEnd(text, offset)
  const yanked = text.slice(start, end)

  if (end < text.length) {
    deleteOffsets(textarea, start, end + 1)
    return { text: yanked, linewise: true }
  }

  if (start > 0) {
    deleteOffsets(textarea, start - 1, end)
    textarea.cursorOffset = lineStart(textarea.plainText, textarea.cursorOffset)
    return { text: yanked, linewise: true }
  }

  deleteOffsets(textarea, start, end)
  return { text: yanked, linewise: true }
}

export function deleteLineEnd(textarea: TextareaRenderable): VimRegister {
  const text = textarea.plainText
  const start = textarea.cursorOffset
  const end = lineEnd(text, start)
  if (end <= start) return null
  const yanked = text.slice(start, end)
  deleteOffsets(textarea, start, end)
  textarea.cursorOffset = lineLast(textarea.plainText, start)
  return { text: yanked, linewise: false }
}

export function findChar(textarea: TextareaRenderable, char: string, forward: boolean, till = false, repeat = false) {
  const text = textarea.plainText
  const offset = textarea.cursorOffset
  const skip = till && repeat ? 2 : 1
  if (forward) {
    const end = lineEnd(text, offset)
    for (let i = offset + skip; i < end; i++) {
      if (text[i] === char) {
        textarea.cursorOffset = till ? i - 1 : i
        return
      }
    }
  } else {
    const start = lineStart(text, offset)
    for (let i = offset - skip; i >= start; i--) {
      if (text[i] === char) {
        textarea.cursorOffset = till ? i + 1 : i
        return
      }
    }
  }
}

export function joinLines(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const end = lineEnd(text, textarea.cursorOffset)
  if (end >= text.length) return
  let next = end + 1
  while (next < text.length && (text[next] === " " || text[next] === "\t")) next++
  const trailing = end > 0 && /[ \t]/.test(text[end - 1])
  const paren = next < text.length && text[next] === ")"
  deleteOffsets(textarea, end, next)
  if (!trailing && !paren) textarea.insertText(" ")
  textarea.cursorOffset = end
}

export function substituteLine(textarea: TextareaRenderable): VimRegister {
  const text = textarea.plainText
  const start = lineStart(text, textarea.cursorOffset)
  const end = lineEnd(text, textarea.cursorOffset)
  if (end <= start) return null
  const yanked = text.slice(start, end)
  deleteOffsets(textarea, start, end)
  return { text: yanked, linewise: true }
}

export function replaceUnderCursor(textarea: TextareaRenderable, value: string) {
  const text = textarea.plainText
  const offset = textarea.cursorOffset
  if (offset >= text.length || text[offset] === "\n") {
    textarea.insertText(value)
    return
  }
  deleteOffsets(textarea, offset, offset + 1)
  textarea.insertText(value)
}

export function toggleCase(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const start = textarea.cursorOffset
  const end = lineEnd(text, start)
  if (start >= end) return
  const char = text[start]
  const next = swap(char)
  if (next !== char) {
    deleteOffsets(textarea, start, start + 1)
    textarea.insertText(next)
    textarea.cursorOffset = start
  }
  moveRight(textarea)
}

export function yankLine(textarea: TextareaRenderable): VimRegister {
  const span = yankLineSpan(textarea)
  return { text: textarea.plainText.slice(span.start, span.end), linewise: true }
}

export function yankLineSpan(textarea: TextareaRenderable): VimSpan {
  const text = textarea.plainText
  const start = lineStart(text, textarea.cursorOffset)
  const end = lineEnd(text, textarea.cursorOffset)
  return { start, end }
}

export function yankWord(textarea: TextareaRenderable): VimRegister {
  const span = yankWordSpan(textarea)
  if (!span) return null
  return { text: textarea.plainText.slice(span.start, span.end), linewise: false }
}

export function yankWordSpan(textarea: TextareaRenderable): VimSpan | null {
  const text = textarea.plainText
  const start = textarea.cursorOffset
  const end = nextWordStart(text, start, false)
  if (end <= start) return null
  return { start, end }
}

export function pasteAfter(textarea: TextareaRenderable, reg: VimRegister) {
  if (!reg) return
  if (reg.linewise) {
    const text = textarea.plainText
    const end = lineEnd(text, textarea.cursorOffset)
    textarea.cursorOffset = end
    textarea.insertText("\n" + reg.text)
    textarea.cursorOffset = end + 1
    return
  }
  textarea.cursorOffset = Math.min(textarea.cursorOffset + 1, textarea.plainText.length)
  textarea.insertText(reg.text)
  textarea.cursorOffset = textarea.cursorOffset - 1
}

export function pasteBefore(textarea: TextareaRenderable, reg: VimRegister) {
  if (!reg) return
  if (reg.linewise) {
    const text = textarea.plainText
    const start = lineStart(text, textarea.cursorOffset)
    textarea.cursorOffset = start
    textarea.insertText(reg.text + "\n")
    textarea.cursorOffset = start
    return
  }
  textarea.insertText(reg.text)
  textarea.cursorOffset = textarea.cursorOffset - 1
}

export function syncSelection(textarea: TextareaRenderable, anchor: number, linewise = false) {
  const text = textarea.plainText
  const cursor = textarea.cursorOffset
  let lo = Math.min(anchor, cursor)
  let hi = Math.max(anchor + 1, cursor + 1)
  if (linewise) {
    lo = lineStart(text, lo)
    hi = lineEnd(text, hi - 1)
    if (hi < text.length) hi++
  }
  const ta = textarea as any
  const forward = cursor >= anchor
  textarea.cursorOffset = forward ? lo : hi
  ta.updateSelectionForMovement(true, true)
  textarea.cursorOffset = forward ? hi : lo
  ta.updateSelectionForMovement(true, false)
  textarea.cursorOffset = cursor
  textarea.editorView.setSelection(lo, hi)
}

export function clearSelection(textarea: TextareaRenderable) {
  const ta = textarea as any
  ta.updateSelectionForMovement(false, true)
  textarea.editorView.resetSelection()
}

function selectionRange(textarea: TextareaRenderable, anchor?: number, linewise = false) {
  if (anchor === undefined) return null
  let start = Math.min(anchor, textarea.cursorOffset)
  let end = Math.max(anchor + 1, textarea.cursorOffset + 1)
  if (linewise) {
    const text = textarea.plainText
    start = lineStart(text, start)
    end = lineEnd(text, end - 1)
    if (end < text.length) end++
  }
  return { start, end }
}

export function toggleSelectionCase(textarea: TextareaRenderable, linewise = false, anchor?: number) {
  const sel = selectionRange(textarea, anchor, linewise)
  if (!sel) return
  const text = textarea.plainText.slice(sel.start, sel.end)
  const next = text.split("").map(swap).join("")
  if (next !== text) {
    deleteOffsets(textarea, sel.start, sel.end)
    textarea.insertText(next)
  }
  textarea.cursorOffset = sel.start
}

export function deleteSelection(textarea: TextareaRenderable, linewise = false, anchor?: number): VimRegister {
  const sel = selectionRange(textarea, anchor, linewise)
  if (!sel) return null
  const text = textarea.plainText
  const yanked = text.slice(sel.start, sel.end)

  let start = sel.start
  let end = sel.end
  // ensure delete complete lines to avoid leaving empty lines
  if (linewise) {
    const hasTrailingNl = end < text.length && text[end - 1] === "\n"
    const hasLeadingNl = start > 0 && text[start - 1] === "\n"
    if (!hasTrailingNl && end < text.length && text[end] === "\n") {
      end++
    } else if (!hasTrailingNl && hasLeadingNl) {
      start--
    }
  }

  deleteOffsets(textarea, start, end)

  const after = textarea.plainText
  if (linewise) {
    if (start >= after.length && start > 0) {
      textarea.cursorOffset = lineStart(after, after.length - 1)
    } else {
      textarea.cursorOffset = lineStart(after, Math.min(start, Math.max(after.length - 1, 0)))
    }
  } else {
    textarea.cursorOffset = Math.min(start, Math.max(after.length - 1, 0))
  }
  return { text: yanked, linewise }
}

export function yankSelection(textarea: TextareaRenderable, linewise = false, anchor?: number): VimRegister {
  const sel = selectionRange(textarea, anchor, linewise)
  if (!sel) return null
  return { text: textarea.plainText.slice(sel.start, sel.end), linewise }
}
