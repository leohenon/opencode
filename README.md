<div align="center">

# `Opencode Vim`

[![npm version](https://img.shields.io/npm/v/@leohenon/ocv?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/@leohenon/ocv) [![npm downloads](https://img.shields.io/npm/dm/@leohenon/ocv?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/@leohenon/ocv) [![CI](https://img.shields.io/github/actions/workflow/status/leohenon/opencode/ci.yml?branch=vim&style=for-the-badge&logo=github&logoColor=white&label=CI)](https://github.com/leohenon/opencode/actions/workflows/ci.yml) [![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)

opencode fork with vim mode. Syncs with upstream releases.

</div>

![demo](.github/demo.gif)

## Install

### npm

```bash
npm i -g @leohenon/ocv
```

### Homebrew

```bash
brew install leohenon/tap/ocv
```

### curl

```bash
curl -fsSL https://raw.githubusercontent.com/leohenon/opencode/vim/install.sh | sudo sh
```

Then run:

```bash
ocv
```

## Update

```bash
npm i -g @leohenon/ocv@latest
# or
brew upgrade ocv
# or
ocv update
```

## Features

### Vim motions

`h` `j` `k` `l` `w` `b` `e` `W` `B` `E` `0` `^` `_` `$` `gg` `G`
`i` `I` `a` `A` `o` `O` `R` `x` `dd` `dw` `cc` `cw` `S` `J` `yy` `yw` `p` `P` `v` `V`
`f` `F` `t` `T` `;` `,`
`Ctrl+e` `Ctrl+y` `Ctrl+d` `Ctrl+u` `Ctrl+f` `Ctrl+b`

> [!TIP]
> Toggle via command palette (`Ctrl+p` -> `Toggle vim mode`).

### Anthropic OAuth

Claude subscriptions built-in with `/connect`. No plugins or configuration needed.

### Copy Mode

Vim-style text selection and copying from the chat session view.

![copy mode demo](.github/demo-copy-mode.gif)

Enter copy mode with `Ctrl+y`, then navigate with vim motions. Press `v` for character-wise or `V` for line-wise visual selection. `y` yanks to the vim register (paste with `p` in the prompt), `Enter` copies to the system clipboard. `Escape` exits visual mode, `q` exits copy mode entirely.

| Key                     | Action                   |
| ----------------------- | ------------------------ |
| `Ctrl+y`                | Enter copy mode          |
| `h` `j` `k` `l`         | Move cursor              |
| `w` `b` `e` `0` `$` `^` | Word/line motions        |
| `gg` / `G`              | Jump to top/bottom       |
| `v`                     | Character-wise visual    |
| `V`                     | Line-wise visual         |
| `y`                     | Yank to vim register     |
| `Enter`                 | Copy to system clipboard |
| `Escape`                | Exit visual mode         |
| `q`                     | Exit copy mode           |

### Minimal UI

Hides extra UI hints and tips.

| Default                                            | Minimal                                           |
| -------------------------------------------------- | ------------------------------------------------- |
| <img src=".github/minimal-ui-off.png" width="400"> | <img src=".github/minimal-ui-on.png" width="400"> |

> [!TIP]
> Toggle via command palette (`Ctrl+p` -> `Toggle minimal ui`).

## Feedback

Have a suggestion? [Open an issue](https://github.com/leohenon/opencode/issues).
