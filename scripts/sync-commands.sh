#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

CLAUDE_COMMANDS="$PROJECT_ROOT/.claude/commands"
OPENCODE_COMMANDS="$PROJECT_ROOT/.opencode/commands"

CLAUDE_SKILLS="$PROJECT_ROOT/.claude/skills"
OPENCODE_SKILLS="$PROJECT_ROOT/.opencode/skills"
CODEX_SKILLS="$PROJECT_ROOT/.codex/skills"

SOURCE="opencode"
DRY_RUN=false
CHECK_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --check)
      CHECK_ONLY=true
      shift
      ;;
    *)
      echo "Unknown arg: $1"
      exit 1
      ;;
  esac
done

if [[ "$SOURCE" != "claude" && "$SOURCE" != "opencode" ]]; then
  echo "--source must be claude or opencode"
  exit 1
fi

if [[ "$SOURCE" == "claude" ]]; then
  SRC_COMMANDS="$CLAUDE_COMMANDS"
  SRC_SKILLS="$CLAUDE_SKILLS"
  PEER_COMMANDS="$OPENCODE_COMMANDS"
  PEER_SKILLS="$OPENCODE_SKILLS"
  SOURCE_LABEL="Claude Code"
else
  SRC_COMMANDS="$OPENCODE_COMMANDS"
  SRC_SKILLS="$OPENCODE_SKILLS"
  PEER_COMMANDS="$CLAUDE_COMMANDS"
  PEER_SKILLS="$CLAUDE_SKILLS"
  SOURCE_LABEL="OpenCode"
fi

if [[ ! -d "$SRC_COMMANDS" ]]; then
  echo "Source commands dir not found: $SRC_COMMANDS"
  exit 1
fi

if [[ ! -d "$SRC_SKILLS" ]]; then
  echo "Source skills dir not found: $SRC_SKILLS"
  exit 1
fi

run_or_print() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY: $*"
  else
    eval "$*"
  fi
}

sync_commands_to_peer() {
  echo "Syncing commands: $SRC_COMMANDS -> $PEER_COMMANDS"
  run_or_print "mkdir -p \"$PEER_COMMANDS\""

  while IFS= read -r -d '' file; do
    rel="${file#$SRC_COMMANDS/}"
    target="$PEER_COMMANDS/$rel"
    target_dir="$(dirname "$target")"
    run_or_print "mkdir -p \"$target_dir\""
    run_or_print "cp \"$file\" \"$target\""
  done < <(find "$SRC_COMMANDS" -type f -name '*.md' -print0)
}

extract_frontmatter_description() {
  local file="$1"
  awk '
    BEGIN {inFM=0; count=0}
    /^---$/ {count++; if (count==1) {inFM=1; next} if (count==2) {inFM=0; exit}}
    inFM && /^description:[[:space:]]*/ {
      sub(/^description:[[:space:]]*/, "")
      print
    }
  ' "$file" | head -1
}

extract_body_without_frontmatter() {
  local file="$1"
  awk '
    BEGIN {count=0}
    /^---$/ {count++; next}
    count>=2 {print}
  ' "$file"
}

commands_to_codex_skills() {
  echo "Converting commands -> Codex skills"
  run_or_print "mkdir -p \"$CODEX_SKILLS\""

  while IFS= read -r -d '' file; do
    rel="${file#$SRC_COMMANDS/}"
    skill_name="${rel%.md}"
    skill_name="${skill_name//\//-}"
    skill_dir="$CODEX_SKILLS/$skill_name"
    skill_file="$skill_dir/SKILL.md"

    desc="$(extract_frontmatter_description "$file")"
    if [[ -z "$desc" ]]; then
      desc="Execute $skill_name workflow"
    fi
    body="$(extract_body_without_frontmatter "$file")"

    if [[ "$DRY_RUN" == "true" ]]; then
      echo "DRY: write $skill_file"
    else
      mkdir -p "$skill_dir"
      cat > "$skill_file" <<EOF
---
name: $skill_name
description: $desc Use \$$skill_name to invoke this skill.
---
$body

## How to invoke

- Type \`\$$skill_name\` in Codex
- Or describe your intent naturally (Codex will match based on description)

## Original command

This skill was converted from ${SOURCE_LABEL} command: \`$rel\`
EOF
    fi
  done < <(find "$SRC_COMMANDS" -type f -name '*.md' -print0)
}

skills_to_peer_and_codex() {
  echo "Syncing skills: $SRC_SKILLS -> $PEER_SKILLS and $CODEX_SKILLS"
  run_or_print "mkdir -p \"$PEER_SKILLS\" \"$CODEX_SKILLS\""

  while IFS= read -r -d '' file; do
    skill_name="$(basename "$(dirname "$file")")"
    peer_skill_dir="$PEER_SKILLS/$skill_name"
    codex_skill_dir="$CODEX_SKILLS/$skill_name"
    run_or_print "mkdir -p \"$peer_skill_dir\" \"$codex_skill_dir\""
    run_or_print "cp \"$file\" \"$peer_skill_dir/SKILL.md\""
    run_or_print "cp \"$file\" \"$codex_skill_dir/SKILL.md\""
  done < <(find "$SRC_SKILLS" -type f -name 'SKILL.md' -print0)
}

check_consistency() {
  local failed=0
  echo "Checking command consistency between source and peer..."
  while IFS= read -r -d '' file; do
    rel="${file#$SRC_COMMANDS/}"
    peer_file="$PEER_COMMANDS/$rel"
    if [[ ! -f "$peer_file" ]]; then
      echo "MISSING command in peer: $rel"
      failed=1
      continue
    fi
    if ! cmp -s "$file" "$peer_file"; then
      echo "DRIFT command: $rel"
      failed=1
    fi
  done < <(find "$SRC_COMMANDS" -type f -name '*.md' -print0)

  echo "Checking skill consistency between source and peer/codex..."
  while IFS= read -r -d '' file; do
    skill_name="$(basename "$(dirname "$file")")"
    peer_file="$PEER_SKILLS/$skill_name/SKILL.md"
    codex_file="$CODEX_SKILLS/$skill_name/SKILL.md"
    if [[ ! -f "$peer_file" ]]; then
      echo "MISSING peer skill: $skill_name"
      failed=1
    elif ! cmp -s "$file" "$peer_file"; then
      echo "DRIFT peer skill: $skill_name"
      failed=1
    fi
    if [[ ! -f "$codex_file" ]]; then
      echo "MISSING codex skill: $skill_name"
      failed=1
    elif ! cmp -s "$file" "$codex_file"; then
      echo "DRIFT codex skill: $skill_name"
      failed=1
    fi
  done < <(find "$SRC_SKILLS" -type f -name 'SKILL.md' -print0)

  if [[ "$failed" -eq 1 ]]; then
    echo "Consistency check FAILED"
    exit 2
  fi
  echo "Consistency check PASSED"
}

echo "============================================================"
echo " Cross-Tool Command/Skill Sync"
echo " Source: $SOURCE_LABEL"
echo "============================================================"

if [[ "$CHECK_ONLY" == "true" ]]; then
  check_consistency
  exit 0
fi

sync_commands_to_peer
commands_to_codex_skills
skills_to_peer_and_codex

if [[ "$DRY_RUN" == "false" ]]; then
  check_consistency
fi

echo "Done."
