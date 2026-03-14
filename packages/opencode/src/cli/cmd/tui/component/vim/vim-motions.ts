import type { TextareaRenderable } from "@opentui/core"
import type { VimRegister } from "./vim-state"

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

function isWord(char: string) {
  return /[A-Za-z0-9_]/.test(char)
}

function isBigWord(char: string) {
  return !/\s/.test(char)
}

function nextWordStart(text: string, offset: number, big: boolean) {
  const match = big ? isBigWord : isWord
  let pos = offset
  if (pos < text.length && match(text[pos])) {
    while (pos < text.length && match(text[pos])) pos++
  }
  while (pos < text.length && !match(text[pos])) pos++
  return pos
}

function prevWordStart(text: string, offset: number, big: boolean) {
  const match = big ? isBigWord : isWord
  let pos = offset
  while (pos > 0 && !match(text[pos - 1])) pos--
  while (pos > 0 && match(text[pos - 1])) pos--
  return pos
}

function wordEnd(text: string, offset: number, big: boolean) {
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
  textarea.cursorOffset = startOffset
  const start = textarea.logicalCursor
  textarea.cursorOffset = endOffset
  const end = textarea.logicalCursor
  textarea.deleteRange(start.row, start.col, end.row, end.col)
  textarea.cursorOffset = startOffset
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

function firstNonWhitespace(text: string, offset: number) {
  const start = lineStart(text, offset)
  const end = lineEnd(text, offset)
  let pos = start
  while (pos < end && /\s/.test(text[pos])) pos++
  return pos
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

export function yankLine(textarea: TextareaRenderable): VimRegister {
  const text = textarea.plainText
  const start = lineStart(text, textarea.cursorOffset)
  const end = lineEnd(text, textarea.cursorOffset)
  return { text: text.slice(start, end), linewise: true }
}

export function yankWord(textarea: TextareaRenderable): VimRegister {
  const text = textarea.plainText
  const start = textarea.cursorOffset
  const end = nextWordStart(text, start, false)
  if (end <= start) return null
  return { text: text.slice(start, end), linewise: false }
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

export function syncSelection(textarea: TextareaRenderable, anchor: number) {
  const lo = Math.min(anchor, textarea.cursorOffset)
  const hi = Math.max(anchor + 1, textarea.cursorOffset + 1)
  textarea.editorView.setSelection(lo, hi)
}

export function clearSelection(textarea: TextareaRenderable) {
  textarea.editorView.resetSelection()
}

export function deleteSelection(textarea: TextareaRenderable): VimRegister {
  const sel = textarea.editorView.getSelection()
  if (!sel) return null
  const text = textarea.plainText.slice(sel.start, sel.end)
  textarea.editorView.deleteSelectedText()
  textarea.cursorOffset = sel.start
  return { text, linewise: false }
}

export function yankSelection(textarea: TextareaRenderable): VimRegister {
  const sel = textarea.editorView.getSelection()
  if (!sel) return null
  return { text: textarea.plainText.slice(sel.start, sel.end), linewise: false }
}
