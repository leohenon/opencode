# opencode-vim

opencode fork with vim mode. Syncs with upstream releases.

![demo](.github/demo.gif)

## Install

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
brew upgrade ocv
# or
ocv update
```

## Features

### Vim motions

`h` `j` `k` `l` `w` `b` `e` `W` `B` `E` `0` `^` `_` `$` `gg` `G`
`i` `I` `a` `A` `o` `O` `x` `dd` `dw` `cc` `cw` `S` `J` `yy` `yw` `p` `P` `v` `V`
`f` `F` `t` `T` `;` `,`
`Ctrl+e` `Ctrl+y` `Ctrl+d` `Ctrl+u` `Ctrl+f` `Ctrl+b`

### Claude OAuth

Claude Pro/Max subscriptions work out of the box — no plugins or configuration needed.

### Minimal UI Toggle

- Hide extra UI hints
- commands -> `Toggle minimal ui`

## Feedback

Have a suggestion? [Open an issue](https://github.com/leohenon/opencode/issues).
