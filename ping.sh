#!/usr/bin/env bash

# Quick bash test script to check the health endpoint directly
ENDPOINT="https://api.pgkhata.com/health"

echo "Checking $ENDPOINT..."
START=$(date +%s%N)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 60 "$ENDPOINT")
END=$(date +%s%N)

DIFF=$(( (END - START) / 1000000 ))

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✅ UP: HTTP $HTTP_CODE in ${DIFF}ms"
  exit 0
else
  echo "❌ DOWN / ERROR: HTTP $HTTP_CODE in ${DIFF}ms"
  exit 1
fi
