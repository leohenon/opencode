<div align="center">

# OpenCode Vim

[![npm version](https://img.shields.io/npm/v/@leohenon/ocv?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@leohenon/ocv) [![CI](https://img.shields.io/github/actions/workflow/status/leohenon/opencode-vim/ci.yml?branch=ocv&style=flat-square&logo=github&logoColor=white&label=CI&color=3f8f4d)](https://github.com/leohenon/opencode-vim/actions/workflows/ci.yml) [![Last commit](https://img.shields.io/github/last-commit/leohenon/opencode-vim/ocv?style=flat-square&logo=git&logoColor=white&color=7fa6a3)](https://github.com/leohenon/opencode-vim/commits/ocv) [![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?style=flat-square&logo=bun&logoColor=white)](https://bun.sh)

opencode fork with vim mode. Syncs with upstream releases.

</div>

<img src=".github/demo.gif" style="border: 1px solid #555; border-radius: 4px;" />

## Install

```bash
# npm
npm i -g @leohenon/ocv

# Homebrew
brew install leohenon/tap/ocv

# curl
curl -fsSL https://raw.githubusercontent.com/leohenon/opencode-vim/ocv/install.sh | sudo sh
```

## Usage

```bash
ocv
```

## Update

```bash
# npm
npm i -g @leohenon/ocv@latest

# Homebrew
brew upgrade ocv

# built-in updater
ocv update
```

## Features

### Vim motions

Toggle via command palette (`Ctrl+p` -> `Toggle vim mode`).

> Unicode word boundaries are not supported.

| Category                       | Keys                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| Character / word               | `h`, `j`, `k`, `l`, `w`, `b`, `e`, `W`, `B`, `E`           |
| Line / buffer                  | `0`, `^`, `_`, `$`, `gg`, `G`                              |
| Matching / paragraph           | `%`, `{`, `}`                                              |
| Find / till                    | `f`, `F`, `t`, `T`, `;`, `,`                               |
| Scroll                         | `Ctrl+e`, `Ctrl+y`, `Ctrl+d`, `Ctrl+u`, `Ctrl+f`, `Ctrl+b` |
| Insert / replace               | `i`, `I`, `a`, `A`, `o`, `O`, `R`                          |
| Character / line edit          | `r`, `x`, `~`, `s`, `S`, `J`, `C`, `dd`, `cc`              |
| Word changes                   | `cw`, `cb`, `ciw`, `caw`, `ciW`, `caW`                     |
| Word deletes                   | `dw`, `db`, `diw`, `daw`, `diW`, `daW`                     |
| Quote changes                  | `ci"`, `ca"`, `ci'`, `ca'`, ``ci` ``, ``ca` ``             |
| Quote deletes                  | `di"`, `da"`, `di'`, `da'`, ``di` ``, ``da` ``             |
| Bracket changes                | `ci(`, `ca(`, `ci[`, `ca[`, `ci{`, `ca{`, `ci<`, `ca<`     |
| Bracket deletes                | `di(`, `da(`, `di[`, `da[`, `di{`, `da{`, `di<`, `da<`     |
| Find / till operators          | `cf`, `cF`, `ct`, `cT`, `df`, `dF`, `dt`, `dT`             |
| Matching / paragraph operators | `c%`, `d%`, `c}`, `c{`, `d}`, `d{`                         |
| Line / word yanks              | `yy`, `yw`, `yiw`, `yaw`, `yiW`, `yaW`                     |
| Quote yanks                    | `yi"`, `ya"`, `yi'`, `ya'`, ``yi` ``, ``ya` ``             |
| Bracket yanks                  | `yi(`, `ya(`, `yi[`, `ya[`, `yi{`, `ya{`, `yi<`, `ya<`     |
| Matching / paragraph yanks     | `y%`, `y}`, `y{`                                           |
| Put / undo / repeat            | `p`, `P`, `u`, `Ctrl+r`, `.`                               |
| Visual selection               | `v`, `V`                                                   |

> [!NOTE]
> `<leader>y` copies the prompt selection when present; configure it with `keybinds.prompt_copy_selection`.
> For clipboard sync, see [System clipboard register](#system-clipboard-register).

### Anthropic OAuth

Claude subscriptions built-in with `/connect`. No plugins or configuration needed.

### Copy Mode

Text selection from the chat session view.

> Copy mode collapses code diffs into a single column for easy copying.

<img src=".github/copy-demo.gif" style="border: 1px solid #555; border-radius: 4px;" />

- Enter copy mode with `<leader>v` or `Ctrl+W k`.
- Navigate with `h` `j` `k` `l` or arrow keys (`Left` `Down` `Up` `Right`).
- Press `v` / `V` to start character-wise or line-wise selection.
- `y/yy` yanks to the vim register.
- `Enter` copies to the system clipboard.
- `Y` yanks to the vim register and scrolls to the bottom.
- `Shift+Enter` copies to the system clipboard and scrolls to the bottom.
- `Escape` exits visual mode, `q` exits copy mode and scrolls to the bottom.
- `Ctrl+W j` exits copy mode without scrolling; `Ctrl+W w` toggles copy mode.
- `i` focuses the prompt input in insert mode without scrolling.
- `z` `zt` `zz` `zb` adjust copy-mode scroll positioning.
- `H` / `M` / `L` jump to the top / middle / bottom of the viewport.

> [!TIP]
> Configure the entry key with `keybinds.copy_mode`.

### Prompt Input

Prompt input height is configurable with `prompt_max_height` in `tui.json`.

A scrollbar appears when the prompt exceeds the visible area. `gg` / `G` focus the prompt input when typing.

```json
{
  "prompt_max_height": 35,
  "prompt_scrollbar": true
}
```

> Setting `prompt_max_height` above `40` is not recommended.

<img src=".github/scrollbar.gif" style="border: 1px solid #555; border-radius: 4px;" />

### Minimal UI

Hides extra UI hints and tips.

| Default                                            | Minimal                                           |
| -------------------------------------------------- | ------------------------------------------------- |
| <img src=".github/minimal-ui-off.png" width="400"> | <img src=".github/minimal-ui-on.png" width="400"> |

Toggle via command palette (`Ctrl+p` -> `Toggle minimal ui`).

## Configuration

### Submit behavior

By default, vim insert mode keeps `Enter` for newlines and normal mode uses `Enter` to submit. If you want `Enter` to submit from insert mode too, add this to `tui.json`:

```json
{
  "vim_enter_submit": true
}
```

When `vim_enter_submit` is enabled, line returns are still available through `input_newline`.

```json
{
  "keybinds": {
    "input_newline": "alt+return"
  }
}
```

If you keep `vim_enter_submit` disabled but want a separate submit key that works from insert mode, configure `input_force_submit`:

```json
{
  "keybinds": {
    "input_force_submit": "alt+return"
  }
}
```

By default, `input_force_submit` is unbound.

### System clipboard register

By default, vim mode uses an internal register for `y` and `p`. If you want yank and paste to use the system clipboard instead, add this to `tui.json`:

```json
{
  "vim_system_clipboard_register": true
}
```

With this enabled, yank operations sync to the system clipboard and `p` / `P` paste from it.

> [!NOTE]
> Terminal/OS clipboard shortcuts don’t preserve Vim linewise register state. External clipboard text is pasted as characterwise text.

## Neovim integration

Compatible with [`opencode.nvim`](https://github.com/nickjvandyke/opencode.nvim). Use the following server config:

```lua
local ocv_cmd = "bash -c 'exec -a opencode ocv --port'"

vim.g.opencode_opts = {
  server = {
    start = function()
      require("opencode.terminal").open(ocv_cmd, {
        split = "right",
        width = math.floor(vim.o.columns * 0.35),
      })
    end,
    stop = function()
      require("opencode.terminal").close()
    end,
    toggle = function()
      require("opencode.terminal").toggle(ocv_cmd, {
        split = "right",
        width = math.floor(vim.o.columns * 0.35),
      })
    end,
  },
}
```

## Feedback

Have a suggestion? [Open an issue](https://github.com/leohenon/opencode-vim/issues).

## Contributors

Thanks to everyone who contributed.

<a href="https://github.com/reobin"><img src="https://github.com/reobin.png" width="40" height="40" /></a> <a href="https://github.com/BrettKulp"><img src="https://github.com/BrettKulp.png" width="40" height="40" /></a> <a href="https://github.com/lamiphil"><img src="https://github.com/lamiphil.png" width="40" height="40" /></a> <a href="https://github.com/XPhyro"><img src="https://github.com/XPhyro.png" width="40" height="40" /></a> <a href="https://github.com/shaheislam"><img src="https://github.com/shaheislam.png" width="40" height="40" /></a>
