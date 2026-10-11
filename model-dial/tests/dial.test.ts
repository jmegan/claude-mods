import { expect, test } from 'claude-code/testing'
import type { FoundElement } from 'claude-code/testing'
import type { On } from 'claude-code'

/** An active chip is the one drawn as a filled pill. */
const isFilled = (chip: FoundElement | undefined): boolean => JSON.stringify(chip?.children ?? []).includes('backgroundColor')

const band = (bodyColumns: number) => ({
  plugin: 'model-dial',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns, scroll: { offset: 0, bodyRows: 6 }, view: {} },
})

const START = { cwd: '/tmp', surface: 'terminal' as const, isInteractive: true }

const dial = (args: string) => ({
  command: 'dial',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 120 },
})

/** Stands in for Claude Code's own /model and /effort, recording what ran. */
const fakeEngine = (on: On, beneath = '') => {
  const ran: string[] = []
  let model = 'claude-opus-5-5'
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: model }))
  on('settings.read', () => ({ value: { effortLevel: 'high' } }))
  // What renders under the band: empty, or another mod's band.
  on('ui.render', () => ({ type: 'Text', children: [beneath] }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('command.run', { command: 'model' }, ($, e) => {
    ran.push(`/model ${e.args}`)
    model = `claude-${e.args}-5-5`
    return { text: `Set model to ${e.args}` }
  })
  on('command.run', { command: 'effort' }, ($, e) => {
    ran.push(`/effort ${e.args}`)
    return { text: `Set effort to ${e.args}` }
  })
  return ran
}

test('the band shows the live model and effort, and a press switches them', async ($, on) => {
  const ran = fakeEngine(on)
  await $.session.start(START)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...band(120), surface })

    expect(isFilled(await ui.find({ key: 'model-opus' }))).toBe(true)
    expect(isFilled(await ui.find({ key: 'effort-high' }))).toBe(true)
    expect(isFilled(await ui.find({ key: 'model-sonnet' }))).toBe(false)

    await ui.press({ key: 'model-sonnet' })
    await ui.press({ key: 'effort-xhigh' })

    // Labels keep their width on a switch, so the chips never move under the pointer.
    expect((await ui.find({ key: 'model-sonnet' }))?.text).toBe(' Sonnet ')
    expect(isFilled(await ui.find({ key: 'model-sonnet' }))).toBe(true)
    expect(isFilled(await ui.find({ key: 'effort-xhigh' }))).toBe(true)

    await ui.press({ key: 'model-opus' })
    await ui.press({ key: 'effort-high' })
    expect(isFilled(await ui.find({ key: 'model-opus' }))).toBe(true)
    await ui.unmount()
  }
  const pass = ['/model sonnet', '/effort xhigh', '/model opus', '/effort high']
  expect(ran).toEqual([...pass, ...pass])
})

test('/dial takes a model and an effort in one line', async ($, on) => {
  const ran = fakeEngine(on)
  await $.session.start(START)
  const out = await $.command.run(dial('hai x'))
  expect(out.text).toBe('Switching to Haiku · effort xhigh.')
  const ui = await $.ui.mount({ ...band(120), surface: 'terminal' })
  for (let i = 0; i < 500; i++) {
    if (isFilled(await ui.find({ key: 'model-haiku' })) && ran.length === 2) break
  }
  expect(isFilled(await ui.find({ key: 'model-haiku' }))).toBe(true)
  expect([...ran].sort()).toEqual(['/effort xhigh', '/model haiku'])
  await ui.unmount()
})

test('/dial refuses a word it does not know', async ($, on) => {
  fakeEngine(on)
  await $.session.start(START)
  const out = await $.command.run(dial('gpt'))
  expect(out.text).toContain('Unknown model or effort: gpt')
})

test('the models option sets the chips', { options: { models: 'sonnet,haiku' } }, async ($, on) => {
  fakeEngine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(60), surface: 'terminal' })
  expect(await ui.find({ key: 'model-opus' })).toBeUndefined()
  expect(await ui.find({ key: 'model-haiku' })).toBeDefined()
  await ui.unmount()
})

test('effort shows n/a while the live model sends no effort', async ($, on) => {
  fakeEngine(on)
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(120), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'n/a' })).toBeUndefined()

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-haiku-5-5', messageCount: 1 })
  for await (const _ of step) void _
  expect(await ui.find({ type: 'Text', text: 'n/a' })).toBeDefined()
  expect(isFilled(await ui.find({ key: 'effort-high' }))).toBe(false)

  await ui.press({ key: 'model-opus' })
  expect(await ui.find({ type: 'Text', text: 'n/a' })).toBeUndefined()
  await ui.unmount()
})

test('the row stacks on two rows when narrow', async ($, on) => {
  fakeEngine(on)
  await $.session.start(START)
  const wide = await $.ui.mount({ ...band(68), surface: 'terminal' })
  expect(await wide.find({ type: 'Text', text: '│' })).toBeDefined()
  await wide.unmount()
  const narrow = await $.ui.mount({ ...band(67), surface: 'terminal' })
  expect(await narrow.find({ type: 'Text', text: '│' })).toBeUndefined()
  await narrow.unmount()
})

test('the band stacks over other mods\' bands instead of hiding them', async ($, on) => {
  fakeEngine(on, 'mission control band')
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(120), surface: 'terminal' })
  expect(await ui.find({ key: 'model-opus' })).toBeDefined()
  expect(await ui.find({ text: 'mission control band' })).toBeDefined()
  await ui.unmount()
})
