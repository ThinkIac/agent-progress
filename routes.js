import { dispatchEvent } from 'logos'
import { assertSurface } from '../ui-schema/index.js'
import { activeModels, loadPreferences, savePreferences, validatePreferences } from './preferences.js'

const ACTION = 'agent-progress.save-preferences'

export function progressSurface(options) {
  return assertSurface({
    version: 1,
    kind: 'settings-form',
    title: 'Resumos de progresso',
    description: 'Envia atualizações sem pausar o agente, por intervalo de iterações e durante etapas longas (30 segundos entre tentativas).',
    submitAction: ACTION,
    actions: { [ACTION]: { intent: 'write' } },
    forms: { preferences: { fields: [
      { name: 'enabled', component: 'toggle', label: 'Ativar resumos de progresso' },
      { name: 'every', component: 'input', type: 'number', min: 1, label: 'Intervalo em iterações', enabledWhen: 'enabled' },
      { name: 'model', component: 'select', label: 'Modelo do resumo', enabledWhen: 'enabled',
        options: [
          { value: '', label: 'Selecione um modelo' },
          ...options.map(({ value, label, group, pool }) => ({ value, label: `${label} (${pool})`, group })),
        ] },
      { name: 'mode', component: 'select', label: 'Modo de instruções', enabledWhen: 'enabled',
        options: [{ value: 'default', label: 'Default' }, { value: 'custom', label: 'Custom' }] },
      { name: 'prompt', component: 'textarea', label: 'Instruções personalizadas', maxLength: 4000,
        enabledWhen: 'enabled', visibleWhen: { field: 'mode', value: 'custom' } },
    ] } },
  })
}

async function modelOptions() {
  const response = await dispatchEvent('agent:session-model-pools', {})
  return activeModels(response?.pools)
}

export async function systemView() {
  /**
   * @register_router system/view
   * @method GET
   */
  const options = await modelOptions()
  const state = loadPreferences()
  if (!options.some(option => option.value === state.model)) state.model = ''
  return { status: 200, surface: progressSurface(options), state }
}

export async function systemAction(req) {
  /**
   * @register_router system/action
   * @method POST
   */
  if (req.body?.action !== ACTION) return { status: 404, mensagem: 'Ação desconhecida.' }
  try {
    const state = savePreferences(validatePreferences(req.body.values || {}, await modelOptions()))
    return { status: 200, state, notice: 'Preferências de resumos atualizadas.' }
  } catch (error) {
    return { status: 400, mensagem: error.message }
  }
}
