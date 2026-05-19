# Agent Communication

This directory stores durable coordination notes for Mirabilis agent work. It is intentionally separate from chat history so the parent orchestration agent can resume after context compaction, app restart, or agent replacement.

## Files

- `status.md` is the single live orchestration status document.
- `TASK-xxx-slug.md` files store task-specific agent notes, recommendations, decisions, and handoff details.

## What To Record

For each agent handoff or major result, record:

- Timestamp.
- Task ID and human-readable task name.
- Agent nickname and role.
- Status: running, completed, blocked, stopped, or replaced.
- Write scope and files changed.
- Checks run.
- Findings or recommendations.
- Parent decision: accepted, rejected, deferred, or needs follow-up.
- Next action.

Do not paste long transcripts. Summarize what matters for future coordination.

## Relationship To Progress

`docs/implementation/progress.md` remains the durable roadmap ledger. Agent communication files track the live state and why orchestration decisions were made.
