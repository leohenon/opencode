import { describe, expect, test } from "bun:test"
import path from "path"

const file = path.join(import.meta.dir, "../../src/plugin/index.ts")

describe("plugin builtin auth loading", () => {
  test("includes builtin anthropic auth plugin in runtime plugin list", async () => {
    const src = await Bun.file(file).text()

    expect(src).toContain('const BUILTIN = ["op-anthropic-auth@0.0.2"]')
    expect(src).toContain("return Config.deduplicatePlugins([...BUILTIN, ...(list ?? [])])")
    expect(src).toContain("const plugins = Plugin.plugins(cfg.plugin, Flag.OPENCODE_PURE)")
  })
})
