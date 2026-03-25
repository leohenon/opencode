import { createEffect, createMemo, createSignal, type Accessor } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { Part } from "@opencode-ai/sdk/v2"
import { copyWordNext, copyWordPrev, firstNonWhitespace } from "@/cli/cmd/tui/component/vim/vim-motions"
import { Clipboard } from "../../util/clipboard"

export type CopyRow = {
  key: string
  id: string
  role: "user" | "assistant"
  kind: "user" | "text" | "reasoning" | "tool"
  part?: string
  tool?: string
  line: number
  y: number
  col: number
}

export type CopyHighlight = {
  line: number
  left: number
  right: number
  text: string
}

type CopyState = {
  active: boolean
  idx: number
  col: number
  stick: undefined | "start" | "first" | "end" | number
  visual: undefined | "char" | "line"
  anchor: undefined | { idx: number; col: number }
}

const empty: CopyState = {
  active: false,
  idx: -1,
  col: 0,
  stick: undefined,
  visual: undefined,
  anchor: undefined,
}

const segmenter = new Intl.Segmenter()

export function createCopyMode(input: {
  scroll: () => ScrollBoxRenderable
  messages: Accessor<{ id: string; role: string }[]>
  parts: (id: string) => Part[]
  thinking: () => boolean
  details: () => boolean
  session: Accessor<string>
  toBottom: () => void
}) {
  const [state, setState] = createSignal<CopyState>({ ...empty })

  // --- row building ---

  function rows(): CopyRow[] {
    const scroll = input.scroll()
    if (!scroll) return []

    const meta = new Map<
      string,
      {
        role: "user" | "assistant"
        kind: "user" | "text" | "reasoning" | "tool"
        part?: string
        tool?: string
      }
    >()

    for (const msg of input.messages()) {
      const parts = input.parts(msg.id)
      if (msg.role === "user") continue

      for (const part of parts) {
        if (part.type === "text") meta.set(`text-${part.id}`, { role: "assistant", kind: "text", part: part.id })
        if (part.type === "reasoning") {
          if (!input.thinking()) continue
          if (state().active) continue
          meta.set(`text-${part.id}`, { role: "assistant", kind: "reasoning", part: part.id })
        }
        if (part.type === "tool") {
          if (!input.details() && part.state.status === "completed") continue
          meta.set(`tool-${part.id}`, { role: "assistant", kind: "tool", part: part.id, tool: part.tool })
        }
      }
    }

    return scroll
      .getChildren()
      .toSorted((a, b) => a.y - b.y)
      .flatMap((child) => {
        if (!child.id) return []
        const m = meta.get(child.id)
        if (!m) return []

        const total = Math.max(1, Math.floor(child.height))
        const start = m.kind === "user" ? 1 : 0
        const end = m.kind === "user" ? Math.max(start, total - 1) : total
        const col = m.kind === "user" ? 2 : 3

        return Array.from({ length: Math.max(0, end - start) }, (_, i) => ({
          key: `${m.kind}:${child.id}:${i}`,
          id: child.id,
          role: m.role,
          kind: m.kind,
          part: m.part,
          tool: m.tool,
          line: i,
          y: child.y + start + i,
          col,
        }))
      })
  }

  // --- renderable tree helpers ---

  function findRenderables(node: any, y = 0, gutter = 0): { node: any; y: number; gutter: number }[] {
    if (node.lineInfo && node.plainText !== undefined) return [{ node, y, gutter }]
    const width = gutter || ("gutter" in node && node.gutter ? node.gutter.calculateWidth() : 0)
    const result: { node: any; y: number; gutter: number }[] = []
    for (const child of node.getChildren?.() ?? []) {
      if (child._positionType === "absolute") continue
      result.push(...findRenderables(child, y + Math.floor(child._y ?? 0), width))
    }
    return result
  }

  function sliceCols(text: string, start: number, width: number): string {
    if (start === 0 && width >= Bun.stringWidth(text)) return text
    let col = 0
    let begin = -1
    let end = text.length
    for (const seg of segmenter.segment(text)) {
      const w = Bun.stringWidth(seg.segment)
      if (begin < 0 && col + w > start) begin = seg.index
      col += w
      if (col >= start + width) {
        end = seg.index + seg.segment.length
        break
      }
    }
    if (begin < 0) begin = 0
    return text.slice(begin, end)
  }

  function childById(id: string, cache?: Map<string, any>) {
    if (cache) return cache.get(id)
    return input
      .scroll()
      .getChildren()
      .find((c) => c.id === id)
  }

  function copyLine(row: CopyRow, child: any): { text: string; col: number } {
    const entries = findRenderables(child)
    if (!entries.length) return { text: "", col: 0 }
    let match = entries[0]
    for (const entry of entries) {
      if (entry.y > row.line) break
      match = entry
    }
    if (typeof match.node.plainText !== "string") return { text: "", col: 0 }
    const local = row.line - match.y
    const lines = match.node.plainText.split("\n")
    const info = match.node.lineInfo
    if (info?.lineSources && local < info.lineSources.length) {
      const src = info.lineSources[local]
      const text = lines[src] ?? ""
      const wrapped = info.lineWraps?.[local] === 1 || info.lineSources[local + 1] === src
      if (!wrapped) return { text, col: match.gutter }
      let base = info.lineStartCols[local]
      for (let i = local - 1; i >= 0; i--) {
        if (info.lineSources[i] === src) base = info.lineStartCols[i]
        else break
      }
      const offset = info.lineStartCols[local] - base
      const width = info.lineWidthCols[local]
      return { text: sliceCols(text, offset, width), col: match.gutter }
    }
    if (local >= lines.length) return { text: "", col: match.gutter }
    return { text: lines[local] ?? "", col: match.gutter }
  }

  function shift(row?: CopyRow, gutter?: number) {
    if (row?.kind !== "tool") return 0
    if (row.tool !== "edit" && row.tool !== "apply_patch") return 0
    if (!gutter) return 0
    return 1
  }

  function copySign(row: CopyRow, cache?: Map<string, any>): string | undefined {
    if (row.kind !== "tool") return undefined
    if (row.tool !== "edit" && row.tool !== "apply_patch") return undefined
    const child = childById(row.id, cache)
    if (!child) return undefined
    const entries = findRenderables(child)
    if (!entries.length) return undefined
    let match = entries[0]
    for (const entry of entries) {
      if (entry.y > row.line) break
      match = entry
    }
    const local = row.line - match.y
    const info = match.node.lineInfo
    const src = info?.lineSources ? (info.lineSources[local] ?? local) : local
    const signs = match.node.parent?.getLineSigns?.() as Map<number, { after?: string }> | undefined
    if (!signs) return undefined
    const sign = signs.get(src)
    return sign?.after?.trim()
  }

  function copyMin(row?: CopyRow, cache?: Map<string, any>): number {
    if (!row) return 0
    const child = childById(row.id, cache)
    if (!child) return row.col
    const line = copyLine(row, child)
    return row.col + line.col + shift(row, line.col)
  }

  function rowPadded(row: CopyRow, cache?: Map<string, any>): string {
    const child = childById(row.id, cache)
    if (!child) return ""
    const line = copyLine(row, child)
    return " ".repeat(row.col + line.col + shift(row, line.col)) + line.text
  }

  function rowText(row: CopyRow, cache?: Map<string, any>): string {
    const child = childById(row.id, cache)
    if (!child) return ""
    return copyLine(row, child).text ?? ""
  }

  function signedText(row: CopyRow, cache?: Map<string, any>): string {
    const sign = copySign(row, cache)
    const text = rowText(row, cache)
    if (!sign) return text
    return sign + text
  }

  // --- stick / column ---

  function resolveStick(row: CopyRow, stick: CopyState["stick"], cache?: Map<string, any>): number {
    const scroll = input.scroll()
    const min = copyMin(row, cache)
    const text = rowPadded(row, cache)
    const max = text.length > 0 ? Math.min(scroll.width - 2, text.length - 1) : min
    if (stick === "start") return min
    if (stick === "first") return Math.max(min, Math.min(max, firstNonWhitespace(text, 0)))
    if (stick === "end") return max
    if (typeof stick === "number") return Math.max(min, Math.min(max, min + stick))
    return min
  }

  function copyText(): string {
    const s = state()
    if (!s.active) return ""
    const row = rows()[s.idx]
    if (!row) return ""
    return rowPadded(row)
  }

  function col(): number {
    return state().col
  }

  function setCol(offset: number) {
    const scroll = input.scroll()
    const row = rows()[state().idx]
    const min = copyMin(row)
    const text = copyText()
    const max = text.length > 0 ? Math.min(scroll.width - 2, text.length - 1) : min
    const c = Math.max(min, Math.min(max, offset))
    setState((s) => ({ ...s, col: c, stick: c - min }))
  }

  function setStick(stick: "start" | "first" | "end") {
    setState((s) => ({ ...s, stick }))
  }

  // --- navigation ---

  function sync(next: number) {
    const scroll = input.scroll()
    const list = rows()
    if (!list.length) {
      setState({ ...empty })
      return
    }
    const idx = Math.max(0, Math.min(next, list.length - 1))
    setState((s) => ({ ...s, active: true, idx }))
    const row = list[idx]
    if (!row) return
    const y = row.y
    const top = scroll.y
    const bottom = scroll.y + scroll.height - 1
    if (y < top) {
      scroll.scrollBy(y - top)
      return
    }
    if (y > bottom) {
      scroll.scrollBy(y - bottom)
    }
  }

  function enter() {
    const init = () => {
      const list = rows()
      if (!list.length) return false
      const idx = list.findLastIndex((x) => x.role === "assistant")
      const target = idx >= 0 ? idx : list.length - 1
      const row = list[target]
      setState((s) => ({ ...s, col: copyMin(row), stick: "first" as const }))
      sync(target)
      return true
    }
    if (init()) return
    setTimeout(() => {
      init()
    }, 0)
  }

  function exit() {
    setState({ ...empty })
    input.toBottom()
  }

  function move(action: "up" | "down" | "left" | "right") {
    const scroll = input.scroll()
    const s = state()
    if (!s.active) return
    if (action === "up" || action === "down") {
      sync(s.idx + (action === "up" ? -1 : 1))
      const row = rows()[state().idx]
      if (!row) return
      const c = resolveStick(row, s.stick)
      setState((prev) => ({ ...prev, col: c }))
      return
    }
    if (action === "left") {
      const row = rows()[s.idx]
      const min = copyMin(row)
      const c = Math.max(min, s.col - 1)
      setState((prev) => ({ ...prev, col: c, stick: c - min }))
      return
    }
    const row = rows()[s.idx]
    const min = copyMin(row)
    const text = copyText()
    const max = text.length > 0 ? Math.min(scroll.width - 2, text.length - 1) : min
    const c = Math.min(max, s.col + 1)
    setState((prev) => ({ ...prev, col: c, stick: c - min }))
  }

  function wordNext(big: boolean) {
    const s = state()
    if (!s.active) return false
    const list = rows()
    if (!list.length) return false
    const next = copyWordNext(list, (idx) => rowText(list[idx]!), s.idx, s.col, big)
    if (next.idx === s.idx && next.col === s.col) return false
    if (next.idx !== s.idx) sync(next.idx)
    setCol(next.col)
    return true
  }

  function wordPrev(big: boolean) {
    const s = state()
    if (!s.active) return false
    const list = rows()
    if (!list.length) return false
    const prev = copyWordPrev(list, (idx) => rowText(list[idx]!), s.idx, s.col, big)
    if (prev.idx === s.idx && prev.col === s.col) return false
    if (prev.idx !== s.idx) sync(prev.idx)
    setCol(prev.col)
    return true
  }

  // --- visual ---

  function visual(mode: "char" | "line") {
    const s = state()
    if (!s.active) return
    if (s.visual === mode) {
      exitVisual()
      return
    }
    setState((prev) => ({
      ...prev,
      visual: mode,
      anchor: { idx: prev.idx, col: prev.col },
    }))
  }

  function exitVisual() {
    setState((s) => ({ ...s, visual: undefined, anchor: undefined }))
  }

  function selectionText(): string {
    const s = state()
    if (!s.visual || !s.anchor) return ""
    const list = rows()
    const cache = new Map(
      input
        .scroll()
        .getChildren()
        .map((c) => [c.id, c]),
    )
    const a = s.anchor
    const h = { idx: s.idx, col: s.col }
    const start = a.idx <= h.idx ? a : h
    const end = a.idx <= h.idx ? h : a
    if (s.visual === "line") {
      return Array.from({ length: end.idx - start.idx + 1 }, (_, i) => list[start.idx + i])
        .filter((row): row is CopyRow => !!row)
        .map((row) => signedText(row, cache))
        .join("\n")
    }
    if (start.idx === end.idx) {
      const row = list[start.idx]
      if (!row) return ""
      const text = rowText(row, cache)
      const min = copyMin(row, cache)
      return text.slice(Math.max(0, start.col - min), Math.max(0, end.col - min + 1))
    }
    return Array.from({ length: end.idx - start.idx + 1 }, (_, i) => ({ row: list[start.idx + i], i: start.idx + i }))
      .filter((x): x is { row: CopyRow; i: number } => !!x.row)
      .map((x) => {
        const text = rowText(x.row, cache)
        const min = copyMin(x.row, cache)
        if (x.i === start.idx) return text.slice(Math.max(0, start.col - min))
        if (x.i === end.idx) return text.slice(0, Math.max(0, end.col - min + 1))
        return signedText(x.row, cache)
      })
      .join("\n")
  }

  function yank() {
    const text = selectionText()
    if (!text) return null
    return { text, linewise: false }
  }

  async function copy() {
    const text = selectionText()
    if (!text) return
    await Clipboard.copy(text)
  }

  // --- jumps ---

  function jump(action: "top" | "bottom" | "high" | "middle" | "low") {
    const scroll = input.scroll()
    const list = rows()
    if (!list.length) return
    if (action === "top" || action === "bottom") {
      sync(action === "top" ? 0 : list.length - 1)
      const row = rows()[state().idx]
      if (!row) return
      const c = resolveStick(row, state().stick)
      setState((s) => ({ ...s, col: c }))
      return
    }
    const top = scroll.y
    const bottom = scroll.y + scroll.height - 1
    const first = list.findIndex((r) => r.y >= top && r.y <= bottom)
    const last = list.findLastIndex((r) => r.y >= top && r.y <= bottom)
    if (first < 0) return
    let target = first
    if (action === "low") target = last
    if (action === "middle") target = Math.round((first + last) / 2)
    sync(target)
    const row = rows()[state().idx]
    if (!row) return
    const c = resolveStick(row, state().stick)
    setState((s) => ({ ...s, col: c }))
  }

  function scroll(action: "center" | "top" | "bottom") {
    const scr = input.scroll()
    const s = state()
    if (!s.active) return
    const row = rows()[s.idx]
    if (!row) return
    if (action === "top") scr.scrollBy(row.y - scr.y)
    if (action === "center") scr.scrollBy(row.y - scr.y - Math.floor(scr.height / 2))
    if (action === "bottom") scr.scrollBy(row.y - scr.y - scr.height + 1)
  }

  function clamp(delta: number) {
    const scr = input.scroll()
    if (!state().active) return
    const list = rows()
    if (!list.length) return
    const s = state()
    const idx = Math.max(0, Math.min(s.idx, list.length - 1))
    const row = list[idx]
    if (!row) return
    const top = scr.y
    const bottom = scr.y + scr.height - 1
    if (row.y >= top && row.y <= bottom) return
    const first = list.findIndex((r) => r.y >= top && r.y <= bottom)
    const last = list.findLastIndex((r) => r.y >= top && r.y <= bottom)
    let target = -1
    if (row.y < top && first >= 0) target = first
    if (row.y > bottom && last >= 0) target = last
    if (target < 0 && delta > 0) {
      target = list.findIndex((r) => r.y > bottom)
      if (target < 0) target = list.findLastIndex((r) => r.y < top)
    }
    if (target < 0 && delta < 0) {
      target = list.findLastIndex((r) => r.y < top)
      if (target < 0) target = list.findIndex((r) => r.y > bottom)
    }
    if (target < 0) return
    const resolved = list[target]
    if (!resolved) return
    const c = resolveStick(resolved, s.stick)
    setState((prev) => ({ ...prev, idx: target, col: c }))
  }

  // --- effects ---

  createEffect((prev: string | undefined) => {
    const id = input.session()
    if (prev !== undefined && prev !== id) exit()
    return id
  })

  createEffect(() => {
    const s = state()
    const list = rows()
    if (!s.active) return
    if (!list.length) {
      exit()
      return
    }
    if (s.idx >= list.length) {
      sync(list.length - 1)
    }
  })

  // --- derived ---

  const row = createMemo(() => {
    const s = state()
    if (!s.active) return undefined
    return rows()[s.idx]
  })

  const highlights = createMemo(() => {
    const s = state()
    if (!s.visual || !s.anchor) return new Map<string, CopyHighlight[]>()
    const list = rows()
    const cache = new Map(
      input
        .scroll()
        .getChildren()
        .map((c) => [c.id, c]),
    )
    const a = s.anchor
    const h = { idx: s.idx, col: s.col }
    const start = a.idx <= h.idx ? a : h
    const end = a.idx <= h.idx ? h : a
    const out = new Map<string, CopyHighlight[]>()
    for (let i = start.idx; i <= end.idx; i++) {
      const r = list[i]
      if (!r) continue
      const min = copyMin(r, cache)
      const text = rowText(r, cache) || ""
      const max = text.length > 0 ? min + text.length - 1 : min
      const left =
        s.visual === "line" ? min : i === start.idx && i === end.idx ? start.col : i === start.idx ? start.col : min
      const right =
        s.visual === "line" ? max : i === start.idx && i === end.idx ? end.col : i === end.idx ? end.col : max
      const cur = out.get(r.id) ?? []
      cur.push({
        line: r.line,
        left,
        right,
        text: text.slice(Math.max(0, left - min), Math.max(0, right - min + 1)),
      })
      out.set(r.id, cur)
    }
    return out
  })

  return {
    prompt: {
      enter,
      exit,
      visual,
      yank,
      copy,
      isVisual: () => !!state().visual,
      exitVisual,
      visualMode: () => state().visual,
      move,
      jump,
      wordNext,
      wordPrev,
      text: copyText,
      col,
      setCol,
      setStick,
      scroll,
      active: () => state().active,
    },
    row,
    highlights,
    active: () => state().active,
    clamp,
    state,
  }
}
