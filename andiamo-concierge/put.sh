#!/bin/sh
# Pushes recs_body.json to the Andiamo page. Needs ANDIAMO_KEY in the environment; never echoes it.
set -e
cd "$(dirname "$0")"
[ -n "$ANDIAMO_KEY" ] || { echo "ANDIAMO_KEY is not set"; exit 1; }
curl -sS -X PUT --data-binary @recs_body.json -H 'content-type: application/json' -H "x-key: $ANDIAMO_KEY" https://andiamo-4fec3766.pages.dev/api/recs; echo
curl -sS https://andiamo-4fec3766.pages.dev/api/state | python3 -c 'import json,sys;r=json.load(sys.stdin)["recs"];print("updated:",r["updated"],"items:",len(r["items"]))'
