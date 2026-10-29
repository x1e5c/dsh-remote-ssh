#!/usr/bin/env bash
# Manual SSH integration for the remote-shell command shape.
set -euo pipefail
cd "$(dirname "$0")/.."

cmd=$(node -e "import('./remote-tools.js').then(m=>process.stdout.write(m.buildRemoteCommand(process.argv[1])))" \
  "cd -- '/root/data' && sh -lc 'pwd; echo shell-ok'")
out=$(ssh -o BatchMode=yes -o ConnectTimeout=8 -o LogLevel=ERROR aliyun "$cmd")
printf '%s\n' "$out" | grep -qx '/root/data'
printf '%s\n' "$out" | grep -qx 'shell-ok'
echo "remote shell command integration OK: pwd=/root/data shell-ok"
