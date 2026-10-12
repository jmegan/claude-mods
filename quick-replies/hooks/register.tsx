import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Board, Reply } from '../types'
import { DEFAULT_REPLIES } from './defaults'
import { addProjectReplies, asksQuestion, findReply, iconOf, idOf, inkOn, lookOf, mergeReplies, parseConfig, rawEntryId } from './replies'
import type { LookContext } from './replies'
import type { UserConfig } from './replies'

const board = atom({ plugin: 'quick-replies', key: 'board' } as const, {
  replies: [],
  configPath: '',
  problems: [],
  isSmart: true,
  hasIcons: true,
} satisfies Board)
const isHidden = atom({ plugin: 'quick-replies', key: 'isHidden' } as const, false)
const isMoreOpen = atom({ plugin: 'quick-replies', key: 'isMoreOpen' } as const, false)
const isAsking = atom({ plugin: 'quick-replies', key: 'isAsking' } as const, false)
const usesAtom = atom({ plugin: 'quick-replies', key: 'uses' } as const, {} as Record<string, number>)

const FILE_NAME = 'quick-replies.json'
const USES_KEY = 'uses'

type El = Pick<ElementTable, 'Box' | 'Text' | 'Button'>

/** True for a tree that draws nothing: the engine's own innermost link answers an empty Text. */
const isBlank = (tree: unknown): boolean => {
  if (tree === null || tree === undefined) return true
  if (typeof tree === 'string') return tree.trim() === ''
  if (typeof tree !== 'object') return false
  const { type, children } = tree as { type?: string; children?: unknown[] }
  return (type === 'Text' || type === 'Box') && (children ?? []).every(isBlank)
}

/** Where the config file lives: the option if set, else the Claude config folder, else ~/.claude. */
const resolveConfigPath = async ($: EngineInterface, option: unknown): Promise<string> => {
  const home = (await $.env.get('HOME')) ?? ''
  const given = typeof option === 'string' ? option.trim() : ''
  if (given !== '') return given.startsWith('~/') ? `${home}/${given.slice(2)}` : given
  const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`
  return `${configDir}/${FILE_NAME}`
}

const readRaw = async ($: EngineInterface, path: string): Promise<string | null> => {
  try {
    return await $.fs.read(path)
  } catch {
    return null
  }
}

/**
 * Re-reads the config file and rebuilds the board. A missing file is fine; a broken one keeps the defaults.
 * With a project path, that file is layered on top; it only ever adds to what the person's own file made.
 */
const load = async ($: EngineInterface, path: string, projectPath: string | null): Promise<Board> => {
  const text = await readRaw($, path)
  let config: UserConfig | null = null
  let problems: string[] = []
  if (text !== null) {
    const parsed = parseConfig(text)
    config = parsed.config
    problems = parsed.problems
  }
  let replies = mergeReplies(DEFAULT_REPLIES, config)
  if (projectPath !== null) {
    const projectText = await readRaw($, projectPath)
    if (projectText !== null) {
      const parsed = parseConfig(projectText)
      problems = [...problems, ...parsed.problems.map(p => `project file: ${p}`)]
      if (parsed.config !== null) replies = addProjectReplies(replies, parsed.config)
    }
  }
  const next: Board = { replies, configPath: path, problems, isSmart: config?.isSmart !== false, hasIcons: config?.hasIcons !== false }
  await update($, board, () => next)
  return next
}

/** How many times each button has been used, by id, across sessions. */
const readUses = async ($: EngineInterface): Promise<Record<string, number>> => {
  const raw = await $.store.get(USES_KEY)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
}

const bumpUse = async ($: EngineInterface, id: string): Promise<void> => {
  const uses = await readUses($)
  const next = { ...uses, [id]: (uses[id] ?? 0) + 1 }
  await $.store.set(USES_KEY, next)
  await update($, usesAtom, () => next)
}

/** Sends the reply as the person's own words, or adds it to the draft for the person to finish. */
const fire = async ($: EngineInterface, reply: Reply): Promise<void> => {
  try {
    await bumpUse($, reply.id).catch(() => undefined)
    // The question this answers is handled; the next turn decides again.
    await update($, isAsking, () => false)
    if (reply.send) {
      await $.prompt.submit({ text: reply.text, asUser: true })
      return
    }
    const draft = await $.prompt.read()
    const gap = draft.text !== '' && !/\s$/.test(draft.text) ? ' ' : ''
    await $.prompt.fill({ text: `${gap}${reply.text}`, mode: 'append' })
  } catch (err) {
    $.ui.toast(`quick-replies: could not send "${reply.label}": ${err instanceof Error ? err.message : String(err)}`)
  }
}

const Chip = (
  { Button, Text }: El,
  reply: Reply,
  look: { style: Reply['style']; isDim: boolean },
  hasIcons: boolean,
  onPress: () => void,
) => {
  // A button from the project's file is marked, so it is never mistaken for one of the person's own.
  const icon = hasIcons ? iconOf(reply) : ''
  const mark = reply.source === 'project' ? '◆ ' : icon === '' ? '' : `${icon} `
  const label = ` ${mark}${reply.label} `
  if (look.style === 'solid') {
    return (
      <Button key={`qr-${reply.id}`} plain hotkey={reply.key || undefined} onPress={onPress}>
        <Text backgroundColor={reply.color} color={inkOn(reply.color)} bold dimColor={look.isDim}>
          {label}
        </Text>
      </Button>
    )
  }
  return (
    <Button key={`qr-${reply.id}`} plain hotkey={reply.key || undefined} onPress={onPress}>
      <Text color={reply.color} dimColor={look.isDim} hover={{ scope: `qr-${reply.id}`, bold: true, underline: true, dimColor: false }}>
        {label}
      </Text>
    </Button>
  )
}

/**
 * Reads the config file as a JSON object, applies `mutate`, and writes it back. A missing file starts
 * empty; one that exists but cannot be read, or is not a JSON object, is left untouched and reported.
 */
const writeConfig = async ($: EngineInterface, path: string, mutate: (raw: Record<string, unknown>) => void): Promise<void> => {
  const text = await readRaw($, path)
  let raw: Record<string, unknown> = {}
  if (text === null) {
    const exists = await $.fs.stat(path).then(() => true, () => false)
    if (exists) throw new Error(`${path} exists but could not be read, so I left it alone`)
  } else {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error(`${path} is not valid JSON, so I left it alone. Fix it first.`)
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${path} must hold a JSON object, so I left it alone. Fix it first.`)
    }
    raw = parsed as Record<string, unknown>
  }
  mutate(raw)
  await $.fs.write(path, `${JSON.stringify(raw, null, 2)}\n`)
}

const HELP = [
  '/qr                      list the buttons with their numbers',
  '/qr <number|id>          send that reply now',
  '/qr add <label> :: <text>   add a button to your config file',
  '/qr remove <id>          remove one of yours, or hide a default',
  '/qr reload               re-read the config file',
  '/qr hide | show          hide or show the band',
  '/qr suggest              mine your history for new button ideas (runs the skill)',
  '/qr path                 show the config file location',
].join('\n')

/** The resolved config path and the session's folder, held for this load of the module. */
let configPath = ''
let cwd = ''

/** Re-reads the config; the path is resolved once per load. The project file is read only when the option is on. */
const refresh = async ($: EngineInterface, options: PluginOptions): Promise<Board> => {
  if (configPath === '') configPath = await resolveConfigPath($, options.configPath)
  const projectPath = options.projectConfig === 'on' && cwd !== '' ? `${cwd}/.claude/${FILE_NAME}` : null
  return load($, configPath, projectPath)
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    await $.command.register({
      name: 'qr',
      description: 'Quick replies: list, send, add or edit the buttons above the prompt',
      argumentHint: '[number|id | add | remove | reload | hide | show | suggest | path]',
    })
    const loaded = await refresh($, options)
    await update($, usesAtom, () => ({}))
    await readUses($).then(uses => update($, usesAtom, () => uses)).catch(() => undefined)
    const stored = await $.store.get('isHidden')
    await update($, isHidden, () => stored === true)
    if (loaded.problems.length > 0) $.ui.toast(`quick-replies: ${loaded.problems[0]} in ${loaded.configPath}`)
    return next(e)
  })

  // Pick up edits made to the config file between turns, with no reload command.
  on('turn.complete', async ($, e, next) => {
    await refresh($, options).catch(() => undefined)
    // Buttons marked `when: "asking"` show only while Claude's last message asks a question.
    const messages = await $.session.messages().catch(() => [])
    const last = messages.at(-1)
    await update($, isAsking, () => last !== undefined && last.role === 'assistant' && asksQuestion(last.text))
    return next(e)
  }).catch(($, e, next) => next(e))

  // A prompt the person types answers the question, so those buttons go away until the next turn decides.
  on('prompt.submit', async ($, e, next) => {
    await update($, isAsking, () => false)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'qr' }, async ($, e) => {
    const args = e.args.trim()
    const [verb = '', ...rest] = args.split(/\s+/)
    const current = await read($, board)

    if (args === '') {
      const uses = await readUses($)
      const lines = current.replies.map((r, i) => {
        const where = r.more ? ' (more)' : ''
        const how = r.send ? '' : ' [inserts]'
        const ask = r.when === 'asking' ? ' [when asked]' : ''
        const from = r.source === 'project' ? ' [project]' : ''
        const used = uses[r.id] ? `  ·  used ${uses[r.id]}×` : ''
        return `${String(i + 1).padStart(2)}. ${r.label}${where}${how}${ask}${from}  ·  key ${r.key || '-'}  ·  ${r.id}  ·  ${r.color}${used}`
      })
      const problems = current.problems.map(p => `⚠ ${p}`)
      return { text: [`Quick replies (${current.configPath}):`, ...lines, ...problems, '', HELP].join('\n') }
    }

    if (verb === 'reload') {
      const loaded = await refresh($, options)
      return { text: `Reloaded ${loaded.replies.length} buttons from ${loaded.configPath}.${loaded.problems.length ? ` Problem: ${loaded.problems[0]}` : ''}` }
    }
    if (verb === 'path') return { text: current.configPath }
    if (verb === 'hide' || verb === 'show') {
      await update($, isHidden, () => verb === 'hide')
      await $.store.set('isHidden', verb === 'hide')
      return { text: verb === 'hide' ? 'Quick replies hidden. /qr show brings them back.' : 'Quick replies shown.' }
    }
    if (verb === 'suggest') {
      // A command.run hook holds the turn, so a submit from here waits on itself; send it just after.
      $.clock.after(0, () => {
        void $.prompt
          .submit({
            text: 'Run the suggest-quick-replies skill: mine my local prompt history and propose new quick-reply buttons for my config.',
            asUser: true,
          })
          .catch(() => undefined)
      })
      return { text: 'Asked Claude to run the suggest-quick-replies skill.' }
    }
    if (verb === 'add') {
      const body = args.slice(3).trim()
      const split = body.indexOf('::')
      const label = split === -1 ? '' : body.slice(0, split).trim()
      const text = split === -1 ? '' : body.slice(split + 2).trim()
      if (label === '' || text === '') return { text: 'Usage: /qr add <label> :: <text to send>' }
      const id = idOf(label, null)
      try {
        await writeConfig($, current.configPath, raw => {
          const list = Array.isArray(raw.replies) ? raw.replies : []
          raw.replies = [...list.filter(r => rawEntryId(r) !== id), { id, label, text }]
        })
      } catch (err) {
        return { text: err instanceof Error ? err.message : String(err) }
      }
      const loaded = await refresh($, options)
      return { text: `Added "${label}" (${loaded.replies.length} buttons). Edit ${loaded.configPath} to change its color or hotkey.` }
    }
    if (verb === 'remove') {
      const target = findReply(current.replies, rest.join(' '))
      if (target === null) return { text: `No button matches "${rest.join(' ')}". /qr lists them.` }
      if (target.source === 'project') return { text: `"${target.label}" comes from this project's .claude/${FILE_NAME}. Edit that file to remove it.` }
      try {
        await writeConfig($, current.configPath, raw => {
          const list = Array.isArray(raw.replies) ? raw.replies : []
          raw.replies = list.filter(r => rawEntryId(r) !== target.id)
          if (target.source === 'default') {
            const hide = Array.isArray(raw.hide) ? raw.hide : []
            raw.hide = [...new Set([...hide, target.id])]
          }
        })
      } catch (err) {
        return { text: err instanceof Error ? err.message : String(err) }
      }
      await refresh($, options)
      return { text: `Removed "${target.label}".` }
    }

    const target = findReply(current.replies, args)
    if (target === null) return { text: `No button matches "${args}".\n\n${HELP}` }
    // Same reason as /qr suggest: send once the command has returned.
    $.clock.after(0, () => void fire($, target))
    return { text: `Sent "${target.label}".` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    if (await read($, isHidden)) return next(e)
    const current = await read($, board)
    if (current.replies.length === 0) return next(e)

    const el = $.ui.resolve(e)
    const { Box, Text, Button } = el
    const isOpen = await read($, isMoreOpen)
    const asking = await read($, isAsking)
    const uses = await read($, usesAtom)
    const context: LookContext = { isSmart: current.isSmart, isAsking: asking, isWorking: e.props.isWorking, uses }
    const visible = current.replies.filter(r => r.when === 'always' || asking)
    const primary = visible.filter(r => !r.more)
    const extra = visible.filter(r => r.more)
    const shown = isOpen ? [...primary, ...extra] : primary

    // Other mods' bands render beneath this hook; dropping next() would hide them, and a mod
    // above us that does the same would hide this one. Draw the chain, then stack on it.
    const beneath = await next(e)
    const mine = (
      <Box key="quick-replies" flexDirection="row" flexWrap="wrap" columnGap={1}>
        {shown.map(r => Chip(el, r, lookOf(r, context), current.hasIcons, () => void fire($, r)))}
        {extra.length > 0 && (
          <Button key="qr-toggle-more" plain onPress={() => update($, isMoreOpen, open => !open)}>
            <Text dimColor>{isOpen ? ' ‹ less ' : ` more ${extra.length} › `}</Text>
          </Button>
        )}
        {e.props.isWorking && <Text dimColor italic>sends after this turn</Text>}
      </Box>
    )
    return isBlank(beneath) ? mine : <Box flexDirection="column">{beneath}{mine}</Box>
  })
}
