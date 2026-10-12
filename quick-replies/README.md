# quick-replies

Clickable reply buttons above the Claude Code prompt. One click sends the text you type most
often (Continue, Ask me questions, Try again, Commit), as your own words.

## Use

- Click a button, or press `ctrl+x`, `Tab` to focus the band, then its hotkey.
- `more N ›` expands the less-used buttons.
- A button marked `send: false` adds its text to your draft instead, so you can finish the sentence.
- While Claude works, a click queues the reply for after the turn.
- **No** appears only while Claude's last message ends in a question, and goes once you reply. Any button
  can do the same with `"when": "asking"`.
- `/qr` shows how often you have used each button, so you can prune the ones you never press. The row never
  re-sorts by use, because a button that moves under your pointer is worse than an unsorted row.

### Commands

| Command | What it does |
| --- | --- |
| `/qr` | List the buttons with numbers, ids and hotkeys |
| `/qr <number or id>` | Send that reply now |
| `/qr add <label> :: <text>` | Add a button to your config file |
| `/qr remove <id>` | Remove one of yours, or hide a default |
| `/qr reload` | Re-read the config (it also reloads after every turn) |
| `/qr hide` / `/qr show` | Hide or show the band (remembered across sessions) |
| `/qr suggest` | Ask Claude to mine your history for new buttons |

## Configure

Your buttons live in a local file, `quick-replies.json` in your Claude config folder
(`$CLAUDE_CONFIG_DIR`, else `~/.claude`). Set the **Config file** option to use another path.
See `quick-replies.example.json`. Every field is optional:

| Field | Meaning |
| --- | --- |
| `mode` | `merge` (default) adds to the built-in buttons; `replace` uses only yours |
| `order` | `yours-first` (default) or `defaults-first` |
| `hotkeys` | `auto` (default) gives each button a hotkey; `off` assigns none (an explicit `key` still counts) |
| `hide` | Ids of built-in buttons to remove |
| `patch` | Overrides for a built-in by id: `{ "stop": { "more": true } }` |
| `replies` | Your buttons. Required: `label`, `text`. Optional: `id`, `send`, `more`, `when` (`always`/`asking`), `style` (`solid`/`outline`), `color`, `key` |

### Project buttons (opt in)

Set the **Project buttons** option to `on` to also read `.claude/quick-replies.json` in the project folder.
It is off by default because a cloned repository could ship a button that sends text as you. A project file
can only **add** buttons: it cannot replace, patch, hide or reorder yours, and a button that reuses one of
your ids is dropped. Its buttons carry a `◆` and `/qr` marks them `[project]`.

### Colors

Set `color` to a **role**, a theme key, or a raw color. Roles and theme keys follow your terminal
theme (light, dark, color-blind), and a solid chip picks readable text on its own, so prefer them to hex.

| Role | Theme key | Use for |
| --- | --- | --- |
| `go` | `success` | Continue, Yes |
| `ask` | `permission` | Questions for you |
| `info` | `suggestion` | Status, Try again, docs |
| `caution` | `warning` | Verify, Review |
| `stop` | `error` | Stop, destructive |
| `git` | `merged` | Commit, push, merge |
| `plan` | `planMode` | Plan first |
| `agent` | `claude` | Subagents, your call |
| `neutral` | `subtle` | Everything else (the default) |

## Works with other mods

The band draws the bands of other mods too and stacks its row beneath them, so a mod that also hooks
the area above the prompt (`model-dial`, a status band) stays visible. Element keys start with `qr-`.
Turn automatic hotkeys off if another band's hotkeys clash.

A bad file never breaks the band: you keep the built-in buttons and get a toast naming the problem.

## Suggestions from your own history

The `suggest-quick-replies` skill (run `/qr suggest`) scans your local `history.jsonl` for messages
you repeat across sessions, proposes buttons with the evidence, and writes the ones you approve.
It reads local files only. `skills/suggest-quick-replies/scripts/mine-history.mjs` does the counting
and runs on its own: `node mine-history.mjs --format text`.

## Develop

```bash
claude plugin validate .
claude plugin test .
```

## Share

Put this folder in a GitHub repository with `.claude-plugin/marketplace.json`:

```json
{ "name": "quick-replies", "owner": { "name": "<you>" }, "plugins": [{ "name": "quick-replies", "source": "./" }] }
```

Others install it with `/plugin install quick-replies --marketplace <owner>/<repo>`.
Each person gets their own config file and their own history-based suggestions.
