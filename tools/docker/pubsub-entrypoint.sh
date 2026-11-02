#!/bin/sh
set -eu

PROJECT="${PUBSUB_PROJECT_ID}"
API="http://localhost:8086/v1/projects/${PROJECT}"

gcloud beta emulators pubsub start --project="${PROJECT}" --host-port=0.0.0.0:8086 &
EMULATOR=$!
trap 'trap - TERM INT; kill 0' TERM INT

until curl -fs http://localhost:8086 >/dev/null 2>&1; do
	sleep 1
done

curl -fsS -X PUT "${API}/topics/jobs" >/dev/null

create_subscription() {
	curl -fsS -X PUT "${API}/subscriptions/$1" \
		-H "Content-Type: application/json" \
		-d "{\"topic\": \"projects/${PROJECT}/topics/jobs\", \"filter\": \"$2\"}" >/dev/null
}

create_subscription jobs-worker-standard 'NOT attributes.type = \"asset.render-letter\"'
create_subscription jobs-worker-render 'attributes.type = \"asset.render-letter\"'

echo "pubsub ready: topic jobs, subscriptions jobs-worker-standard and jobs-worker-render"

wait "${EMULATOR}"
