import { createStore } from "solid-js/store"
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent, TextareaRenderable } from "@opentui/core"
import { selectedForeground, tint, useTheme } from "../../context/theme"
import type { QuestionAnswer, QuestionRequest } from "@opencode-ai/sdk/v2"
import { useSDK } from "../../context/sdk"
import { SplitBorder } from "../../ui/border"
import { useTuiConfig } from "../../config"
import {
  OPENCODE_COPY_MODE_ENTER_KEYS,
  OPENCODE_COPY_MODE_TOGGLE_KEYS,
  useBindings,
  useOpencodeKeymap,
  useOpencodeModeStack,
} from "../../keymap"
import {
  createSingleLineVimMotions,
  isSingleLineVimPrintableKey,
  singleLineVimKeyName,
  singleLineVimLangmappedEvent,
  type SingleLineVimKeyEvent,
} from "../../component/vim/single-line-vim-motions"
import { createModalInputEscapeSequence, type ModalInputMode } from "../../component/vim/modal-input-controls"
import { useVimEnabled } from "../../component/vim"

const QUESTION_MODE = "question"

export function QuestionPrompt(props: { request: QuestionRequest; directory?: string }) {
  const sdk = useSDK()
  const { theme } = useTheme()
  const renderer = useRenderer()
  const tuiConfig = useTuiConfig()
  const keymap = useOpencodeKeymap()
  const modeStack = useOpencodeModeStack()
  const vimEnabled = useVimEnabled()

  const questions = createMemo(() => props.request.questions)
  const single = createMemo(() => questions().length === 1 && questions()[0]?.multiple !== true)
  const tabs = createMemo(() => (single() ? 1 : questions().length + 1)) // questions + confirm tab (no confirm for single select)
  const [tabHover, setTabHover] = createSignal<number | "confirm" | null>(null)
  const [store, setStore] = createStore({
    tab: 0,
    answers: [] as QuestionAnswer[],
    custom: [] as string[],
    selected: 0,
    editing: false,
    inputMode: "insert" as ModalInputMode,
  })

  let textarea: TextareaRenderable | undefined
  const [clearedText, setClearedText] = createSignal<{ tab: number; text: string } | undefined>()

  const question = createMemo(() => questions()[store.tab])
  const confirm = createMemo(() => !single() && store.tab === questions().length)
  const options = createMemo(() => question()?.options ?? [])
  const custom = createMemo(() => question()?.custom !== false)
  const other = createMemo(() => custom() && store.selected === options().length)
  const input = createMemo(() => store.custom[store.tab] ?? "")
  const multi = createMemo(() => question()?.multiple === true)
  const customPicked = createMemo(() => {
    const value = input()
    if (!value) return false
    return store.answers[store.tab]?.includes(value) ?? false
  })
  const modalInputEnabled = createMemo(() => vimEnabled() && tuiConfig.vim_modal_input)
  const answerMotions = createSingleLineVimMotions({
    text: () => textarea?.plainText ?? "",
    cursor: () => textarea?.cursorOffset ?? 0,
    setCursor: (offset) => {
      if (!textarea || textarea.isDestroyed) return
      textarea.cursorOffset = offset
    },
    setText: (text) => {
      if (!textarea || textarea.isDestroyed) return
      textarea.setText(text)
    },
    enterInsert: () => setStore("inputMode", "insert"),
    focus: () => textarea?.focus(),
  })
  const answerEscapeSequence = createModalInputEscapeSequence({
    vimEscapeSequence: () => tuiConfig.vim_escape_sequence,
    text: () => textarea?.plainText ?? "",
    cursor: () => textarea?.cursorOffset ?? 0,
    setCursor: (offset) => {
      if (!textarea || textarea.isDestroyed) return
      textarea.cursorOffset = offset
    },
    setText: (text) => {
      if (!textarea || textarea.isDestroyed) return
      textarea.setText(text)
    },
    enterNormal: () => enterAnswerNormalMode(),
  })

  createEffect(() => {
    if (!textarea || textarea.isDestroyed) return
    textarea.cursorStyle = modalInputEnabled() && store.inputMode === "normal" ? { style: "block", blinking: false } : { style: "line", blinking: true }
  })

  function submit() {
    const answers = questions().map((_, i) => store.answers[i] ?? [])
    void sdk.client.question.reply({
      requestID: props.request.id,
      directory: props.directory,
      answers,
    })
  }

  function reject() {
    void sdk.client.question.reject({
      requestID: props.request.id,
      directory: props.directory,
    })
  }

  function pick(answer: string, custom: boolean = false) {
    const answers = [...store.answers]
    answers[store.tab] = [answer]
    setStore("answers", answers)
    if (custom) {
      const inputs = [...store.custom]
      inputs[store.tab] = answer
      setStore("custom", inputs)
    }
    if (single()) {
      void sdk.client.question.reply({
        requestID: props.request.id,
        directory: props.directory,
        answers: [[answer]],
      })
      return
    }
    setStore("tab", store.tab + 1)
    setStore("selected", 0)
  }

  function toggle(answer: string) {
    const existing = store.answers[store.tab] ?? []
    const next = [...existing]
    const index = next.indexOf(answer)
    if (index === -1) next.push(answer)
    if (index !== -1) next.splice(index, 1)
    const answers = [...store.answers]
    answers[store.tab] = next
    setStore("answers", answers)
  }

  function moveTo(index: number) {
    setStore("selected", index)
  }

  function selectTab(index: number) {
    setStore("tab", index)
    setStore("selected", 0)
  }

  function enterAnswerNormalMode() {
    if (textarea && !textarea.isDestroyed) {
      textarea.cursorOffset = normalAnswerCursor(textarea.plainText, textarea.cursorOffset)
    }
    setStore("inputMode", "normal")
  }

  function handleAnswerKey(event: SingleLineVimKeyEvent) {
    if (!modalInputEnabled()) return false
    if (hasModifier(event)) {
      clearAnswerPending()
      return false
    }
    const mappedEvent = store.inputMode === "normal" ? singleLineVimLangmappedEvent(event, () => tuiConfig.vim_langmap) : event
    const key = answerKeyName(mappedEvent)
    if (store.inputMode === "insert") {
      if (key !== "escape") return answerEscapeSequence.handleKey(event)
      clearAnswerPending()
      enterAnswerNormalMode()
      event.preventDefault()
      return true
    }
    if (key === "escape") return false
    if (key === "i" || key === "a" || key === "/") {
      clearAnswerPending()
      if (key === "a" && textarea && !textarea.isDestroyed) {
        textarea.cursorOffset = Math.min(textarea.plainText.length, textarea.cursorOffset + 1)
      }
      setStore("inputMode", "insert")
      textarea?.focus()
      mappedEvent.preventDefault()
      return true
    }
    if (answerMotions.handleKey(mappedEvent)) return true
    if (isSingleLineVimPrintableKey(key) || key === "backspace" || key === "delete") {
      mappedEvent.preventDefault()
      return true
    }
    return false
  }

  function clearAnswerPending() {
    answerMotions.clearPending()
    answerEscapeSequence.clearPending()
  }

  function setEditing(editing: boolean) {
    clearAnswerPending()
    setStore("editing", editing)
  }

  function selectOption() {
    if (other()) {
      if (!multi()) {
        setEditing(true)
        setStore("inputMode", "insert")
        return
      }
      const value = input()
      if (value && customPicked()) {
        toggle(value)
        return
      }
      setEditing(true)
      setStore("inputMode", "insert")
      return
    }
    const opt = options()[store.selected]
    if (!opt) return
    if (multi()) {
      toggle(opt.label)
      return
    }
    pick(opt.label)
  }

  onMount(() => {
    const popMode = modeStack.push(QUESTION_MODE)
    onCleanup(popMode)
  })

  useBindings(() => ({
    mode: QUESTION_MODE,
    enabled: store.editing && !confirm(),
    commands: [
      {
        name: "prompt.clear",
        title: "Clear answer edit",
        category: "Question",
        run() {
          clearAnswerPending()
          const text = textarea?.plainText ?? ""
          if (!text) {
            setEditing(false)
            return
          }
          textarea?.setText("")
        },
      },
    ],
    bindings: [
      ...(modalInputEnabled() && store.inputMode === "insert"
        ? [
            {
              key: "escape",
              desc: "Enter normal mode",
              group: "Question",
              cmd: () => enterAnswerNormalMode(),
            },
          ]
        : [
            {
              key: "escape",
              desc: "Cancel answer edit",
              group: "Question",
              cmd: () => {
                const text = textarea?.plainText ?? ""
                if (text) {
                  setClearedText({ tab: store.tab, text })
                }
                setEditing(false)
              },
            },
          ]),
      ...tuiConfig.keybinds.get("prompt.clear"),
      {
        key: "return",
        desc: "Submit answer edit",
        group: "Question",
        cmd: () => {
          clearAnswerPending()
          const text = textarea?.plainText?.trim() ?? ""
          const prev = store.custom[store.tab]

          if (!text) {
            if (prev) {
              const inputs = [...store.custom]
              inputs[store.tab] = ""
              setStore("custom", inputs)

              const answers = [...store.answers]
              answers[store.tab] = (answers[store.tab] ?? []).filter((x) => x !== prev)
              setStore("answers", answers)
            }
            setEditing(false)
            return
          }

          if (multi()) {
            const inputs = [...store.custom]
            inputs[store.tab] = text
            setStore("custom", inputs)

            const existing = store.answers[store.tab] ?? []
            const next = [...existing]
            if (prev) {
              const index = next.indexOf(prev)
              if (index !== -1) next.splice(index, 1)
            }
            if (!next.includes(text)) next.push(text)
            const answers = [...store.answers]
            answers[store.tab] = next
            setStore("answers", answers)
            setEditing(false)
            return
          }

          pick(text, true)
          setEditing(false)
        },
      },
    ],
  }))

  useBindings(() => {
    const opts = options()
    const total = opts.length + (custom() ? 1 : 0)
    const max = Math.min(total, 9)

    return {
      mode: QUESTION_MODE,
      enabled: !store.editing,
      commands: [
        {
          name: "app.exit",
          title: "Reject question",
          category: "Question",
          run() {
            reject()
          },
        },
      ],
      bindings: [
        ...tuiConfig.keybinds.get("session.copy_mode").map((binding) => ({
          ...binding,
          desc: "Enter copy mode",
          group: "Question",
          cmd: () => keymap.dispatchCommand("session.copy_mode"),
        })),
        {
          key: OPENCODE_COPY_MODE_ENTER_KEYS,
          desc: "Enter copy mode",
          group: "Question",
          cmd: () => keymap.dispatchCommand("session.copy_mode"),
        },
        {
          key: OPENCODE_COPY_MODE_TOGGLE_KEYS,
          desc: "Enter copy mode",
          group: "Question",
          cmd: () => keymap.dispatchCommand("session.copy_mode"),
        },
        {
          key: "left",
          desc: "Previous question",
          group: "Question",
          cmd: () => selectTab((store.tab - 1 + tabs()) % tabs()),
        },
        {
          key: "h",
          desc: "Previous question",
          group: "Question",
          cmd: () => selectTab((store.tab - 1 + tabs()) % tabs()),
        },
        { key: "right", desc: "Next question", group: "Question", cmd: () => selectTab((store.tab + 1) % tabs()) },
        { key: "l", desc: "Next question", group: "Question", cmd: () => selectTab((store.tab + 1) % tabs()) },
        {
          key: "tab",
          desc: "Next question",
          group: "Question",
          cmd: ({ event }: { event: { shift: boolean } }) => {
            selectTab((store.tab + (event.shift ? -1 : 1) + tabs()) % tabs())
          },
        },
        ...(confirm()
          ? [
              { key: "return", desc: "Submit answer", group: "Question", cmd: () => submit() },
              { key: "escape", desc: "Reject question", group: "Question", cmd: () => reject() },
              ...tuiConfig.keybinds.get("app.exit"),
            ]
          : [
              ...Array.from({ length: max }, (_, index) => ({
                key: String(index + 1),
                desc: `Select answer ${index + 1}`,
                group: "Question",
                cmd: () => {
                  moveTo(index)
                  selectOption()
                },
              })),
              {
                key: "up",
                desc: "Previous answer",
                group: "Question",
                cmd: () => moveTo((store.selected - 1 + total) % total),
              },
              {
                key: "k",
                desc: "Previous answer",
                group: "Question",
                cmd: () => moveTo((store.selected - 1 + total) % total),
              },
              { key: "down", desc: "Next answer", group: "Question", cmd: () => moveTo((store.selected + 1) % total) },
              { key: "j", desc: "Next answer", group: "Question", cmd: () => moveTo((store.selected + 1) % total) },
              { key: "return", desc: "Select answer", group: "Question", cmd: () => selectOption() },
              {
                key: "u",
                desc: "Undo cleared text",
                group: "Question",
                hidden: !clearedText() || clearedText()!.tab !== store.tab,
                cmd: () => {
                  const stash = clearedText()
                  if (!stash || stash.tab !== store.tab) return
                  const inputs = [...store.custom]
                  inputs[stash.tab] = stash.text
                  setStore("custom", inputs)
                  setClearedText()
                  setEditing(true)
                  setStore("inputMode", "insert")
                },
              },
              { key: "escape", desc: "Reject question", group: "Question", cmd: () => reject() },
              ...tuiConfig.keybinds.get("app.exit"),
            ]),
      ],
    }
  })

  return (
    <box
      backgroundColor={theme.backgroundPanel}
      border={["left"]}
      borderColor={theme.accent}
      customBorderChars={SplitBorder.customBorderChars}
    >
      <box gap={1} paddingLeft={1} paddingRight={3} paddingTop={1} paddingBottom={1}>
        <Show when={!single()}>
          <box flexDirection="row" gap={1} paddingLeft={1}>
            <For each={questions()}>
              {(q, index) => {
                const isActive = () => index() === store.tab
                const isAnswered = () => {
                  return (store.answers[index()]?.length ?? 0) > 0
                }
                return (
                  <box
                    paddingLeft={1}
                    paddingRight={1}
                    backgroundColor={
                      isActive()
                        ? theme.accent
                        : tabHover() === index()
                          ? theme.backgroundElement
                          : theme.backgroundPanel
                    }
                    onMouseOver={() => setTabHover(index())}
                    onMouseOut={() => setTabHover(null)}
                    onMouseUp={() => {
                      if (renderer.getSelection()?.getSelectedText()) return
                      selectTab(index())
                    }}
                  >
                    <text
                      fg={
                        isActive()
                          ? selectedForeground(theme, theme.accent)
                          : isAnswered()
                            ? theme.text
                            : theme.textMuted
                      }
                    >
                      {q.header}
                    </text>
                  </box>
                )
              }}
            </For>
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={
                confirm() ? theme.accent : tabHover() === "confirm" ? theme.backgroundElement : theme.backgroundPanel
              }
              onMouseOver={() => setTabHover("confirm")}
              onMouseOut={() => setTabHover(null)}
              onMouseUp={() => {
                if (renderer.getSelection()?.getSelectedText()) return
                selectTab(questions().length)
              }}
            >
              <text fg={confirm() ? selectedForeground(theme, theme.accent) : theme.textMuted}>Confirm</text>
            </box>
          </box>
        </Show>

        <Show when={!confirm()}>
          <box paddingLeft={1} gap={1}>
            <box>
              <text fg={theme.text}>
                {question()?.question}
                {multi() ? " (select all that apply)" : ""}
              </text>
            </box>
            <box>
              <For each={options()}>
                {(opt, i) => {
                  const active = () => i() === store.selected
                  const picked = () => store.answers[store.tab]?.includes(opt.label) ?? false
                  return (
                    <box
                      onMouseOver={() => moveTo(i())}
                      onMouseDown={() => moveTo(i())}
                      onMouseUp={() => {
                        if (renderer.getSelection()?.getSelectedText()) return
                        selectOption()
                      }}
                    >
                      <box flexDirection="row">
                        <box backgroundColor={active() ? theme.backgroundElement : undefined} paddingRight={1}>
                          <text fg={active() ? tint(theme.textMuted, theme.secondary, 0.6) : theme.textMuted}>
                            {`${i() + 1}.`}
                          </text>
                        </box>
                        <box backgroundColor={active() ? theme.backgroundElement : undefined}>
                          <text fg={active() ? theme.secondary : picked() ? theme.success : theme.text}>
                            {multi() ? `[${picked() ? "✓" : " "}] ${opt.label}` : opt.label}
                          </text>
                        </box>
                        <Show when={!multi()}>
                          <text fg={theme.success}>{picked() ? " ✓" : ""}</text>
                        </Show>
                      </box>

                      <box paddingLeft={3}>
                        <text fg={theme.textMuted}>{opt.description}</text>
                      </box>
                    </box>
                  )
                }}
              </For>
              <Show when={custom()}>
                <box
                  onMouseOver={() => moveTo(options().length)}
                  onMouseDown={() => moveTo(options().length)}
                  onMouseUp={() => {
                    if (renderer.getSelection()?.getSelectedText()) return
                    selectOption()
                  }}
                >
                  <box flexDirection="row">
                    <box backgroundColor={other() ? theme.backgroundElement : undefined} paddingRight={1}>
                      <text fg={other() ? tint(theme.textMuted, theme.secondary, 0.6) : theme.textMuted}>
                        {`${options().length + 1}.`}
                      </text>
                    </box>
                    <box backgroundColor={other() ? theme.backgroundElement : undefined}>
                      <text fg={other() ? theme.secondary : customPicked() ? theme.success : theme.text}>
                        {multi() ? `[${customPicked() ? "✓" : " "}] Type your own answer` : "Type your own answer"}
                      </text>
                    </box>

                    <Show when={!multi()}>
                      <text fg={theme.success}>{customPicked() ? " ✓" : ""}</text>
                    </Show>
                  </box>
                  <Show when={store.editing}>
                    <box paddingLeft={3}>
                      <textarea
                        ref={(val: TextareaRenderable) => {
                          textarea = val
                          val.traits = { status: "ANSWER" }
                          queueMicrotask(() => {
                            val.focus()
                            val.gotoLineEnd()
                          })
                        }}
                        initialValue={input()}
                        placeholder="Type your own answer"
                        placeholderColor={theme.textMuted}
                        minHeight={1}
                        maxHeight={6}
                        textColor={theme.text}
                        focusedTextColor={theme.text}
                        cursorColor={theme.primary}
                        cursorStyle={
                          modalInputEnabled() && store.inputMode === "normal"
                            ? { style: "block", blinking: false }
                            : { style: "line", blinking: true }
                        }
                        onKeyDown={(event: SingleLineVimKeyEvent) => {
                          if (handleAnswerKey(event)) return
                        }}
                      />
                    </box>
                  </Show>
                  <Show when={!store.editing && input()}>
                    <box paddingLeft={3}>
                      <text fg={theme.textMuted}>{input()}</text>
                    </box>
                  </Show>
                </box>
              </Show>
            </box>
          </box>
        </Show>

        <Show when={confirm() && !single()}>
          <box paddingLeft={1}>
            <text fg={theme.text}>Review</text>
          </box>
          <For each={questions()}>
            {(q, index) => {
              const value = () => store.answers[index()]?.join(", ") ?? ""
              const answered = () => Boolean(value())
              return (
                <box paddingLeft={1}>
                  <text>
                    <span style={{ fg: theme.textMuted }}>{q.header}:</span>{" "}
                    <span style={{ fg: answered() ? theme.text : theme.error }}>
                      {answered() ? value() : "(not answered)"}
                    </span>
                  </text>
                </box>
              )
            }}
          </For>
        </Show>
      </box>
      <box
        flexDirection="row"
        flexShrink={0}
        gap={1}
        paddingLeft={2}
        paddingRight={3}
        paddingBottom={1}
        justifyContent="space-between"
      >
        <box flexDirection="row" gap={2}>
          <Show when={!single()}>
            <text fg={theme.text}>
              {"⇆"} <span style={{ fg: theme.textMuted }}>tab</span>
            </text>
          </Show>
          <Show when={!confirm()}>
            <text fg={theme.text}>
              {"↑↓"} <span style={{ fg: theme.textMuted }}>select</span>
            </text>
          </Show>
          <text fg={theme.text}>
            enter{" "}
            <span style={{ fg: theme.textMuted }}>
              {confirm() ? "submit" : multi() ? "toggle" : single() ? "submit" : "confirm"}
            </span>
          </text>

          <text fg={theme.text}>
            esc <span style={{ fg: theme.textMuted }}>dismiss</span>
          </text>
        </box>
      </box>
    </box>
  )
}

function normalAnswerCursor(text: string, cursor: number) {
  if (text.length === 0) return 0
  return Math.max(0, Math.min(cursor - 1, text.length - 1))
}

function hasModifier(event: KeyEvent) {
  return !!event.ctrl || !!event.meta || !!event.super || !!event.hyper || !!event.option
}

function answerKeyName(event: KeyEvent) {
  if (event.name === "escape") return "escape"
  return singleLineVimKeyName(event)
}
