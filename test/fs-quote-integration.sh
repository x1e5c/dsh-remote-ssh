#!/usr/bin/env bash
# Manual SSH integration for the remote-fs service command shapes.
set -euo pipefail
cd "$(dirname "$0")/.."

remote_cmd() {
  node -e "import('./remote-tools.js').then(m=>process.stdout.write(m.buildRemoteCommand(process.argv[1])))" "$1"
}

target=/root/data/agent-fs-quote-test.txt

printf 'alpha' | base64 | ssh -o BatchMode=yes -o ConnectTimeout=8 -o LogLevel=ERROR aliyun \
  "$(remote_cmd "mkdir -p '/root/data' && base64 -d > '${target}'")"

stat_out=$(ssh -o BatchMode=yes -o ConnectTimeout=8 -o LogLevel=ERROR aliyun \
  "$(remote_cmd "stat -c '%F|%s|%Y' -- '${target}'")")
case "$stat_out" in
  regular*"|5|"*) ;;
  *) echo "unexpected stat: $stat_out" >&2; exit 1 ;;
esac

read_out=$(ssh -o BatchMode=yes -o ConnectTimeout=8 -o LogLevel=ERROR aliyun \
  "$(remote_cmd "base64 < '${target}'")" | base64 -d)
test "$read_out" = "alpha"

list_out=$(ssh -o BatchMode=yes -o ConnectTimeout=8 -o LogLevel=ERROR aliyun \
  "$(remote_cmd "find '/root/data' -mindepth 1 -maxdepth 1 -printf '%f|%y|%s|%T@\\n'")")
echo "$list_out" | grep -q '^agent-fs-quote-test.txt|f|5|'

write_out=$(ssh -o BatchMode=yes -o ConnectTimeout=8 -o LogLevel=ERROR aliyun \
  "$(remote_cmd "base64 -d > '${target}' && cat '${target}'")" <<<"$(printf 'beta' | base64)")
test "$write_out" = "beta"

ssh -o BatchMode=yes -o ConnectTimeout=8 -o LogLevel=ERROR aliyun \
  "$(remote_cmd "rm -f '${target}'")"

echo "remote fs command integration OK: stat/read/list/write/cleanup"
