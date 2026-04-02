#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
URL_FILE="${1:-$ROOT_DIR/scripts/pixabay-travel-music-urls.txt}"
WAIT_AFTER_NAVIGATE_SEC="${WAIT_AFTER_NAVIGATE_SEC:-4}"
CLICK_TIMEOUT_SEC="${CLICK_TIMEOUT_SEC:-18}"
WAIT_AFTER_CLICK_SEC="${WAIT_AFTER_CLICK_SEC:-6}"
START_INDEX="${START_INDEX:-1}"

if [[ ! -f "$URL_FILE" ]]; then
  echo "URL file not found: $URL_FILE" >&2
  exit 1
fi

if ! command -v osascript >/dev/null 2>&1; then
  echo "osascript is required on macOS." >&2
  exit 1
fi

URLS=()
while IFS= read -r line; do
  if [[ "$line" =~ ^https://pixabay\.com/music/ ]]; then
    URLS+=("$line")
  fi
done <"$URL_FILE"

if [[ "${#URLS[@]}" -eq 0 ]]; then
  echo "No Pixabay music URLs found in $URL_FILE" >&2
  exit 1
fi

open_url() {
  local target_url="$1"
  osascript - "$target_url" <<'OSA' >/dev/null
on run argv
  set targetUrl to item 1 of argv
  tell application "Google Chrome"
    activate
    if (count of windows) = 0 then
      make new window
    end if
    set URL of active tab of front window to targetUrl
  end tell
end run
OSA
}

click_free_download() {
  osascript <<'OSA'
tell application "Google Chrome"
  execute front window's active tab javascript "
    (() => {
      const button = [...document.querySelectorAll('button')].find(
        (node) => /free download/i.test((node.textContent || '').trim())
      );
      if (!button) return 'not-found';
      button.click();
      return 'clicked';
    })();
  "
end tell
OSA
}

echo "Using URL file: $URL_FILE"
echo "Total URLs: ${#URLS[@]}"
echo "Starting from item: $START_INDEX"

index=0
for url in "${URLS[@]}"; do
  index=$((index + 1))
  if (( index < START_INDEX )); then
    continue
  fi

  echo
  echo "[$index/${#URLS[@]}] Opening $url"
  open_url "$url"
  sleep "$WAIT_AFTER_NAVIGATE_SEC"

  clicked=0
  for ((attempt = 1; attempt <= CLICK_TIMEOUT_SEC; attempt++)); do
    result="$(click_free_download 2>/dev/null || true)"
    if [[ "$result" == *"clicked"* ]]; then
      clicked=1
      echo "  clicked free download"
      break
    fi
    sleep 1
  done

  if (( clicked == 0 )); then
    echo "  failed to find free download button"
    continue
  fi

  sleep "$WAIT_AFTER_CLICK_SEC"
done

echo
echo "Batch run finished."
