import { dispatchEvent } from 'logos'
import { activeModels, loadPreferences } from './preferences.js'
import { createProgressReporter } from './index.js'

export function createProgressHook(dispatch = dispatchEvent, load = loadPreferences, timers = {}) {
  const reporter = createProgressReporter({
    ...timers,
    async callModel({ model, pool, system, prompt, signal }) {
      const abortSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(12_000)])
        : AbortSignal.timeout(12_000)
      if (abortSignal.aborted) return null
      let stop
      const cancelled = new Promise(resolve => {
        stop = () => resolve(null)
        abortSignal.addEventListener('abort', stop, { once: true })
      })
      try {
        return await Promise.race([
          dispatch('llm:call', { model, pool, system, prompt, abortSignal, tools: [], remoteRequest: true }),
          cancelled,
        ])
      } finally {
        abortSignal.removeEventListener('abort', stop)
      }
    },
    publish: ({ text, deliver }) => deliver(text),
  })

  return async function handle({ phase, sessionId, pools, objective, iteration, steps, signal, deliver }) {
    if (phase === 'start') {
      const config = load()
      const selected = config.enabled && activeModels(pools()).find(option => option.value === config.model)
      if (!selected) return
      reporter.start(sessionId, { ...config, model: selected.model, pool: selected.pool, signal, deliver })
      reporter.observe(sessionId, { request: objective() })
      return true
    } else if (phase === 'step') {
      for (const step of steps || []) reporter.observe(sessionId, step)
    } else if (phase === 'iteration') {
      if (iteration > 1) reporter.observe(sessionId, { iteration: iteration - 1, status: 'finished' })
      for (const step of steps || []) reporter.observe(sessionId, step)
      reporter.observe(sessionId, { iteration, status: 'in progress' })
      void reporter.iteration(sessionId, iteration)
    } else if (phase === 'finish') {
      reporter.finish(sessionId)
    }
  }
}

const handleProgress = createProgressHook()

export async function observeProgress(payload) {
  /** @register_hook agent:progress */
  const observing = await handleProgress(payload)
  return observing ? { ...payload, observing } : payload
}
