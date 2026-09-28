@AGENTS.md

## Claude Code

The import above carries the project instructions, including the managed
Turborepo block. Keep it as the first line — without it, Claude Code reads
only this file and Turborepo's guidance is silently dropped.

- Use plan mode before creating a new workspace package or wiring Module
  Federation. Both are decisions worth reviewing before files land.
- Don't scaffold ahead of what's needed now. Confirm before adding a package
  or a dependency that the current step doesn't require.
