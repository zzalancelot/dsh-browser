#!/bin/bash
# Double-click in Finder (macOS) to run install-dev.sh
cd "$(dirname "$0")/.."
./scripts/install-dev.sh
echo
echo "Press Enter to close…"
read -r
