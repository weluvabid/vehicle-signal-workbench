#!/bin/sh
set -eu

repo_root=$(git rev-parse --show-toplevel)
configured_path=$(git -C "$repo_root" config --local --get core.hooksPath || true)

if [ -n "$configured_path" ] && [ "$configured_path" != ".githooks" ]; then
  echo "A custom core.hooksPath is already configured: $configured_path" >&2
  echo "Leaving the existing hook configuration untouched." >&2
  exit 0
fi

git -C "$repo_root" config core.hooksPath .githooks
echo "Git hooks configured: .githooks"
