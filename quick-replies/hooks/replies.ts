import type { Reply } from '../types'
import type { DefaultReply } from './defaults'

/**
 * Color roles. Each names what a button means and maps to a theme key, so the buttons follow the
 * person's theme (light, dark, color-blind) instead of fixed hex values. A theme key or a raw
 * color passes through unchanged.
 */
export const COLOR_ROLES: Readonly<Record<string, string>> = {
  go: 'success',
  ask: 'permission',
  info: 'suggestion',
  caution: 'warning',
  stop: 'error',
  git: 'merged',
  plan: 'planMode',
  agent: 'claude',
  neutral: 'subtle',
}

/**
 * What a button means, read from its words, so a button the person adds without a color still gets a
 * fitting one. The first rule that matches the label wins; if none does, the first 80 characters of the
 * text are tried the same way. Roles are the ones in COLOR_ROLES.
 */
const ROLE_RULES: readonly (readonly [role: string, pattern: RegExp])[] = [
  ['go', /^(yes|continue|go|ok|okay|proceed|approve|do it|ship)\b/],
  ['stop', /^(no|stop|cancel|abort|revert|undo|don't|dont)\b/],
  ['git', /\b(commit|push|merge|pull request|pr|branch|rebase|git)\b/],
  ['plan', /\b(plan|design|outline)\b/],
  ['agent', /\b(agents?|subagents?|delegate|parallel|your call|best judg(e)?ment)\b/],
  ['caution', /\b(verify|test|tests|check|review|lint|audit|simplify|fix|typecheck)\b/],
  ['ask', /\b(ask|question|clarify|decide)\b/],
  ['info', /\b(status|next|summari[sz]e|explain|docs|look up|research|try again|retry|why)\b/],
]

export const inferRole = (label: string, text: string): string => {
  for (const source of [label.toLowerCase(), text.toLowerCase().slice(0, 80)]) {
    for (const [role, pattern] of ROLE_RULES) if (pattern.test(source)) return role
  }
  return 'neutral'
}

/**
 * The glyph each color role draws before its label, so a button's kind shows without relying on color
 * alone. Every glyph is a single cell wide and has no emoji presentation, so rows keep their alignment.
 */
export const ROLE_ICONS: Readonly<Record<string, string>> = {
  success: '✓',
  permission: '?',
  suggestion: 'ⓘ',
  warning: '!',
  error: '■',
  merged: '±',
  planMode: '☰',
  claude: '✦',
  subtle: '·',
}

/** A reply's glyph: its own `icon`, else the one for its color role, else none (a raw color has no role). */
export const iconOf = (reply: Pick<Reply, 'icon' | 'color'>): string => reply.icon || (ROLE_ICONS[reply.color] ?? '')

/** Keeps a glyph to two characters with no control characters; anything else is no glyph. */
const cleanIcon = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : ''
  const glyph = [...text].slice(0, 2).join('')
  return glyph === '' ? undefined : glyph
}

/** The color of a reply that names none, when smart colors are off. */
export const FALLBACK_COLOR = COLOR_ROLES.neutral ?? 'subtle'

/** Turns a role into its theme key; anything else (a theme key, a name, hex) is kept as written. */
export const resolveColor = (color: string): string => COLOR_ROLES[color.toLowerCase()] ?? color

/**
 * The text color that stays readable on a solid chip of this color. A theme key gets the theme's own
 * `inverseText`; a hex color gets near-black or white by its luminance.
 */
export const inkOn = (background: string): string => {
  const hex = background.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (hex === undefined) return 'inverseText'
  const full = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16))
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.55 ? '#111111' : '#FFFFFF'
}

/** A reply as the config file spells it: a default's fields plus an optional hotkey. */
export type UserReply = DefaultReply & { key?: string }

/** What a merge starts from: the built-in defaults, or the replies a lower layer already made. */
export type Seed = UserReply & { source?: Reply['source'] }

/**
 * True when a message ends by asking the person something: its last line ends in a question mark,
 * ignoring closing quotes, brackets, emphasis marks and a trailing code fence.
 */
export const asksQuestion = (text: string): boolean => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '' && !/^```/.test(l))
  const last = lines.at(-1) ?? ''
  return /\?[\s)\]"'\u201d\u2019*_`]*$/.test(last)
}

/** What the config file may hold. Every field is optional; unknown fields are ignored. */
export type UserConfig = {
  mode: 'merge' | 'replace'
  order: 'yours-first' | 'defaults-first'
  /** `false` turns off inferred colors and state-based emphasis. Default true. */
  isSmart: boolean
  /** `false` hides the glyph before each label. Default true. */
  hasIcons: boolean
  /** `off` assigns no automatic hotkeys; a reply's own `key` still counts. */
  hotkeys: 'auto' | 'off'
  hide: string[]
  /** Field overrides for a default, by id: `{ "stop": { "more": true } }`. */
  patch: Record<string, Partial<UserReply>>
  replies: UserReply[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

export const slug = (label: string): string =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const hash = (text: string): string => {
  let h = 5381
  for (const ch of text) h = ((h << 5) + h + ch.codePointAt(0)!) >>> 0
  return h.toString(36).slice(0, 6)
}

/**
 * The id of a reply: its own `id` if set, else a slug of its label, else a short hash of the label
 * (a label with no ASCII letters, like “继续”, slugs to nothing). Control characters go and the length is
 * capped, because ids become element keys and hover scopes, which the engine bounds.
 */
export const idOf = (label: string, explicit: string | null): string => {
  const clean = (explicit ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40)
  return clean || slug(label).slice(0, 40) || `reply-${hash(label)}`
}

/** The id a raw config entry resolves to, derived exactly as the parser does; null for a non-entry. */
export const rawEntryId = (raw: unknown): string | null => {
  if (!isRecord(raw)) return null
  const label = str(raw.label)
  const explicit = str(raw.id)
  return label === null && explicit === null ? null : idOf(label ?? '', explicit)
}

/** Reads one entry of `replies`; a bad entry is reported and skipped, never fatal. */
const readEntry = (raw: unknown, index: number, problems: string[]): UserReply | null => {
  if (!isRecord(raw)) {
    problems.push(`replies[${index}] is not an object`)
    return null
  }
  const label = str(raw.label)
  const text = str(raw.text)
  if (label === null || text === null) {
    problems.push(`replies[${index}] needs a "label" and a "text"`)
    return null
  }
  const key = str(raw.key)
  return {
    id: idOf(label, str(raw.id)),
    label,
    text,
    send: raw.send === false ? false : undefined,
    more: raw.more === true ? true : undefined,
    style: raw.style === 'solid' || raw.style === 'outline' ? raw.style : undefined,
    color: str(raw.color) ?? undefined,
    icon: cleanIcon(raw.icon),
    when: raw.when === 'asking' ? 'asking' : undefined,
    key: key !== null && /^[a-z0-9]$/.test(key) ? key : undefined,
  }
}

/** Parses the config file's text. Invalid JSON gives no config and one problem, so the defaults still show. */
export const parseConfig = (text: string): { config: UserConfig | null; problems: string[] } => {
  const problems: string[] = []
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return { config: null, problems: [`not valid JSON: ${err instanceof Error ? err.message : String(err)}`] }
  }
  if (!isRecord(raw)) return { config: null, problems: ['the file must hold a JSON object'] }

  const entries = Array.isArray(raw.replies) ? raw.replies : []
  const replies = entries
    .map((entry, i) => readEntry(entry, i, problems))
    .filter((entry): entry is UserReply => entry !== null)
  const hide = Array.isArray(raw.hide) ? raw.hide.filter((id): id is string => typeof id === 'string') : []
  const patch: Record<string, Partial<UserReply>> = {}
  if (isRecord(raw.patch)) {
    for (const [id, fields] of Object.entries(raw.patch)) {
      if (!isRecord(fields)) {
        problems.push(`patch.${id} is not an object`)
        continue
      }
      const key = str(fields.key)
      patch[id] = {
        label: str(fields.label) ?? undefined,
        text: str(fields.text) ?? undefined,
        send: typeof fields.send === 'boolean' ? fields.send : undefined,
        more: typeof fields.more === 'boolean' ? fields.more : undefined,
        style: fields.style === 'solid' || fields.style === 'outline' ? fields.style : undefined,
        color: str(fields.color) ?? undefined,
        icon: cleanIcon(fields.icon),
        when: fields.when === 'asking' || fields.when === 'always' ? fields.when : undefined,
        key: key !== null && /^[a-z0-9]$/.test(key) ? key : undefined,
      }
    }
  }

  return {
    config: {
      mode: raw.mode === 'replace' ? 'replace' : 'merge',
      order: raw.order === 'defaults-first' ? 'defaults-first' : 'yours-first',
      hotkeys: raw.hotkeys === 'off' ? 'off' : 'auto',
      isSmart: raw.smartColors !== false,
      hasIcons: raw.icons !== 'off',
      hide,
      patch,
      replies,
    },
    problems,
  }
}

const toReply = (entry: Seed, fallback: Reply['source'], isSmart = true): Reply => ({
  id: entry.id,
  label: entry.label,
  text: entry.text,
  send: entry.send !== false,
  more: entry.more === true,
  style: entry.style ?? 'outline',
  color: resolveColor(entry.color ?? (isSmart ? inferRole(entry.label, entry.text) : FALLBACK_COLOR)),
  icon: entry.icon ?? '',
  when: entry.when === 'asking' ? 'asking' : 'always',
  key: entry.key ?? '',
  source: entry.source ?? fallback,
})

/** Lays a patch's defined fields over a reply; an undefined field leaves the original. */
const withDefined = (reply: Seed, patch: Partial<UserReply> | undefined): Seed => {
  if (patch === undefined) return reply
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  return { ...reply, ...defined }
}

/**
 * Merges the defaults with the user's config.
 *
 * A user reply with a default's id replaces that default; `hide` removes ids; `mode: "replace"`
 * drops the defaults altogether. Ids stay unique, and the first of a duplicate wins.
 */
export const mergeReplies = (defaults: readonly Seed[], config: UserConfig | null): Reply[] => {
  if (config === null) return assignKeys(defaults.map(d => toReply(d, 'default')))
  const base = defaults.map(d => toReply(withDefined(d, config.patch[d.id]), 'default', config.isSmart))

  const mine = config.replies.map(r => toReply(r, 'user', config.isSmart))
  const hidden = new Set(config.hide)
  const keep = (r: Reply): boolean => !hidden.has(r.id)

  let merged: Reply[]
  if (config.mode === 'replace') {
    merged = mine
  } else if (config.order === 'defaults-first') {
    const override = new Map(mine.map(r => [r.id, r]))
    const known = new Set(base.map(r => r.id))
    merged = [...base.map(r => override.get(r.id) ?? r), ...mine.filter(r => !known.has(r.id))]
  } else {
    const taken = new Set(mine.map(r => r.id))
    merged = [...mine, ...base.filter(r => !taken.has(r.id))]
  }

  const seen = new Set<string>()
  const unique = merged.filter(keep).filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)))
  return assignKeys(unique, config.hotkeys === 'auto')
}

/** Gives each reply a unique one-character hotkey: explicit ones first, then digits, then label letters. */
export const assignKeys = (replies: Reply[], isAuto = true): Reply[] => {
  const used = new Set<string>()
  const explicit = replies.map(r => {
    if (r.key !== '' && !used.has(r.key)) {
      used.add(r.key)
      return r.key
    }
    return ''
  })
  const digits = '123456789'.split('')
  return replies.map((r, i) => {
    const chosen = explicit[i] ?? ''
    if (chosen !== '') return { ...r, key: chosen }
    if (!isAuto) return { ...r, key: '' }
    const pool = [...digits, ...[...r.label.toLowerCase()].filter(c => /[a-z]/.test(c))]
    const pick = pool.find(c => !used.has(c)) ?? ''
    if (pick !== '') used.add(pick)
    return { ...r, key: pick }
  })
}

/** Finds a reply by 1-based number, id, or label (case-insensitive). */
export const findReply = (replies: readonly Reply[], token: string): Reply | null => {
  const t = token.trim().toLowerCase()
  if (t === '') return null
  if (/^\d+$/.test(t)) return replies[Number(t) - 1] ?? null
  return replies.find(r => r.id === t || r.label.toLowerCase() === t) ?? null
}

/** A project label with control characters and the project marker removed, cut to 24 characters. */
const cleanProjectLabel = (label: string): string =>
  label.replace(/[\u0000-\u001f\u007f\u25c6]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24)

/**
 * Adds a project file's buttons to the person's own, and nothing more. The file is not trusted the way
 * the person's own config is, so its buttons are visually inert:
 *
 * - it can never replace, patch, hide or reorder an existing button, and one reusing an existing id or
 *   label is dropped, so it cannot pose as one of the person's own;
 * - it cannot choose a color, style, icon or hotkey: its buttons draw in the neutral outline style with
 *   no glyph, behind the project marker the band adds.
 */
export const addProjectReplies = (base: readonly Reply[], config: UserConfig): Reply[] => {
  const ids = new Set(base.map(r => r.id))
  const labels = new Set(base.map(r => r.label.toLowerCase()))
  const added: Reply[] = []
  for (const entry of config.replies) {
    const label = cleanProjectLabel(entry.label)
    if (label === '' || ids.has(entry.id) || labels.has(label.toLowerCase())) continue
    ids.add(entry.id)
    labels.add(label.toLowerCase())
    const plain = toReply({ id: entry.id, label, text: entry.text, send: entry.send, more: entry.more, when: entry.when }, 'project', false)
    added.push({ ...plain, source: 'project', style: 'outline', color: FALLBACK_COLOR, icon: '', key: '' })
  }
  return assignKeys([...base, ...added])
}
/** Uses in all before a never-used button counts as stale: too few and "never used" means nothing yet. */
const STALE_AFTER_USES = 30

export type LookContext = {
  isSmart: boolean
  /** Claude's last message asks a question. */
  isAsking: boolean
  /** A turn is running, so a press queues the reply. */
  isWorking: boolean
  uses: Readonly<Record<string, number>>
}

/**
 * How one button draws right now. Only the style and the dimming change, never the label or its
 * padding, so no button moves under the pointer.
 *
 * - While Claude asks, the yes and no family (and any \`when: "asking"\` button) turns solid.
 * - While a turn runs, every button dims: a press queues the reply for after the turn.
 * - Once there is enough history, a button that was never pressed dims.
 */
export const lookOf = (reply: Reply, context: LookContext): { style: Reply['style']; isDim: boolean } => {
  if (!context.isSmart) return { style: reply.style, isDim: false }
  const isPrompted = context.isAsking && (reply.when === 'asking' || reply.color === 'success' || reply.color === 'error')
  const total = Object.values(context.uses).reduce((sum, n) => sum + n, 0)
  const isStale = !isPrompted && reply.when === 'always' && reply.source !== 'project' && total >= STALE_AFTER_USES && (context.uses[reply.id] ?? 0) === 0
  return { style: isPrompted ? 'solid' : reply.style, isDim: context.isWorking || isStale }
}
