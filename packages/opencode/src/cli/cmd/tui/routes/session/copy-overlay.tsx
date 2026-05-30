import { For, Show, createMemo } from "solid-js"
import { RGBA } from "@opentui/core"
import { selectedForeground, useTheme } from "@tui/context/theme"
import type { CopyHighlight, CopyRow } from "./copy-mode"

export type CopyPosition = { line: number; col: number; visual: boolean; cursorText: string }
export type CopyContext = CopyRow & CopyPosition

export function CopyOverlay(props: { copy?: CopyPosition; topOffset?: number; highlights?: CopyHighlight[] }) {
  const { theme } = useTheme()
  const top = (line: number) => line + (props.topOffset ?? 0)
  const highlightFg = createMemo(() => selectedForeground(theme, theme.secondary))
  const currentHighlightFg = createMemo(() => selectedForeground(theme, theme.primary))
  const cursorFg = createMemo(() => selectedForeground(theme, theme.text))
  return (
    <>
      <Show when={props.copy && !props.copy.visual}>
        <box
          position="absolute"
          top={top(props.copy!.line)}
          left={0}
          width="100%"
          height={1}
          backgroundColor={RGBA.fromInts(255, 255, 255, 15)}
        />
      </Show>
      <For each={props.highlights ?? []}>
        {(highlight) => (
          <box position="absolute" top={top(highlight.line)} left={highlight.left}>
            <text bg={highlight.current ? theme.primary : theme.secondary} fg={highlight.current ? currentHighlightFg() : highlightFg()}>
              {highlight.text || " "}
            </text>
          </box>
        )}
      </For>
      <Show when={props.copy}>
        <box position="absolute" top={top(props.copy!.line)} left={props.copy!.col} width={1} height={1}>
          <text bg={theme.text} fg={cursorFg()}>
            {props.copy!.cursorText}
          </text>
        </box>
      </Show>
    </>
  )
}
