#!/bin/bash
set -e

VERSION="0.1.0"
DIST_DIR="dist"

mkdir -p "$DIST_DIR"

echo "=== Cross-platform build for YaMindMap v${VERSION} ==="
echo ""

# --- macOS ARM (Apple Silicon) ---
build_macos_arm() {
    echo ">> Building macOS ARM (aarch64-apple-darwin)..."
    cargo build --release --target aarch64-apple-darwin

    # Create app bundle
    APP_DIR="$DIST_DIR/YaMindMap-macos-arm64/YaMindMap.app"
    rm -rf "$APP_DIR"
    mkdir -p "$APP_DIR/Contents/MacOS"
    mkdir -p "$APP_DIR/Contents/Resources"
    cp "target/aarch64-apple-darwin/release/yamindmap" "$APP_DIR/Contents/MacOS/yamindmap"
    cp "assets/icons/yamindmap.icns" "$APP_DIR/Contents/Resources/yamindmap.icns"
    cat > "$APP_DIR/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>YaMindMap</string>
    <key>CFBundleDisplayName</key>
    <string>YaMindMap</string>
    <key>CFBundleIdentifier</key>
    <string>com.yamindmap.app</string>
    <key>CFBundleVersion</key>
    <string>0.1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>0.1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleExecutable</key>
    <string>yamindmap</string>
    <key>CFBundleIconFile</key>
    <string>yamindmap</string>
    <key>CFBundleIconName</key>
    <string>yamindmap</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>NSSupportsAutomaticGraphicsSwitching</key>
    <true/>
    <key>CFBundleDocumentTypes</key>
    <array>
        <dict>
            <key>CFBundleTypeName</key>
            <string>YaMindMap Document</string>
            <key>CFBundleTypeRole</key>
            <string>Editor</string>
            <key>LSHandlerRank</key>
            <string>Owner</string>
            <key>CFBundleTypeExtensions</key>
            <array>
                <string>yamind</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
PLIST
    echo "   macOS ARM bundle: $APP_DIR"
}

# --- Windows x86_64 ---
build_windows_x64() {
    echo ">> Building Windows x86_64 (x86_64-pc-windows-gnu)..."
    cargo build --release --target x86_64-pc-windows-gnu
    mkdir -p "$DIST_DIR/YaMindMap-windows-x64"
    cp "target/x86_64-pc-windows-gnu/release/yamindmap.exe" "$DIST_DIR/YaMindMap-windows-x64/"
    cp "assets/icons/yamindmap.ico" "$DIST_DIR/YaMindMap-windows-x64/"
    echo "   Windows x64: $DIST_DIR/YaMindMap-windows-x64/yamindmap.exe"
}

# --- Windows ARM ---
build_windows_arm() {
    echo ">> Building Windows ARM (aarch64-pc-windows-gnullvm)..."
    cargo build --release --target aarch64-pc-windows-gnullvm
    mkdir -p "$DIST_DIR/YaMindMap-windows-arm64"
    cp "target/aarch64-pc-windows-gnullvm/release/yamindmap.exe" "$DIST_DIR/YaMindMap-windows-arm64/"
    cp "assets/icons/yamindmap.ico" "$DIST_DIR/YaMindMap-windows-arm64/"
    echo "   Windows ARM: $DIST_DIR/YaMindMap-windows-arm64/yamindmap.exe"
}

# --- Linux x86_64 ---
build_linux_x64() {
    echo ">> Building Linux x86_64 (x86_64-unknown-linux-gnu)..."
    cargo build --release --target x86_64-unknown-linux-gnu
    mkdir -p "$DIST_DIR/YaMindMap-linux-x64"
    cp "target/x86_64-unknown-linux-gnu/release/yamindmap" "$DIST_DIR/YaMindMap-linux-x64/"
    cp "assets/icons/yamindmap_256.png" "$DIST_DIR/YaMindMap-linux-x64/yamindmap.png"
    # Desktop entry
    cat > "$DIST_DIR/YaMindMap-linux-x64/yamindmap.desktop" << DESKTOP
[Desktop Entry]
Name=YaMindMap
Exec=yamindmap
Icon=yamindmap
Type=Application
Categories=Office;
Comment=Mind Map Application
DESKTOP
    echo "   Linux x64: $DIST_DIR/YaMindMap-linux-x64/yamindmap"
}

# --- Linux ARM ---
build_linux_arm() {
    echo ">> Building Linux ARM (aarch64-unknown-linux-gnu)..."
    cargo build --release --target aarch64-unknown-linux-gnu
    mkdir -p "$DIST_DIR/YaMindMap-linux-arm64"
    cp "target/aarch64-unknown-linux-gnu/release/yamindmap" "$DIST_DIR/YaMindMap-linux-arm64/"
    cp "assets/icons/yamindmap_256.png" "$DIST_DIR/YaMindMap-linux-arm64/yamindmap.png"
    cat > "$DIST_DIR/YaMindMap-linux-arm64/yamindmap.desktop" << DESKTOP
[Desktop Entry]
Name=YaMindMap
Exec=yamindmap
Icon=yamindmap
Type=Application
Categories=Office;
Comment=Mind Map Application
DESKTOP
    echo "   Linux ARM: $DIST_DIR/YaMindMap-linux-arm64/yamindmap"
}

# Parse arguments or build all
if [ $# -eq 0 ]; then
    echo "Usage: $0 [macos-arm] [windows-x64] [windows-arm] [linux-x64] [linux-arm] [all]"
    echo ""
    echo "Cross-compilation requires the appropriate toolchains installed."
    echo "Install targets with: rustup target add <target-triple>"
    echo ""
    echo "For cross-compiling to Linux/Windows from macOS, you'll need"
    echo "cross-compilation toolchains (e.g., via cross, zig, or Docker)."
    exit 0
fi

for target in "$@"; do
    case "$target" in
        macos-arm)   build_macos_arm ;;
        windows-x64) build_windows_x64 ;;
        windows-arm) build_windows_arm ;;
        linux-x64)   build_linux_x64 ;;
        linux-arm)   build_linux_arm ;;
        all)
            build_macos_arm
            build_windows_x64
            build_windows_arm
            build_linux_x64
            build_linux_arm
            ;;
        *)
            echo "Unknown target: $target"
            echo "Valid targets: macos-arm, windows-x64, windows-arm, linux-x64, linux-arm, all"
            exit 1
            ;;
    esac
done

echo ""
echo "=== Build complete! Output in $DIST_DIR/ ==="
