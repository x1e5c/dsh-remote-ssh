#!/usr/bin/env bash
# Manual SSH PTY integration for the remote terminal backend command.
set -euo pipefail
cd "$(dirname "$0")/.."

out=$(printf 'pwd; echo term-ok\nexit\n' | timeout 15 ssh -tt \
  -o BatchMode=yes -o ConnectTimeout=8 -o LogLevel=ERROR aliyun \
  "cd -- '/root/data' && exec bash -i" 2>&1)
printf '%s\n' "$out" | grep -q '^/root/data$'
printf '%s\n' "$out" | grep -q '^term-ok$'
echo "remote terminal PTY integration OK: /root/data term-ok"
