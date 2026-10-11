# claude-mods

John Egan's personal Claude Code mods, published as the `egan-dev-mods` marketplace.

| Mod | What it does |
| --- | --- |
| `model-dial` | Clickable model and effort chips above the prompt, plus `/dial [model] [effort]`. |

## Install

```bash
claude plugin marketplace add jmegan/claude-mods
claude plugin install model-dial@egan-dev-mods --scope user
```

To edit a mod live, add the local clone instead (`claude plugin marketplace add ~/Developer/claude-mods`), edit the source, then run `/reload-plugins`.

## Check

```bash
claude plugin validate .
claude plugin test model-dial
```
