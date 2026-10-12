/** One button, after the config file and the defaults are merged and normalized. */
export type Reply = {
  id: string
  label: string
  /** What the button sends, or inserts into the prompt box when `send` is false. */
  text: string
  /** True sends the text as a prompt; false adds it to the draft so the person can finish it. */
  send: boolean
  /** True tucks the button behind the `more` chip. */
  more: boolean
  /** `solid` is a filled pill; `outline` is colored text. */
  style: 'solid' | 'outline'
  color: string
  /** The hotkey (one digit or lowercase letter), explicit or assigned. */
  key: string
  /** `always` shows the button all the time; `asking` only while Claude's last message asks a question. */
  when: 'always' | 'asking'
  /** Where it came from: the built-ins, the user's file, or this project's file. */
  source: 'default' | 'user' | 'project'
}

/** What the band draws from: the merged buttons and anything wrong with the config file. */
export type Board = {
  replies: Reply[]
  configPath: string
  problems: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'quick-replies': {
      board: Board
      isHidden: boolean
      isMoreOpen: boolean
      /** True while Claude's last message ends in a question. */
      isAsking: boolean
    }
  }
}
