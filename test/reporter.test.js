import test from 'node:test'
import assert from 'node:assert/strict'
import { createProgressReporter, DEFAULT_SYSTEM } from '../index.js'

test('resume a cada intervalo, com etapas acumuladas e sessões isoladas', async () => {
  const calls = [], messages = []
  const reporter = createProgressReporter({ callModel: async request => { calls.push(request); return { success: true, text: 'progresso' } }, publish: async message => messages.push(message) })
  reporter.start('a', { enabled: true, every: 2, model: 'm' })
  reporter.start('b', { enabled: true, every: 1, mode: 'custom', prompt: 'Personalizado' })
  reporter.observe('a', { tool: 'ler' })
  reporter.observe('b', { tool: 'buscar' })
  await reporter.iteration('a', 1)
  assert.equal(calls.length, 0)
  await reporter.iteration('a', 2)
  await reporter.iteration('a', 2)
  await reporter.iteration('b', 1)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].system, DEFAULT_SYSTEM)
  assert.equal(calls[0].model, 'm')
  assert.deepEqual(JSON.parse(calls[0].prompt), [{ tool: 'ler' }])
  assert.equal(calls[1].system, 'Personalizado')
  assert.deepEqual(messages.map(m => m.sessionId), ['a', 'b'])
})

test('falhas não publicam texto nem impedem tentativas seguintes', async () => {
  let count = 0; const errors = [], messages = []
  const reporter = createProgressReporter({ callModel: async () => ++count === 1 ? { success: false, error: 'falhou' } : { success: true, text: 'ok' }, publish: async m => messages.push(m), onError: e => errors.push(e.message) })
  reporter.start('a', { enabled: true, every: 1 })
  reporter.observe('a', 'etapa')
  await reporter.iteration('a', 1)
  await reporter.iteration('a', 2)
  assert.deepEqual(errors, ['falhou'])
  assert.equal(messages.length, 1)
  reporter.finish('a')
  await reporter.iteration('a', 3)
  assert.equal(count, 2)
})

test('valida configuração e cancela publicação depois do fim', async () => {
  let resolve; const messages = []
  const reporter = createProgressReporter({ callModel: () => new Promise(r => { resolve = r }), publish: async m => messages.push(m) })
  assert.throws(() => reporter.start('a', { enabled: true, every: 0 }))
  assert.throws(() => reporter.start('a', { enabled: true, every: 1, mode: 'custom' }))
  reporter.start('a', { enabled: true, every: 1 })
  reporter.observe('a', 'etapa')
  const pending = reporter.iteration('a', 1)
  await Promise.resolve()
  reporter.finish('a')
  resolve({ success: true, text: 'tarde' })
  await pending
  assert.equal(messages.length, 0)
})
