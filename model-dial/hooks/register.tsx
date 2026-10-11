import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register } from 'claude-code'

import type { Dial, Effort } from '../types'

const dial = atom({ plugin: 'model-dial', key: 'dial' } as const, {
  model: null,
  effort: null,
  pendingModel: null,
  pendingEffort: null,
  isEffortIgnored: false,
})

const PANE = 'model-dial'
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const EFFORT_SHORT: Record<Effort, string> = { low: 'low', medium: 'med', high: 'high', xhigh: 'xhigh', max: 'max' }
const EFFORT_BLURB: Record<Effort, string> = {
  low: 'quick answers, lowest cost',
  medium: 'everyday work',
  high: 'harder problems',
  xhigh: 'deep, multi-step work',
  max: 'everything it has',
}
// Effort heats up from green to red, so the level reads at a glance.
const EFFORT_INK: Record<Effort, string> = {
  low: '#7FB069',
  medium: '#C9B458',
  high: '#E5A050',
  xhigh: '#E07A55',
  max: '#D9534F',
}
const MODEL_INK: Record<string, string> = { opus: '#D97757', sonnet: '#6A9BCC', haiku: '#7FB069', fable: '#B48EAD' }
const MODEL_BLURB: Record<string, string> = {
  opus: 'most capable',
  sonnet: 'fast, strong at code',
  haiku: 'quickest, cheapest',
  fable: 'largest',
}
const CHIP_TEXT = '#1B1B1B'
// Cells one row needs past the model chips: the separator, five effort chips with their
// gaps, and `n/a` (plus 2 for a pending chip's `…`). The `after turn` note shows only if it fits.
const EFFORT_COLUMNS = 5 + EFFORTS.reduce((n, level) => n + EFFORT_SHORT[level].length + 3, 0) + 4 + 2
const NOTE_COLUMNS = 11

type El = Pick<ElementTable, 'Box' | 'Text' | 'Button'>

const familyOf = (model: string | null): string | null =>
  model?.toLowerCase().match(/opus|sonnet|haiku|fable/)?.[0] ?? null

const titleCase = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)

/** `claude-opus-5-5` → `Opus 5.5`; an alias → its family; anything else as given. */
const displayName = (model: string | null): string => {
  if (model === null) return 'default'
  const family = familyOf(model)
  if (family === null) return model
  const version = model.match(/(\d+)[-.](\d+)/)
  return version ? `${titleCase(family)} ${version[1]}.${version[2]}` : titleCase(family)
}

const asEffort = (value: unknown): Effort | null =>
  typeof value === 'string' && (EFFORTS as readonly string[]).includes(value) ? (value as Effort) : null

/** Reads a typed token as an effort level, accepting `med` and `x` shorthands. */
const parseEffort = (token: string): Effort | null => {
  const t = token.toLowerCase()
  if (t === 'med' || t === 'mid') return 'medium'
  if (t === 'x' || t === 'xh') return 'xhigh'
  return asEffort(t)
}

const parseModels = (raw: unknown): string[] => {
  const list = typeof raw === 'string' ? raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : []
  return list.length > 0 ? list : ['opus', 'sonnet', 'haiku']
}

const setModel = async ($: EngineInterface, alias: string): Promise<void> => {
  await update($, dial, d => ({ ...d, pendingModel: alias }))
  try {
    await $.command.run({ command: 'model', args: alias })
    // Our own command.run hook skips a run this plugin made, so read the result back here.
    const model = await $.session.model()
    await update($, dial, d => ({ ...d, model, pendingModel: null, isEffortIgnored: false }))
  } catch (err) {
    await update($, dial, d => ({ ...d, pendingModel: null }))
    $.ui.toast(`model-dial: /model ${alias} failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

const setEffort = async ($: EngineInterface, level: Effort): Promise<void> => {
  await update($, dial, d => ({ ...d, pendingEffort: level }))
  try {
    await $.command.run({ command: 'effort', args: level })
    await update($, dial, d => ({ ...d, effort: level, pendingEffort: null }))
  } catch (err) {
    await update($, dial, d => ({ ...d, pendingEffort: null }))
    $.ui.toast(`model-dial: /effort ${level} failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** One segment of a segmented control: a filled pill when on, dim text when off. */
const Chip = (
  { Button, Text }: El,
  props: { id: string; label: string; ink: string; isOn: boolean; isPending: boolean; onPress: () => void },
) => {
  const { id, label, ink, isOn, isPending, onPress } = props
  if (isPending) {
    return (
      <Button key={id} plain onPress={onPress}>
        <Text color={ink} bold underline>
          {` ${label}… `}
        </Text>
      </Button>
    )
  }
  if (isOn) {
    return (
      <Button key={id} plain onPress={onPress}>
        <Text backgroundColor={ink} color={CHIP_TEXT} bold>
          {` ${label} `}
        </Text>
      </Button>
    )
  }
  return (
    <Button key={id} plain onPress={onPress}>
      <Text color={ink} dimColor hover={{ scope: `chip-${id}`, dimColor: false, bold: true }}>
        {` ${label} `}
      </Text>
    </Button>
  )
}

const modelChips = (el: El, $: EngineInterface, d: Dial, models: readonly string[]) => {
  const live = familyOf(d.model)
  const pending = familyOf(d.pendingModel)
  return models.map(alias => {
    const family = familyOf(alias) ?? alias
    const isOn = live === family && pending === null
    return Chip(el, {
      id: `model-${alias}`,
      label: titleCase(alias),
      ink: MODEL_INK[family] ?? '#9A9A9A',
      isOn,
      isPending: pending === family && live !== family,
      onPress: () => void setModel($, alias),
    })
  })
}

const effortChips = (el: El, $: EngineInterface, d: Dial) =>
  EFFORTS.map(level =>
    Chip(el, {
      id: `effort-${level}`,
      label: EFFORT_SHORT[level],
      ink: EFFORT_INK[level],
      isOn: d.effort === level && d.pendingEffort === null && !d.isEffortIgnored,
      isPending: d.pendingEffort === level && d.effort !== level,
      onPress: () => void setEffort($, level),
    }),
  )

/** Reads the live model and effort from the engine's own sources. */
const syncFromEngine = async ($: EngineInterface): Promise<void> => {
  const model = await $.session.model()
  const settings = await $.settings.read()
  const effort = asEffort(settings.effortLevel)
  await update($, dial, d => ({ ...d, model, effort: effort ?? d.effort }))
}

export const register: Register = (on, options) => {
  const models = parseModels(options.models)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'dial',
      description: 'Switch model and effort (for example /dial sonnet high), or open the picker',
      argumentHint: '[model] [effort]',
    })
    await syncFromEngine($)
    return next(e)
  })

  // Every /model run, typed or pressed, refreshes the live model afterwards.
  on('command.run', { command: 'model' }, async ($, e, next) => {
    const out = await next(e)
    const model = await $.session.model()
    await update($, dial, d => ({ ...d, model, pendingModel: null, isEffortIgnored: false }))
    return out
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const out = await next(e)
    const typed = parseEffort(e.args.trim().split(/\s+/)[0] ?? '')
    const settings = await $.settings.read()
    const effort = typed ?? asEffort(settings.effortLevel)
    await update($, dial, d => ({ ...d, effort: effort ?? d.effort, pendingEffort: null }))
    return out
  }).catch(($, e, next) => next(e))

  // The first request of each main turn names the model and effort it really sends;
  // a request with no effort means the model ignores it.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.index === 0) {
      const effort = asEffort(e.effort)
      const isEffortIgnored = e.effort === undefined
      await update($, dial, d => ({ ...d, model: e.model, effort: effort ?? d.effort, isEffortIgnored }))
    }
    return yield* next(e)
  })

  on('command.run', { command: 'dial' }, async ($, e) => {
    const tokens = e.args.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) {
      await $.ui.open({ id: PANE, title: 'Model & effort', focus: true, closeOnEscape: true, rows: 9 })
      return { text: 'Opened the model and effort picker.' }
    }
    const said: string[] = []
    for (const token of tokens) {
      const level = parseEffort(token)
      const alias = models.find(m => m.startsWith(token.toLowerCase()))
      if (level !== null) {
        void setEffort($, level)
        said.push(`effort ${level}`)
      } else if (alias !== undefined) {
        void setModel($, alias)
        said.push(titleCase(alias))
      } else {
        return { text: `Unknown model or effort: ${token}. Models: ${models.join(', ')}. Effort: ${EFFORTS.join(', ')}.` }
      }
    }
    return { text: `Switching to ${said.join(' · ')}.` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const el = $.ui.resolve(e)
    const { Box, Text } = el
    const d = await read($, dial)
    const modelColumns = models.reduce((n, alias) => n + alias.length + 3, 0)
    const rowColumns = modelColumns + EFFORT_COLUMNS
    const isOneRow = e.props.bodyColumns >= rowColumns
    const hasNoteRoom = !isOneRow || e.props.bodyColumns >= rowColumns + NOTE_COLUMNS
    const isQueued = e.props.isWorking && hasNoteRoom && (d.pendingModel !== null || d.pendingEffort !== null)

    return (
      <Box flexDirection={isOneRow ? 'row' : 'column'} columnGap={2}>
        <Box columnGap={1}>{modelChips(el, $, d, models)}</Box>
        {isOneRow && <Text dimColor>│</Text>}
        <Box columnGap={1}>
          {effortChips(el, $, d)}
          {d.isEffortIgnored && <Text dimColor italic>n/a</Text>}
          {isQueued && <Text dimColor italic>after turn</Text>}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const d = await read($, dial)
    const live = familyOf(d.pendingModel ?? d.model)
    const nameWidth = Math.max(...models.map(m => m.length))
    const effort = d.pendingEffort ?? d.effort
    const used = new Set<string>()
    const hotkeyFor = (alias: string): string | undefined => {
      const key = [...alias].find(c => /[a-z]/.test(c) && !used.has(c))
      if (key !== undefined) used.add(key)
      return key
    }

    return (
      <Box flexDirection="row" columnGap={4}>
        <Box flexDirection="column">
          <Text bold>Model</Text>
          {models.map(alias => {
            const family = familyOf(alias) ?? alias
            const isOn = live === family
            return (
              <Button key={`pick-model-${alias}`} plain hotkey={hotkeyFor(alias)} onPress={() => void setModel($, alias)}>
                <Text color={isOn ? MODEL_INK[family] ?? 'claude' : undefined} bold={isOn}>
                  {`${isOn ? '●' : '○'} ${titleCase(alias).padEnd(nameWidth)}`}
                </Text>
                <Text dimColor>{`  ${MODEL_BLURB[family] ?? ''}`}</Text>
              </Button>
            )
          })}
        </Box>
        <Box flexDirection="column">
          <Text bold>Effort</Text>
          {EFFORTS.map((level, i) => {
            const isOn = effort === level && !d.isEffortIgnored
            return (
              <Button key={`pick-effort-${level}`} plain hotkey={String(i + 1)} onPress={() => void setEffort($, level)}>
                <Text color={isOn ? EFFORT_INK[level] : undefined} bold={isOn}>
                  {`${isOn ? '●' : '○'} ${level.padEnd(6)}`}
                </Text>
                <Text dimColor>{` ${EFFORT_BLURB[level]}`}</Text>
              </Button>
            )
          })}
          <Text dimColor>Esc closes · changes wait for the current turn</Text>
        </Box>
      </Box>
    )
  })

  // A switch with a warm prompt cache re-sends the whole context; say what that costs.
  on('classic.PostModelSwitch', async ($, e, next) => {
    if (e.prompt_cache_warm && e.estimated_cache_write_usd >= 0.01) {
      const k = Math.round(e.context_tokens / 1000)
      $.ui.toast(`Now on ${displayName(e.to_model)} · re-caching ${k}k tokens ≈ $${e.estimated_cache_write_usd.toFixed(2)}`)
    }
    return next(e)
  }).catch(($, e, next) => next(e))
}
