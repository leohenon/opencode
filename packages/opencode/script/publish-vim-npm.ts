#!/usr/bin/env bun

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const file = fileURLToPath(import.meta.url)
const root = path.resolve(path.dirname(file), "..")
process.chdir(root)

const version = process.env.OPENCODE_VERSION
if (!version) {
  throw new Error("OPENCODE_VERSION is required")
}

const tag = process.env.OCV_NPM_TAG || "latest"
const tries = 6
const dist = path.join(root, "dist")
const out = path.join(dist, "npm")
const bins = fs
  .readdirSync(dist, { withFileTypes: true })
  .filter((item) => item.isDirectory() && item.name.startsWith("opencode-"))
  .map((item) => item.name)

if (!bins.length) {
  throw new Error("No built binaries found in dist/")
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function exists(name: string, version: string) {
  const result = await $`npm view ${`${name}@${version}`} version --json`.nothrow()
  return result.exitCode === 0
}

async function publish(dir: string, name: string, version: string) {
  if (await exists(name, version)) {
    console.log(`skip ${name}@${version} (already published)`)
    return
  }

  for (let i = 0; i < tries; i++) {
    const result = await $`npm publish *.tgz --access public --tag ${tag}`.cwd(dir).nothrow()
    if (result.exitCode === 0) {
      console.log(`published ${name}@${version}`)
      return
    }

    const err = result.stderr.toString() + "\n" + result.stdout.toString()
    if (err.includes("cannot publish over the previously published versions")) {
      console.log(`skip ${name}@${version} (already published)`)
      return
    }
    if (err.includes("EPUBLISHCONFLICT")) {
      console.log(`skip ${name}@${version} (publish conflict)`)
      return
    }

    const limited = err.includes("E429") || err.includes("429 Too Many Requests") || err.includes("rate limited")
    if (!limited || i === tries - 1) {
      throw new Error(`failed to publish ${name}@${version}: ${err}`)
    }

    const ms = 5000 * 2 ** i
    console.log(`rate limited publishing ${name}@${version}, retrying in ${ms}ms`)
    await wait(ms)
  }
}

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

const deps: Record<string, string> = {}
for (const name of bins) {
  const src = path.join(dist, name)
  const pkg = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8"))
  const next = name.replace(/^opencode-/, "ocv-")
  const dir = path.join(out, next)

  fs.cpSync(src, dir, { recursive: true })
  pkg.name = next
  pkg.version = version
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n")

  if (process.platform !== "win32") {
    await $`chmod -R 755 .`.cwd(dir)
  }

  await $`bun pm pack`.cwd(dir)
  await publish(dir, next, version)
  deps[next] = version
}

const pkg = {
  name: "@leohenon/ocv",
  version,
  license: "MIT",
  repository: {
    type: "git",
    url: "https://github.com/leohenon/opencode",
  },
  bugs: {
    url: "https://github.com/leohenon/opencode/issues",
  },
  bin: {
    ocv: "./bin/ocv",
  },
  optionalDependencies: deps,
}

const launcher = `#!/usr/bin/env node

const childProcess = require("child_process")
const fs = require("fs")
const path = require("path")
const os = require("os")

function run(target) {
  const result = childProcess.spawnSync(target, process.argv.slice(2), {
    stdio: "inherit",
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  const code = typeof result.status === "number" ? result.status : 0
  process.exit(code)
}

const envPath = process.env.OCV_BIN_PATH
if (envPath) run(envPath)

const scriptPath = fs.realpathSync(__filename)
const scriptDir = path.dirname(scriptPath)

const cached = path.join(scriptDir, ".ocv")
if (fs.existsSync(cached)) run(cached)

const platformMap = { darwin: "darwin", linux: "linux", win32: "windows" }
const archMap = { x64: "x64", arm64: "arm64", arm: "arm" }
let platform = platformMap[os.platform()] || os.platform()
let arch = archMap[os.arch()] || os.arch()
const base = "ocv-" + platform + "-" + arch
const binary = platform === "windows" ? "opencode.exe" : "opencode"

function supportsAvx2() {
  if (arch !== "x64") return false
  if (platform === "linux") {
    try {
      return /(^|\\s)avx2(\\s|$)/i.test(fs.readFileSync("/proc/cpuinfo", "utf8"))
    } catch {
      return false
    }
  }
  if (platform === "darwin") {
    try {
      const result = childProcess.spawnSync("sysctl", ["-n", "hw.optional.avx2_0"], {
        encoding: "utf8",
        timeout: 1500,
      })
      if (result.status !== 0) return false
      return (result.stdout || "").trim() === "1"
    } catch {
      return false
    }
  }
  if (platform === "windows") {
    const cmd = '(Add-Type -MemberDefinition "[DllImport(""kernel32.dll"")] public static extern bool IsProcessorFeaturePresent(int ProcessorFeature);" -Name Kernel32 -Namespace Win32 -PassThru)::IsProcessorFeaturePresent(40)'
    for (const exe of ["powershell.exe", "pwsh.exe", "pwsh", "powershell"]) {
      try {
        const result = childProcess.spawnSync(exe, ["-NoProfile", "-NonInteractive", "-Command", cmd], {
          encoding: "utf8",
          timeout: 3000,
          windowsHide: true,
        })
        if (result.status !== 0) continue
        const out = (result.stdout || "").trim().toLowerCase()
        if (out === "true" || out === "1") return true
        if (out === "false" || out === "0") return false
      } catch {
        continue
      }
    }
    return false
  }
  return false
}

const names = (() => {
  const avx2 = supportsAvx2()
  const baseline = arch === "x64" && !avx2
  if (platform === "linux") {
    const musl = (() => {
      try {
        if (fs.existsSync("/etc/alpine-release")) return true
      } catch {}
      try {
        const result = childProcess.spawnSync("ldd", ["--version"], { encoding: "utf8" })
        const text = ((result.stdout || "") + (result.stderr || "")).toLowerCase()
        if (text.includes("musl")) return true
      } catch {}
      return false
    })()
    if (musl) {
      if (arch === "x64") {
        if (baseline) return [base + "-baseline-musl", base + "-musl", base + "-baseline", base]
        return [base + "-musl", base + "-baseline-musl", base, base + "-baseline"]
      }
      return [base + "-musl", base]
    }
    if (arch === "x64") {
      if (baseline) return [base + "-baseline", base, base + "-baseline-musl", base + "-musl"]
      return [base, base + "-baseline", base + "-musl", base + "-baseline-musl"]
    }
    return [base, base + "-musl"]
  }
  if (arch === "x64") {
    if (baseline) return [base + "-baseline", base]
    return [base, base + "-baseline"]
  }
  return [base]
})()

function findBinary(start) {
  let cur = start
  for (;;) {
    const modules = path.join(cur, "node_modules")
    if (fs.existsSync(modules)) {
      for (const name of names) {
        const candidate = path.join(modules, name, "bin", binary)
        if (fs.existsSync(candidate)) return candidate
      }
    }
    const parent = path.dirname(cur)
    if (parent === cur) return
    cur = parent
  }
}

const resolved = findBinary(scriptDir)
if (!resolved) {
  console.error(
    "It seems that your package manager failed to install the right version of the ocv CLI for your platform. You can try manually installing " +
      names.map((n) => '\"' + n + '\"').join(" or ") +
      " package",
  )
  process.exit(1)
}

run(resolved)
`

const meta = path.join(out, "ocv")
fs.mkdirSync(path.join(meta, "bin"), { recursive: true })
fs.writeFileSync(path.join(meta, "package.json"), JSON.stringify(pkg, null, 2) + "\n")
fs.writeFileSync(
  path.join(meta, "README.md"),
  "# @leohenon/ocv\n\nocv (OpenCode fork with vim keybindings).\n\nInstall: `npm i -g @leohenon/ocv`\n",
)
fs.writeFileSync(path.join(meta, "bin", "ocv"), launcher)
fs.chmodSync(path.join(meta, "bin", "ocv"), 0o755)
fs.copyFileSync(path.join(root, "..", "..", "LICENSE"), path.join(meta, "LICENSE"))

await $`bun pm pack`.cwd(meta)
await publish(meta, "@leohenon/ocv", version)
