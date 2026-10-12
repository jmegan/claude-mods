#!/usr/bin/env node
// Mines the local Claude Code prompt history for short, repeated messages that
// make good quick-reply buttons. Reads only files on this machine and prints a
// summary to stdout; nothing is sent anywhere.
//
// Usage: node mine-history.mjs [--dir <config dir>]... [--min-count 3]
//                              [--max-len 200] [--since-days 0] [--top 60]
//                              [--format json|text]

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const flagAll = name => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []))

const minCount = Number(flag('min-count', 3))
const maxLen = Number(flag('max-len', 200))
const sinceDays = Number(flag('since-days', 0))
const top = Number(flag('top', 60))
const format = flag('format', 'json')

const home = homedir()
const candidates = [...flagAll('dir'), process.env.CLAUDE_CONFIG_DIR, join(home, '.claude'), join(home, '.claude-personal')]
const dirs = [...new Set(candidates.filter(Boolean))].filter(d => existsSync(join(d, 'history.jsonl')))

if (dirs.length === 0) {
  console.error('No history.jsonl found. Pass --dir <config dir>.')
  process.exit(1)
}

// A token-shaped run of characters is never a quick reply, and must never be printed.
const LOOKS_SECRET = /(sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9]{20,}|eyJ[a-z0-9_-]{10,}|[a-z0-9+/_-]{32,}|AKIA[0-9A-Z]{12,})/i
const isPasteStub = text => /^\[(pasted|image|\.{3})/i.test(text)

const seen = new Set()
const rows = []
const cutoff = sinceDays > 0 ? Date.now() - sinceDays * 86_400_000 : 0
let total = 0

for (const dir of dirs) {
  for (const line of readFileSync(join(dir, 'history.jsonl'), 'utf8').split('\n')) {
    if (!line.trim()) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof entry !== 'object' || entry === null) continue
    const text = typeof entry.display === 'string' ? entry.display.replace(/\s+/g, ' ').trim() : ''
    if (!text) continue
    const raw = Number(entry.timestamp)
    // A timestamp outside the Date range would throw when the last-used date is formatted.
    const stamp = Number.isFinite(raw) && Math.abs(raw) <= 8.64e15 ? raw : 0
    if (stamp < cutoff) continue
    const dedupe = `${stamp}|${text}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    total += 1
    rows.push({ text, stamp, session: entry.sessionId ?? '', project: entry.project ?? '' })
  }
}

const keyOf = text => text.toLowerCase().replace(/[\s.!?,;:]+$/g, '').replace(/\s+/g, ' ')

const slash = new Map()
const exact = new Map()
const prefixes = new Map()

const bump = (map, key, row, text) => {
  const slot = map.get(key) ?? { count: 0, sessions: new Set(), projects: new Set(), last: 0, forms: new Map() }
  slot.count += 1
  slot.sessions.add(row.session)
  slot.projects.add(row.project)
  slot.last = Math.max(slot.last, row.stamp)
  slot.forms.set(text, (slot.forms.get(text) ?? 0) + 1)
  map.set(key, slot)
}

for (const row of rows) {
  // A slash command is one word after the slash; a pasted path like /Users/me/file is not one.
  if (/^\/[\w:.-]+(\s|$)/.test(row.text)) {
    bump(slash, row.text.split(' ')[0].toLowerCase(), row, row.text.split(' ')[0])
    continue
  }
  if (row.text.length > maxLen || isPasteStub(row.text) || LOOKS_SECRET.test(row.text)) continue
  bump(exact, keyOf(row.text), row, row.text)
  const words = keyOf(row.text).split(' ')
  if (words.length >= 4) bump(prefixes, words.slice(0, 3).join(' '), row, row.text)
}

const best = forms => [...forms.entries()].sort((a, b) => b[1] - a[1])[0][0]
const shape = (key, slot, extra = {}) => ({
  text: best(slot.forms),
  count: slot.count,
  sessions: slot.sessions.size,
  projects: slot.projects.size,
  lastUsed: slot.last > 0 ? new Date(slot.last).toISOString().slice(0, 10) : null,
  ...extra,
})

const byCount = (a, b) => b.count - a.count || b.sessions - a.sessions

const exactList = [...exact.entries()]
  .filter(([, s]) => s.count >= minCount)
  .map(([k, s]) => shape(k, s))
  .sort(byCount)
  .slice(0, top)

// A prefix cluster is a family of different messages that open the same way
// ("use the question tool to ask me ..."). Exact matches already surfaced above
// are left out so the two lists do not repeat each other.
const exactKeys = new Set(exactList.map(r => keyOf(r.text)))
const clusterList = [...prefixes.entries()]
  .filter(([, s]) => s.count >= minCount && s.forms.size >= 2)
  .map(([k, s]) =>
    shape(k, s, {
      prefix: k,
      examples: [...s.forms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t),
    }),
  )
  .filter(r => !exactKeys.has(keyOf(r.text)))
  .sort(byCount)
  .slice(0, Math.floor(top / 2))

const slashList = [...slash.entries()]
  .map(([k, s]) => ({ command: k, count: s.count, sessions: s.sessions.size }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 15)

const result = {
  sources: dirs,
  promptsRead: total,
  sinceDays: sinceDays || null,
  minCount,
  maxLen,
  exact: exactList,
  clusters: clusterList,
  slashCommands: slashList,
}

if (format === 'text') {
  const out = [`${total} prompts from ${dirs.join(', ')}`, '', 'EXACT REPEATS']
  for (const r of exactList) out.push(`${String(r.count).padStart(4)}x  ${r.sessions} sess  ${JSON.stringify(r.text)}`)
  out.push('', 'FAMILIES (same opening words)')
  for (const r of clusterList) out.push(`${String(r.count).padStart(4)}x  "${r.prefix} ..."  e.g. ${JSON.stringify(r.examples[0])}`)
  out.push('', 'SLASH COMMANDS')
  for (const r of slashList) out.push(`${String(r.count).padStart(4)}x  ${r.command}`)
  console.log(out.join('\n'))
} else {
  console.log(JSON.stringify(result, null, 2))
}
