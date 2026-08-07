/** @jsxImportSource @opentui/solid */
import { TextareaRenderable } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import type { QuestionAnswer, QuestionRequest } from "@opencode-ai/sdk/v2"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { createEffect, onCleanup, type ParentProps } from "solid-js"
import { TuiConfigProvider } from "../../../src/config"
import { KVProvider, useKV } from "../../../src/context/kv"
import { SDKProvider } from "../../../src/context/sdk"
import { ThemeProvider } from "../../../src/context/theme"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../../src/keymap"
import { QuestionPrompt } from "../../../src/routes/session/question"
import { tmpdir } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { eventSource, json } from "../../fixture/tui-sdk"

type QuestionCall =
  | { type: "reply"; requestID: string; answers: QuestionAnswer[] }
  | { type: "reject"; requestID: string }

type QuestionApp = Awaited<ReturnType<typeof testRender>>

function isQuestionAnswers(value: unknown): value is QuestionAnswer[] {
  return (
    Array.isArray(value) &&
    value.every((answer) => Array.isArray(answer) && answer.every((item) => typeof item === "string"))
  )
}

async function mountQuestion(input: {
  root: string
  request: QuestionRequest
  vimModalInput?: boolean
  vimEscapeSequence?: string
}) {
  const state = path.join(input.root, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")

  const calls: QuestionCall[] = []
  let resolveReady!: () => void
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })

  const fetch: typeof globalThis.fetch = Object.assign(
    async (requestInput: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) => {
      const request = requestInput instanceof Request ? requestInput : new Request(requestInput, init)
      const url = new URL(request.url)
      const reply = url.pathname.match(/^\/question\/([^/]+)\/reply$/)
      if (reply) {
        const body: unknown = await request.json()
        if (!body || typeof body !== "object" || !("answers" in body) || !isQuestionAnswers(body.answers)) {
          throw new Error("invalid question reply")
        }
        calls.push({ type: "reply", requestID: reply[1], answers: body.answers })
        return json({})
      }

      const reject = url.pathname.match(/^\/question\/([^/]+)\/reject$/)
      if (reject) {
        calls.push({ type: "reject", requestID: reject[1] })
        return json({})
      }

      throw new Error(`unexpected request: ${url.pathname}`)
    },
    { preconnect: globalThis.fetch.preconnect },
  )

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig({
      vim_modal_input: input.vimModalInput,
      vim_escape_sequence: input.vimEscapeSequence,
    })
    const offKeymap = registerOpencodeKeymap(keymap, renderer, config)
    onCleanup(offKeymap)

    return (
      <TestTuiContexts
        directory={input.root}
        paths={{
          home: input.root,
          state,
          worktree: input.root,
        }}
      >
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={config}>
            <KVProvider>
              <ThemeProvider mode="dark">
                <Ready onReady={resolveReady}>
                  <SDKProvider url="http://test" directory={input.root} events={eventSource()} fetch={fetch}>
                    <QuestionPrompt request={input.request} directory={input.root} />
                  </SDKProvider>
                </Ready>
              </ThemeProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(
    () => (
      <box width={100} height={20}>
        <Harness />
      </box>
    ),
    { width: 100, height: 20, kittyKeyboard: true },
  )
  await ready

  return {
    app,
    calls,
    cleanup() {
      app.renderer.destroy()
    },
  }
}

function Ready(props: ParentProps<{ onReady: () => void }>) {
  const kv = useKV()
  createEffect(() => {
    if (kv.ready) props.onReady()
  })
  return <>{props.children}</>
}

function questionRequest(): QuestionRequest {
  return {
    id: "question-1",
    sessionID: "session-1",
    questions: [
      {
        header: "First",
        question: "First question?",
        options: [{ label: "Preset", description: "Use the preset answer." }],
        custom: true,
      },
      {
        header: "Second",
        question: "Second question?",
        options: [{ label: "Next", description: "Use the next answer." }],
        custom: false,
      },
    ],
  }
}

async function enterCustomDraft(app: QuestionApp, text = "draft") {
  await app.renderOnce()
  app.mockInput.pressKey("2")
  await app.renderOnce()
  await app.waitFor(() => app.renderer.currentFocusedEditor instanceof TextareaRenderable)
  const textarea = app.renderer.currentFocusedEditor
  if (!(textarea instanceof TextareaRenderable)) throw new Error("expected focused answer textarea")
  textarea.setText(text)
  textarea.gotoLineEnd()
  await app.renderOnce()
  return textarea
}

async function clickTab(app: QuestionApp, id: string) {
  const tab = app.renderer.root.findDescendantById(id)
  if (!tab) throw new Error(`expected question tab: ${id}`)
  await app.mockMouse.click(tab.screenX + 1, tab.screenY)
  await app.renderOnce()
}

test("question prompt submits after leaving a custom edit for Confirm", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountQuestion({ root: tmp.path, request: questionRequest(), vimModalInput: true })

  try {
    await enterCustomDraft(prompt.app)
    await clickTab(prompt.app, "tui-question-tab-confirm")
    prompt.app.mockInput.pressEnter()
    await prompt.app.renderOnce()
    await prompt.app.waitFor(() => prompt.calls.length === 1)

    expect(prompt.calls).toEqual([{ type: "reply", requestID: "question-1", answers: [[], []] }])
  } finally {
    prompt.cleanup()
  }
})

test("question prompt rejects after leaving a non-modal custom edit for Confirm", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountQuestion({ root: tmp.path, request: questionRequest(), vimModalInput: false })

  try {
    await enterCustomDraft(prompt.app)
    await clickTab(prompt.app, "tui-question-tab-confirm")
    prompt.app.mockInput.pressEscape()
    await prompt.app.renderOnce()
    await prompt.app.waitFor(() => prompt.calls.length === 1)

    expect(prompt.calls).toEqual([{ type: "reject", requestID: "question-1" }])
  } finally {
    prompt.cleanup()
  }
})

test("question prompt restores a draft cancelled by changing tabs", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountQuestion({ root: tmp.path, request: questionRequest() })

  try {
    await enterCustomDraft(prompt.app)
    await clickTab(prompt.app, "tui-question-tab-confirm")

    prompt.app.mockInput.pressKey("h")
    await prompt.app.renderOnce()
    prompt.app.mockInput.pressKey("h")
    await prompt.app.renderOnce()
    prompt.app.mockInput.pressKey("u")
    await prompt.app.renderOnce()
    await prompt.app.waitFor(() => prompt.app.renderer.currentFocusedEditor instanceof TextareaRenderable)

    const textarea = prompt.app.renderer.currentFocusedEditor
    if (!(textarea instanceof TextareaRenderable)) throw new Error("expected restored answer textarea")
    expect(textarea.plainText).toBe("draft")
  } finally {
    prompt.cleanup()
  }
})

test("question prompt preserves a custom edit when reselecting its tab", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountQuestion({ root: tmp.path, request: questionRequest() })

  try {
    const textarea = await enterCustomDraft(prompt.app)
    await clickTab(prompt.app, "tui-question-tab-0")

    expect(prompt.app.renderer.currentFocusedEditor).toBe(textarea)
    expect(textarea.plainText).toBe("draft")
  } finally {
    prompt.cleanup()
  }
})

test("question prompt flushes a pending Vim escape key before stashing a draft", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountQuestion({
    root: tmp.path,
    request: questionRequest(),
    vimModalInput: true,
    vimEscapeSequence: "jk",
  })

  try {
    const textarea = await enterCustomDraft(prompt.app)
    prompt.app.mockInput.pressKey("j")
    await prompt.app.renderOnce()
    expect(textarea.plainText).toBe("draft")

    await clickTab(prompt.app, "tui-question-tab-confirm")
    prompt.app.mockInput.pressKey("h")
    await prompt.app.renderOnce()
    prompt.app.mockInput.pressKey("h")
    await prompt.app.renderOnce()
    prompt.app.mockInput.pressKey("u")
    await prompt.app.renderOnce()
    await prompt.app.waitFor(() => prompt.app.renderer.currentFocusedEditor instanceof TextareaRenderable)

    const restored = prompt.app.renderer.currentFocusedEditor
    if (!(restored instanceof TextareaRenderable)) throw new Error("expected restored answer textarea")
    expect(restored.plainText).toBe("draftj")

    prompt.app.mockInput.pressKey("k")
    await prompt.app.renderOnce()
    expect(restored.plainText).toBe("draftjk")
  } finally {
    prompt.cleanup()
  }
})
