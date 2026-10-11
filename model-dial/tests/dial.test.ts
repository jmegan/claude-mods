import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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
const fakeEngine = (on: On) => {
  const ran: string[] = []
  let model = 'claude-opus-5-5'
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: model }))
  on('settings.read', () => ({ value: { effortLevel: 'high' } }))
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

    expect((await ui.find({ key: 'model-opus' }))?.text).toContain('Opus 5.5')
    expect((await ui.find({ key: 'effort-high' }))?.text).toContain('high')

    await ui.press({ key: 'model-sonnet' })
    await ui.press({ key: 'effort-xhigh' })

    expect((await ui.find({ key: 'model-sonnet' }))?.text).toContain('Sonnet 5.5')
    expect((await ui.find({ key: 'effort-xhigh' }))?.props).toMatchObject({ plain: true })

    await ui.press({ key: 'model-opus' })
    await ui.press({ key: 'effort-high' })
    expect((await ui.find({ key: 'model-opus' }))?.text).toContain('Opus 5.5')
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
    const chip = await ui.find({ key: 'model-haiku' })
    if (chip?.text.includes('Haiku 5.5') && ran.length === 2) break
  }
  expect((await ui.find({ key: 'model-haiku' }))?.text).toContain('Haiku 5.5')
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
