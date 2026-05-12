import { describe, expect, test } from "bun:test"
import { createTestKeymap } from "@opentui/keymap/testing"
import { VIM_WINDOW_TOKEN } from "../../../../src/cli/cmd/tui/keymap"

describe("opencode keymap", () => {
  test("vim window token sequences can override exact ctrl+w input bindings by priority", () => {
    const testKeymap = createTestKeymap({ defaultKeys: true })
    const calls: string[] = []

    testKeymap.keymap.registerToken({ name: VIM_WINDOW_TOKEN, key: "ctrl+w" })
    testKeymap.keymap.registerLayer({
      bindings: [{ key: "ctrl+w", cmd: () => void calls.push("delete-word-backward") }],
    })
    testKeymap.keymap.registerLayer({
      priority: 100,
      bindings: [{ key: `<${VIM_WINDOW_TOKEN}>k`, cmd: () => void calls.push("copy-mode") }],
    })

    testKeymap.host.press("w", { ctrl: true })
    expect(calls).toEqual([])
    expect(testKeymap.keymap.getPendingSequence().map((item) => item.display)).toEqual([`<${VIM_WINDOW_TOKEN}>`])

    testKeymap.host.press("k")
    expect(calls).toEqual(["copy-mode"])
  })

  test("vim window token supports holding ctrl for the second w", () => {
    const testKeymap = createTestKeymap({ defaultKeys: true })
    const calls: string[] = []

    testKeymap.keymap.registerToken({ name: VIM_WINDOW_TOKEN, key: "ctrl+w" })
    testKeymap.keymap.registerLayer({
      bindings: [{ key: "ctrl+w", cmd: () => void calls.push("delete-word-backward") }],
    })
    testKeymap.keymap.registerLayer({
      priority: 100,
      bindings: [{ key: `<${VIM_WINDOW_TOKEN}><${VIM_WINDOW_TOKEN}>`, cmd: () => void calls.push("toggle-copy") }],
    })

    testKeymap.host.press("w", { ctrl: true })
    testKeymap.host.press("w", { ctrl: true })

    expect(calls).toEqual(["toggle-copy"])
    expect(testKeymap.keymap.getPendingSequence()).toEqual([])
  })

  test("copy mode ctrl scroll bindings can claim keys before global bindings", () => {
    const testKeymap = createTestKeymap({ defaultKeys: true })
    const calls: string[] = []
    const keys = ["ctrl+d", "ctrl+u", "ctrl+f", "ctrl+b", "ctrl+e", "ctrl+y"]

    testKeymap.keymap.registerLayer({
      bindings: keys.map((key) => ({ key, cmd: () => void calls.push(`global:${key}`) })),
    })
    testKeymap.keymap.registerLayer({
      priority: 100,
      bindings: keys.map((key) => ({ key, cmd: () => void calls.push(`copy:${key}`) })),
    })

    for (const key of ["d", "u", "f", "b", "e", "y"]) {
      testKeymap.host.press(key, { ctrl: true })
    }

    expect(calls).toEqual(keys.map((key) => `copy:${key}`))
  })
})
