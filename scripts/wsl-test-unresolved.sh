#!/usr/bin/env bash
export PATH="/home/isaac/.nvm/versions/node/v22.23.2/bin:$PATH"
cd /home/isaac/documind-ai/app
exec npx vitest run src/lib/i18n/__tests__/unresolved-keys.test.ts --reporter=verbose 2>&1
