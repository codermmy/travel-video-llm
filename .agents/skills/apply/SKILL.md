---
name: apply
description: This skill should be used when the user asks to "apply <prd-path>", "按照 PRD 完成工作", "根据这个 prd 去做", "implement this PRD", "execute this PRD", or provides a PRD/document path and wants end-to-end implementation tracked against the PRD task list.
version: 0.1.0
---

# Apply PRD

Use this skill when the user wants implementation driven directly from a PRD file and expects task progress to be reflected back into that PRD.

## Goal

Turn a PRD into executed work instead of just analysis, and keep the PRD task list synchronized with actual completion status.

## Workflow

### 1. Read the PRD first

- Open the PRD path the user provided.
- Read only the sections needed to execute safely:
  - background
  - goals
  - non-goals
  - requirements
  - task list
  - acceptance criteria
  - release/build impact
- If the PRD references other docs that are clearly required, read only those specific files.

### 2. Extract the execution contract

- Identify:
  - scope
  - out-of-scope items
  - concrete tasks with checkboxes
  - acceptance criteria
  - required verification commands
- Treat the PRD task list as the source of truth for progress tracking.

### 3. Inspect the current codebase before changing anything

- Check the relevant modules, APIs, and UI surfaces.
- Check for existing in-progress edits so they are not overwritten.
- Do not assume the PRD matches the current implementation; reconcile the PRD with real code first.

### 4. Execute tasks end-to-end

- Prefer finishing one task or one tightly related batch of tasks at a time.
- Implement code, tests, and validation together whenever feasible.
- Do not stop at analysis if the request is to apply the PRD.
- If a task depends on missing clarification or a risky product decision, stop and ask only that narrow question.

### 5. Update the PRD task list during execution

- Mark a PRD task from `[ ]` to `[x]` only when the corresponding work is actually done.
- “Done” means:
  - code changes are in place
  - basic verification for that task has passed, or the verification limitation is explicitly known
  - the task is no longer pending implementation
- Do not mark tasks complete based only on partial progress or intent.
- If a task is only partially done, leave it unchecked.
- If multiple PRD tasks are completed by one change, update each completed checkbox.

### 6. Keep task updates truthful

- Never mark future work complete just because the implementation seems likely to work.
- Never rewrite the PRD scope silently.
- If a task is blocked by a missing decision, keep it unchecked and explain the blocker in the final response.

### 7. Validate against acceptance criteria

- Run focused checks that match the PRD:
  - tests
  - type checks
  - lint
  - targeted manual validation
- Prefer the smallest validation set that proves the implemented tasks are complete.

## Task Tracking Rules

- Update the same PRD file the user asked to apply.
- Keep the existing wording of tasks unless the user asks to revise the PRD.
- Only change checkbox state by default.
- Avoid adding extra narrative into the PRD unless the user explicitly asks for documentation updates.

## Output Expectations

In the final response:

- state which PRD tasks were completed
- state which tasks remain unchecked
- state what was validated
- state whether rebuild, reinstall, migration, or restart is required
- provide exact commands when build/install/restart is needed

## Guardrails

- Respect the PRD non-goals.
- Respect repository-specific instructions such as AGENTS.md.
- If the PRD is large, do not try to complete unrelated tasks just because they are listed.
- When a PRD contains many tasks, keep progress incremental and keep the checkboxes accurate.
