import { describe, expect, test } from "bun:test"
import { createModalInputControls, type ModalInputKeyEvent, type ModalInputMode } from "../src/ui/modal-input-controls"

function key(name: string, input?: { sequence?: string; shift?: boolean; ctrl?: boolean }) {
  let prevented = false
  return {
    name,
    sequence: input?.sequence,
    shift: input?.shift,
    ctrl: input?.ctrl,
    preventDefault() {
      prevented = true
    },
    get defaultPrevented() {
      return prevented
    },
  } as ModalInputKeyEvent
}

function createControls(input?: { mode?: ModalInputMode; text?: string; cursor?: number }) {
  let mode = input?.mode ?? "normal"
  let text = input?.text ?? ""
  let cursor = input?.cursor ?? 0
  const moves: number[] = []
  const controls = createModalInputControls({
    mode: () => mode,
    setMode: (next) => (mode = next),
    move: (direction) => moves.push(direction),
    moveToStart: () => moves.push(-100),
    moveToEnd: () => moves.push(100),
    focus() {},
    text: () => text,
    cursor: () => cursor,
    setCursor: (next) => (cursor = next),
    setText: (next) => (text = next),
  })

  return { controls, moves, mode: () => mode, cursor: () => cursor, text: () => text }
}

describe("modal input controls", () => {
  test("uses escape to enter normal mode and j/k to move selection", () => {
    const state = createControls({ mode: "insert" })

    const escape = key("escape")
    expect(state.controls.handleKey(escape)).toBe(true)
    expect(escape.defaultPrevented).toBe(true)
    expect(state.mode()).toBe("normal")

    state.controls.handleKey(key("j"))
    state.controls.handleKey(key("k"))
    expect(state.moves).toEqual([1, -1])
  })

  test("keeps ctrl bindings available for the outer keymap", () => {
    const state = createControls()
    const event = key("n", { ctrl: true })

    expect(state.controls.handleKey(event)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  })

  test("clears pending text motions before entering insert mode", () => {
    const state = createControls({ text: "alpha", cursor: 2 })

    state.controls.handleKey(key("d"))
    state.controls.handleKey(key("i"))
    state.controls.handleKey(key("escape"))
    state.controls.handleKey(key("d"))

    expect(state.text()).toBe("alpha")
  })

  test("clamps insert cursor when entering normal mode", () => {
    const state = createControls({ mode: "insert", text: "alpha", cursor: 5 })

    state.controls.handleKey(key("escape"))

    expect(state.mode()).toBe("normal")
    expect(state.cursor()).toBe(4)
  })

  test("clears pending picker motions before passing ctrl bindings to the outer keymap", () => {
    const state = createControls()

    state.controls.handleKey(key("g"))
    state.controls.handleKey(key("n", { ctrl: true }))
    state.controls.handleKey(key("g"))
    expect(state.moves).toEqual([])
  })

  test("supports gg and G jumps", () => {
    const state = createControls()

    state.controls.handleKey(key("g"))
    state.controls.handleKey(key("g"))
    state.controls.handleKey(key("g", { sequence: "G", shift: true }))
    expect(state.moves).toEqual([-100, 100])
  })

  test("supports basic cursor motions", () => {
    const state = createControls({ text: "alpha beta gamma", cursor: 6 })

    state.controls.handleKey(key("h"))
    expect(state.cursor()).toBe(5)
    state.controls.handleKey(key("l"))
    expect(state.cursor()).toBe(6)
    state.controls.handleKey(key("w"))
    expect(state.cursor()).toBe(11)
    state.controls.handleKey(key("b"))
    expect(state.cursor()).toBe(6)
    state.controls.handleKey(key("e"))
    expect(state.cursor()).toBe(9)
    state.controls.handleKey(key("0"))
    expect(state.cursor()).toBe(0)
    state.controls.handleKey(key("4", { sequence: "$", shift: true }))
    expect(state.cursor()).toBe(15)
  })

  test("supports I and A insert motions", () => {
    const state = createControls({ text: "alpha", cursor: 2 })

    state.controls.handleKey(key("i", { sequence: "I", shift: true }))
    expect(state.cursor()).toBe(0)
    expect(state.mode()).toBe("insert")

    const next = createControls({ text: "alpha", cursor: 2 })
    next.controls.handleKey(key("a", { sequence: "A", shift: true }))
    expect(next.cursor()).toBe(5)
    expect(next.mode()).toBe("insert")
  })
})
