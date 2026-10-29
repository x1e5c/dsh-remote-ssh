#!/usr/bin/env bash
# Manual SSH integration for the fixed remote-command quoting.
# Requires key-based access to the preset host and no DSH child-spawn sandbox
# around the shell that runs this script.
set -euo pipefail
cd "$(dirname "$0")/.."

remote_path=/root/data/agent-quote-test.txt
write_cmd=$(node -e "import('./remote-tools.js').then(m=>process.stdout.write(m.buildRemoteCommand(process.argv[1])))" \
  "mkdir -p '/root/data' && base64 -d > '${remote_path}'")

printf 'alpha' | base64 | ssh -o BatchMode=yes -o ConnectTimeout=8 -o LogLevel=ERROR aliyun "$write_cmd"
read_back=$(ssh -o BatchMode=yes -o ConnectTimeout=8 -o LogLevel=ERROR aliyun \
  "$(node -e "import('./remote-tools.js').then(m=>process.stdout.write(m.buildRemoteCommand(process.argv[1])))" \
    "cd -- '/root/data' && cat '${remote_path}'")")
test "$read_back" = "alpha"

edit_cmd=$(node -e "import('./remote-tools.js').then(m=>process.stdout.write(m.buildRemoteCommand(process.argv[1])))" \
  "cd -- '/root/data' && printf '%s\n' beta > '${remote_path}' && cat '${remote_path}' && rm -f '${remote_path}'")
edited=$(ssh -o BatchMode=yes -o ConnectTimeout=8 -o LogLevel=ERROR aliyun "$edit_cmd")
test "$edited" = "beta"

echo "remote quote integration OK: write=alpha read=alpha bash=beta cleanup=ok"
