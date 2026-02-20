#!/bin/bash
# T'aksi iOS Build Script
# This script builds the iOS version of the T'aksi app using Capacitor

set -e

echo "🚀 T'aksi iOS Build Script"
echo "=========================="

# Navigate to frontend directory
cd /app/frontend

# Step 1: Build the production version
echo "📦 Building production bundle..."
yarn build

# Step 2: Sync Capacitor
echo "🔄 Syncing Capacitor..."
npx cap sync ios

# Step 3: Open Xcode (if on macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 Opening Xcode..."
    npx cap open ios
    echo ""
    echo "✅ iOS project opened in Xcode!"
    echo ""
    echo "📝 Next steps in Xcode:"
    echo "   1. Select your Development Team in Signing & Capabilities"
    echo "   2. Update Bundle Identifier if needed (currently: com.taksi.app)"
    echo "   3. Archive the app for distribution"
    echo "   4. Upload to App Store Connect"
else
    echo "⚠️  This script is not running on macOS."
    echo "   To build for iOS, you need to run this on a Mac with Xcode installed."
    echo ""
    echo "📁 The iOS project is ready at: /app/frontend/ios/"
    echo "   Copy this project to a Mac to continue building."
fi

echo ""
echo "🎉 Build process complete!"
