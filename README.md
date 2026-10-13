# claude-mods

Small, practical [Claude Code](https://code.claude.com/docs) mods by John Egan, published as the
`egan-dev-mods` plugin marketplace. Each mod changes one thing about how Claude Code looks or behaves,
and each mod is configurable, so your preferences stay on your machine.

| Mod | What it does |
| --- | --- |
| [`model-dial`](model-dial) | Clickable model and effort chips above the prompt, plus `/dial [model] [effort]`. |
| [`quick-replies`](quick-replies) | Clickable reply buttons above the prompt (Continue, Ask me, Try again, your own), `/qr`, and a skill that mines your history for suggestions. |

## Install

Type these at the prompt of a Claude Code terminal session:

```text
/plugin marketplace add jmegan/claude-mods
/plugin install model-dial@egan-dev-mods
/plugin install quick-replies@egan-dev-mods
```

Or use the shell:

```bash
claude plugin marketplace add jmegan/claude-mods
claude plugin install model-dial@egan-dev-mods --scope user
claude plugin install quick-replies@egan-dev-mods --scope user
```

Mods that have settings show a screen at install time. Change them later in the `/plugin` menu.

## Make it yours

No mod in this repository holds a personal value. Each mod reads your preferences from your own machine, so
you never edit the mod to personalize it, and updates never overwrite your choices.

| Mod | Where your preferences live |
| --- | --- |
| `model-dial` | The **Models** option (`userConfig`), for example `opus,sonnet,haiku`. |
| `quick-replies` | A local file, `quick-replies.json`, in your Claude config folder (`$CLAUDE_CONFIG_DIR`, else `~/.claude`), or the path in the **Config file** option. Start from [`quick-replies.example.json`](quick-replies/quick-replies.example.json). |

## Make your own mod

A mod is a Claude Code plugin whose main file is a hooks module. Three files make the smallest mod:

```text
my-mod/
├── .claude-plugin/plugin.json   name, version, description, options
├── hooks/hooks.json             { "modules": ["./register.tsx"] }
└── hooks/register.tsx           export const register: Register = (on, options) => { ... }
```

A hook has the shape `($, e, next)`:

- `$` is the engine interface. Each call has a noun and a method, such as `$.ui.toast(text)`.
- `e` is the event's input, a plain frozen value.
- `next(e)` runs the plugins beneath and then the engine's own behavior. A hook that returns without
  calling `next` answers for itself. `next({ ...e, x })` rewrites what the rest sees.

The module runs in its own environment, with no DOM and no Node. `$` reaches everything outside it.

### What you can build

| You want | Use |
| --- | --- |
| A pane, panel or sidebar | `$.ui.open({ id, title })` and a `ui.render` hook on `{ component: 'Pane' }` |
| A band above the prompt | A `ui.render` hook on `{ component: 'AbovePrompt' }` |
| A status line entry or a toast | `$.ui.status(text)` or `$.ui.toast(text)` |
| To block or rewrite a tool call | `on('tool.call', { tool }, hook)` |
| To change a prompt | `on('prompt.submit', hook)` |
| To change the system prompt | `on('prompt.compose', hook)` |
| A slash command | `$.command.register({ name, description })` in `session.start`, answered by a `command.run` hook |
| Values that a drawing reads | `$.state` (one session) or `$.store` (across sessions), typed by a contract in `types/index.d.ts` |
| Timers, files, processes, model calls | `$.clock`, `$.fs`, `$.process`, `$.model` |

Study the two mods here for working examples: `model-dial` is a band with a command, and `quick-replies` adds
config files, hotkeys, a skill and a script.

### Write a mod that anyone can personalize

Follow these rules for every mod, even one you build only for yourself. Then sharing it later takes no rework.

1. **Never hard-code a personal value.** Names, paths, model lists, button text and hotkeys come from
   configuration, with a sensible default.
2. **Use `userConfig` for a few simple options.** Declare each option in `plugin.json`, then read it from the
   `options` argument of `register`. Give every option a `default`, and a list of `options` for a picker:

   ```json
   "userConfig": {
     "models": {
       "type": "string",
       "title": "Models",
       "description": "Comma-separated model aliases, in order.",
       "default": "opus,sonnet,haiku"
     }
   }
   ```

   Claude Code stores the values in the user's settings, under `pluginConfigs`. They stay out of the repository.
3. **Use a local file for anything bigger.** A list of buttons, rules or snippets belongs in a JSON file in the
   user's Claude config folder. Let a `configPath` option override the location. Commit a
   `<mod>.example.json` and never commit a real config.
4. **Fail soft.** A bad config file keeps the defaults and shows a toast that names the problem. It never
   breaks the mod.
5. **Do not trust the project folder.** A cloned repository can contain a config file. If a mod reads project
   files, make that opt-in and off by default, as `quick-replies` does with **Project buttons**.
6. **Read local data only on request.** A skill or script that reads the user's history runs locally, skips
   anything that looks like a secret, and prints only what the user approves.
7. **Document the options.** The mod's README lists every option and config field with its default.

### Develop and check

```bash
claude --plugin-dir ./my-mod      # load the mod for one session; saved edits reload it
claude --debug                    # shows why a hook was skipped or a tree was refused
claude plugin validate ./my-mod   # reads the manifest and module; reports what the engine refuses
claude plugin test ./my-mod       # runs the mod's *.test.ts files against the engine
```

To edit an installed mod live, add your clone as the marketplace
(`claude plugin marketplace add ~/path/to/claude-mods`), edit the source, then run `/reload-plugins`.

Write at least one `*.test.ts` for the behavior the mod adds. A test receives the user's options with
`test(name, { options }, body)`, so test both the defaults and a custom config.

For editor types, a mod that Claude Code loads from a folder gets declarations in `.claude-plugin/types/`.
Run `tsc -p <mod folder>` to type-check it. That folder is generated, so it stays out of Git (see
[`.gitignore`](.gitignore)).

### Share a mod

1. Put the mod in a folder of this repository, or in a repository of its own.
2. List it in `.claude-plugin/marketplace.json`:

   ```json
   {
     "name": "<marketplace>",
     "owner": { "name": "<author>" },
     "plugins": [{ "name": "<mod>", "source": "./<mod>" }]
   }
   ```

   For a repository that holds a single mod, set `"source": "./"`.
3. Run `claude plugin validate .` from the repository root.
4. Give people the install line: `/plugin install <mod> --marketplace <owner>/<repo>`.

Before you make a repository public, read your last commit and your history for personal paths, tokens and
email addresses. A public repository exposes every commit, not just the current files.

## Check this repository

```bash
claude plugin validate .
claude plugin test model-dial
claude plugin test quick-replies
```

## Documentation

- [Create plugins](https://code.claude.com/docs/en/plugins): the plugin structure and how to build one
- [Plugins reference](https://code.claude.com/docs/en/plugins-reference): manifest fields, `userConfig` and the CLI commands
- [Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces): publish a marketplace
- [Discover and install plugins](https://code.claude.com/docs/en/discover-plugins): how users add marketplaces
- [Hooks](https://code.claude.com/docs/en/hooks): the classic hooks that run shell commands
- [Skills](https://code.claude.com/docs/en/skills): the skills that a mod can ship
- [Settings](https://code.claude.com/docs/en/settings): where Claude Code stores `pluginConfigs`

The function-hook API (`on`, `$`, the events and the elements) has no web page. Claude Code writes its type
declarations next to a mod it loads from a folder, in `.claude-plugin/types/claude-code/index.d.ts`. Search
that file for an event or noun, because each entry has a doc comment and an example.

## License

[MIT](LICENSE)
