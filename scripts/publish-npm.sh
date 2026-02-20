#!/bin/bash
# Publish to npm

set -e

cd "$(dirname "$0")"

NPM_REGISTRY="https://registry.npmjs.org/"

echo ""
echo "=== Publishing to npm ==="

# Check if NPM_TOKEN is set for non-interactive auth
if [ -n "$NPM_TOKEN" ]; then
    echo "Using NPM_TOKEN for authentication..."
    echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc
else
    echo "NPM_TOKEN not set. Checking npm login status..."

    # Try to get current user to check if logged in
    if ! npm whoami --registry $NPM_REGISTRY 2>/dev/null; then
        echo ""
        echo "Not logged in to npm. Please login first:"
        npm login --registry $NPM_REGISTRY
    fi
fi

echo ""
read -p "Continue with publish? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm version patch --registry $NPM_REGISTRY
    npm publish --registry $NPM_REGISTRY
    echo "=== Publish complete ==="

    # Clean up .npmrc if we created it
    if [ -n "$NPM_TOKEN" ] && [ -f .npmrc ]; then
        rm .npmrc
    fi
else
    echo "Publish cancelled"
fi
