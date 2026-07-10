# AI Handoff Prompt

Use this before starting a fresh chat or switching from planning to
implementation/review/release.

```text
Create a compact handoff for the next chat.

Include:
- project path
- branch and git status summary
- goal
- mode for the next chat
- files changed
- decisions made
- commands/checks run and results
- unresolved risks
- pre-existing local modifications
- next 3 steps

Keep it concise. Do not include full diffs unless asked.
```
