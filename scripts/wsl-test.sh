#!/usr/bin/env bash
set -e
export PATH="/home/isaac/.nvm/versions/node/v22.23.2/bin:$PATH"
cd /home/isaac/documind-ai/app
echo "node: $(node --version)"
echo "npm: $(npm --version)"
exec npm test "$@"
