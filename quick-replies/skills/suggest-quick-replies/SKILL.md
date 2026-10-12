---
name: suggest-quick-replies
description: Mine the person's local Claude Code prompt history for short messages they repeat, and propose new quick-reply buttons for the quick-replies mod. Use when asked to suggest, find, refresh or tune quick replies, or after /qr suggest.
---

# Suggest quick replies

Find the replies this person types again and again, and turn the best into buttons in their
`quick-replies.json`. Everything stays on this machine: read local files only, and never paste
history into a web tool, a ticket or another service.

## 1. Mine the history

Run the script that sits beside this file, in `scripts/mine-history.mjs` under this skill's base
directory:

```bash
node <skill base directory>/scripts/mine-history.mjs --format json --min-count 3 --max-len 200
```

It reads `history.jsonl` from every Claude config folder it finds (`$CLAUDE_CONFIG_DIR`,
`~/.claude`, `~/.claude-personal`; add `--dir <folder>` for another) and prints:

- `exact`: whole messages typed at least `--min-count` times, with sessions, projects and last-used date.
- `clusters`: families of different messages that open with the same three words.
- `slashCommands`: the most-used slash commands, for context only. A slash command is not a quick reply.

Useful flags: `--since-days 90` to favor recent habits, `--min-count 2` for a small history,
`--format text` for a quick read.

The script drops pasted-content stubs and anything shaped like a token or key. If a candidate still
looks private, leave it out.

## 2. Read what already exists

Find the config path with the `/qr path` command (or `$CLAUDE_CONFIG_DIR/quick-replies.json`), read
it, and read `hooks/defaults.ts` in the mod folder. Never suggest a button that duplicates an
existing id, label or meaning.

## 3. Judge the candidates

Keep a candidate when it is:

- **Repeated across sessions**, not typed 20 times in one. Prefer high `sessions`.
- **Context-free**: it works as a reply to almost any Claude message ("continue", "try again", "commit").
- **Short and imperative**, or a standing instruction ("use subagents", "verify with the docs").

Skip a candidate when it names a file, ticket, branch or product detail, carries a secret, or is a
greeting or a one-off ("hello", "login").

Then clean up:

1. **Merge near-duplicates and typos** into one button (`continue`, `conitnue`, `and continue`, `Looks good, continue.`).
2. **Write the button text as a complete instruction** to Claude, not the person's shorthand. `commit` becomes
   "Commit just the changes you made in this session." Keep the person's own phrasing where it carries a rule they care about.
3. **Pick a label of 14 characters or fewer** in sentence case.
4. **Set `when: "asking"`** for a reply that only makes sense after Claude asks something ("No, don't do that").
5. **Set `send: false`** when the reply is a start the person must finish ("Explain that more simply: ").
6. **Set `more: true`** for buttons used less than about once a week, so the main row stays short (aim for 8 or fewer in the main row).
7. **Cluster, don't copy.** For a family like "use X to verify", propose one button that covers it.

## 4. Propose, then write

Show a compact table: label, the text it will send, and the evidence (`count`, `sessions`). Then ask which
to add with the `AskUserQuestion` tool (multi-select), including a "none of these" outcome.

Write only what the person approves. Edit the config file's `replies` array (create the file if it is
missing), keeping existing entries and key order. Fields:

```json
{
  "id": "short-kebab-id",
  "label": "Label",
  "text": "What the button sends.",
  "send": true,
  "more": false,
  "style": "outline",
  "color": "info",
  "key": "t"
}
```

`label` and `text` are required; the rest are optional. `color` is a role that follows the person's theme:
`go`, `ask`, `info`, `caution`, `stop`, `git`, `plan`, `agent` or `neutral` (a theme key or hex also works). To change a default instead of adding one, use
`patch` (`{ "stop": { "more": true } }`); to remove one, list its id in `hide`.

The buttons update after the next turn, or right away with `/qr reload`. Finish with the path of the
file and the number of buttons added.
