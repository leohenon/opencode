#!/bin/sh
set -e

REPO="leohenon/opencode"
INSTALL_DIR="${OCV_INSTALL_DIR:-/usr/local/bin}"

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
linux) PLATFORM="linux" ;;
darwin) PLATFORM="darwin" ;;
*) echo "Unsupported OS: $OS" && exit 1 ;;
esac

case "$ARCH" in
x86_64 | amd64) ARCH="x64" ;;
aarch64 | arm64) ARCH="arm64" ;;
*) echo "Unsupported architecture: $ARCH" && exit 1 ;;
esac

TARGET="ocv-${PLATFORM}-${ARCH}"

# Get latest version
if [ -z "$OCV_VERSION" ]; then
  VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/')
else
  VERSION="$OCV_VERSION"
fi

if [ -z "$VERSION" ]; then
  echo "Could not determine latest version"
  exit 1
fi

echo "Installing ocv v$VERSION ($PLATFORM/$ARCH)..."

# Download
URL="https://github.com/$REPO/releases/download/v$VERSION/$TARGET"
if [ "$PLATFORM" = "linux" ]; then
  URL="$URL.tar.gz"
  TMP=$(mktemp -d)
  curl -fsSL "$URL" | tar -xz -C "$TMP"
  mv "$TMP/opencode" "$INSTALL_DIR/ocv"
  rm -rf "$TMP"
else
  URL="$URL.zip"
  TMP=$(mktemp -d)
  curl -fsSL -o "$TMP/ocv.zip" "$URL"
  unzip -q "$TMP/ocv.zip" -d "$TMP"
  mv "$TMP/opencode" "$INSTALL_DIR/ocv"
  rm -rf "$TMP"
fi

chmod +x "$INSTALL_DIR/ocv"
echo "Installed ocv to $INSTALL_DIR/ocv"
echo "Run 'ocv' to start."
