#!/bin/bash
set -e

BIN_NAME="yamindmap"
APP_NAME="YaMindMap"
APP_DIR="target/release/${APP_NAME}.app"

echo "Building release..."
cargo build --release

echo "Creating app bundle..."
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# Copy binary
cp "target/release/${BIN_NAME}" "$APP_DIR/Contents/MacOS/${BIN_NAME}"

# Copy icon
cp "assets/icons/yamindmap.icns" "$APP_DIR/Contents/Resources/yamindmap.icns"

# Create Info.plist
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
            <key>CFBundleTypeIconFile</key>
            <string>yamindmap</string>
        </dict>
    </array>
</dict>
</plist>
PLIST

echo "Done! App bundle at: $APP_DIR"
echo ""
echo "To install: cp -r \"$APP_DIR\" /Applications/"
echo "To run:     open \"$APP_DIR\""
