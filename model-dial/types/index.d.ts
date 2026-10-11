export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** What the dial shows: the live model and effort, and a change still queued behind a turn. */
export type Dial = {
  model: string | null
  effort: Effort | null
  pendingModel: string | null
  pendingEffort: Effort | null
}

declare module 'claude-code' {
  interface PluginState {
    'model-dial': { dial: Dial }
  }
}
