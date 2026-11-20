import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createConfigStore } from '../agent/utils/config_store.js'

const dataDir = new URL('./data/', import.meta.url)
const store = createConfigStore(fileURLToPath(new URL('preferences.json', dataDir)))
const defaults = { enabled: false, every: 3, model: '', mode: 'default', prompt: '' }

export function loadPreferences() {
  try { return { ...defaults, ...store.get() } }
  catch { return { ...defaults } }
}

export function savePreferences(value) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  return store.save(value)
}

export function activeModels(pools) {
  const options = new Map()
  for (const pool of pools || []) {
    const poolId = pool.id || pool.name
    if (pool.enabled !== true || !poolId || !pool.provider) continue
    for (const model of [pool.model, ...(Array.isArray(pool.models) ? pool.models : [])]) {
      const id = typeof model === 'string' ? model : model?.id
      if (!id) continue
      const value = JSON.stringify([poolId, id])
      options.set(value, { value, label: id, group: pool.provider, pool: poolId, model: id })
    }
  }
  return [...options.values()]
}

export function validatePreferences(input, options) {
  const value = {
    enabled: input.enabled === true,
    every: Number(input.every),
    model: typeof input.model === 'string' ? input.model : '',
    mode: input.mode,
    prompt: typeof input.prompt === 'string' ? input.prompt.trim() : '',
  }
  if (!Number.isSafeInteger(value.every) || value.every < 1) throw new Error('Informe um intervalo inteiro positivo para os resumos.')
  if (!['default', 'custom'].includes(value.mode)) throw new Error('Modo de resumo inválido.')
  if (value.prompt.length > 4000 || (value.enabled && value.mode === 'custom' && !value.prompt)) {
    throw new Error('Informe instruções personalizadas de até 4.000 caracteres.')
  }
  if (value.enabled && !options.some(option => option.value === value.model)) {
    throw new Error('Escolha um modelo ativo para os resumos.')
  }
  return value
}
