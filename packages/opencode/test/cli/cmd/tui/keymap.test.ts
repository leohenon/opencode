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
})
