import test from 'node:test'
import assert from 'node:assert/strict'
import { createProgressHook } from '../hooks.js'
import { activeModels, validatePreferences } from '../preferences.js'
import { progressSurface } from '../routes.js'
import { listSettingsSections } from '../../settings/lib/tabs.js'

const pools = [
  { id: 'primary', provider: 'openai', model: 'shared', models: ['other'], enabled: true },
  { name: 'secondary', provider: 'ollama', model: 'shared', enabled: true },
  { id: 'off', provider: 'openai', model: 'inactive', enabled: false },
]
const selected = JSON.stringify(['primary', 'shared'])
const input = { enabled: true, every: 2, model: selected, mode: 'custom', prompt: 'Informe o próximo passo.' }
test('a seção declarativa de Sessões lista modelos ativos por provider e valida a escolha', () => {
  const registration = listSettingsSections().find(section => section.id === 'agent-progress:preferences')
  assert.equal(registration?.tab, 'sessions')
  assert.equal(registration?.renderer, 'schema')
  const models = activeModels(pools)
  assert.deepEqual(validatePreferences(input, models), input)
  const surface = progressSurface(models)
  const { options } = surface.forms.preferences.fields.find(field => field.name === 'model')
  assert.deepEqual(options.slice(1).map(option => option.group), ['openai', 'openai', 'ollama'])
  assert.notEqual(options[1].value, options[3].value)
  assert.throws(() => validatePreferences({ ...input, model: JSON.stringify(['off', 'inactive']) }, models), /modelo ativo/)
})

test('hook faz llm:call na pool selecionada e publica a resposta durante o turno', async () => {
  const calls = [], published = []
  const handle = createProgressHook(async (event, request) => {
    calls.push([event, request])
    return { success: true, text: 'Atualização' }
  }, () => input)
  const sessionId = 'isolated'
  const tick = (iteration, steps = []) => handle({ phase: 'iteration', sessionId, iteration, steps })
  assert.equal(await handle({
    phase: 'start', sessionId, pools: () => pools,
    objective: () => 'Atualizar a documentação', deliver: text => published.push(text),
  }), true)
  await tick(1)
  assert.equal(calls.length, 0)
  const step = { iteration: 1, tool: 'read_file', status: 'completed' }
  await tick(2, [step])
  assert.equal(calls.length, 1)
  const [event, request] = calls[0]
  assert.equal(event, 'llm:call')
  assert.equal(request.pool, 'primary')
  assert.equal(request.model, 'shared')
  assert.equal(request.system, input.prompt)
  assert.deepEqual(JSON.parse(request.prompt)[0], { request: 'Atualizar a documentação' })
  assert.ok(JSON.parse(request.prompt).some(item => item.tool === step.tool))
  assert.deepEqual(published, ['Atualização'])
  await handle({ phase: 'finish', sessionId })
  await tick(4)
  assert.equal(calls.length, 1)
})
