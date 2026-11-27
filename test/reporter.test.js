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

function fakeTimers() {
  let current = null
  return {
    setTimer(fn, ms) { current = { fn, ms }; return current },
    clearTimer(timer) { if (current === timer) current = null },
    get current() { return current },
    async fire() { const timer = current; current = null; timer.fn(); await new Promise(resolve => setImmediate(resolve)) },
  }
}

test('o relógio publica durante uma iteração longa e para no fim', async () => {
  const timers = fakeTimers(), messages = []
  const reporter = createProgressReporter({ ...timers, callModel: async () => ({ success: true, text: 'Em andamento' }), publish: message => messages.push(message) })
  reporter.start('a', { enabled: true, every: 10 })
  reporter.observe('a', { request: 'Trabalho longo' })
  await reporter.iteration('a', 1)
  assert.equal(timers.current.ms, 30_000)
  await timers.fire()
  assert.equal(messages.length, 1)
  assert.ok(timers.current)
  reporter.finish('a')
  assert.equal(timers.current, null)
})

test('modelo lento não acumula chamadas e o cancelamento impede entrega tardia', async () => {
  const timers = fakeTimers(), messages = [], controller = new AbortController()
  let resolve, signal, calls = 0
  const reporter = createProgressReporter({ ...timers, callModel: request => { calls++; signal = request.signal; return new Promise(r => { resolve = r }) }, publish: message => messages.push(message) })
  reporter.start('a', { enabled: true, every: 1, signal: controller.signal })
  reporter.observe('a', 'etapa')
  const first = reporter.iteration('a', 1)
  await Promise.resolve()
  const second = reporter.iteration('a', 2)
  assert.equal(first, second)
  assert.equal(calls, 1)
  controller.abort()
  assert.equal(signal.aborted, true)
  resolve({ success: true, text: 'atrasado' })
  await first
  assert.equal(messages.length, 0)
  assert.equal(timers.current, null)
})

test('reinício invalida a geração anterior e limita o histórico preservando o objetivo', async () => {
  const timers = fakeTimers(), messages = [], calls = []
  let resolve
  const reporter = createProgressReporter({ ...timers, callModel: request => { calls.push(request); return calls.length === 1 ? new Promise(r => { resolve = r }) : { success: true, text: 'novo' } }, publish: message => messages.push(message) })
  reporter.start('a', { enabled: true, every: 1 })
  reporter.observe('a', 'anterior')
  const pending = reporter.iteration('a', 1)
  await Promise.resolve()
  reporter.start('a', { enabled: true, every: 1 })
  resolve({ success: true, text: 'antigo' })
  await pending
  reporter.observe('a', { request: 'objetivo' })
  for (let i = 0; i < 300; i++) reporter.observe('a', { i })
  await reporter.iteration('a', 1)
  assert.deepEqual(messages.map(message => message.text), ['novo'])
  const steps = JSON.parse(calls[1].prompt)
  assert.equal(steps.length, 200)
  assert.deepEqual(steps[0], { request: 'objetivo' })
  assert.deepEqual(steps.at(-1), { i: 299 })
  reporter.finish('a')
})

test('falha no relógio permite nova tentativa e desativado não agenda chamadas', async () => {
  const timers = fakeTimers(), errors = [], messages = []
  let calls = 0
  const reporter = createProgressReporter({ ...timers, callModel: async () => ++calls === 1 ? { success: false, error: 'indisponível' } : { success: true, text: 'recuperado' }, publish: message => messages.push(message), onError: error => errors.push(error.message) })
  reporter.start('off', { enabled: false })
  reporter.observe('off', 'etapa')
  await reporter.iteration('off', 1)
  assert.equal(timers.current, null)
  assert.equal(calls, 0)
  reporter.start('a', { enabled: true, every: 3 })
  reporter.observe('a', { request: 'objetivo' })
  await timers.fire()
  assert.deepEqual(errors, ['indisponível'])
  assert.ok(timers.current)
  await timers.fire()
  assert.equal(messages[0].text, 'recuperado')
  reporter.finish('a')
  reporter.finish('off')
})
