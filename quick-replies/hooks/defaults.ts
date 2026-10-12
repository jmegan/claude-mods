/** The buttons every install starts with. A user's config file adds to, edits or hides these. */
export type DefaultReply = {
  id: string
  label: string
  text: string
  send?: boolean
  more?: boolean
  style?: 'solid' | 'outline'
  /** A role (go, ask, info, caution, stop, git, plan, agent, neutral), a theme key, or a raw color. */
  color?: string
}

export const DEFAULT_REPLIES: readonly DefaultReply[] = [
  {
    id: 'continue',
    label: 'Continue',
    text: "Yes, go ahead with everything you just proposed and keep going. Don't pause to ask again unless you're blocked or the next step needs a decision only I can make.",
    style: 'solid',
    color: 'go',
  },
  {
    id: 'ask-me',
    label: 'Ask me',
    text: 'Use your question tool (AskUserQuestion) to ask me every question you need answered in this session, including any open questions or decisions you have been holding back. Ask them all in one go.',
    style: 'solid',
    color: 'ask',
  },
  { id: 'yes', label: 'Yes', text: 'Yes.', color: 'go' },
  {
    id: 'try-again',
    label: 'Try again',
    text: "That didn't work. Try again, and tell me what you are changing this time.",
    color: 'info',
  },
  {
    id: 'your-call',
    label: 'Your call',
    text: 'Use your best judgment and pick the option you recommend. Tell me what you picked and why in one line.',
    color: 'agent',
  },
  {
    id: 'whats-next',
    label: "What's next?",
    text: "What's next? List the open items and your recommended order.",
    color: 'info',
  },
  {
    id: 'status',
    label: 'Check in',
    text: 'Check in: where are you, what is done, what is left, and what is blocking you?',
    color: 'info',
  },
  {
    id: 'verify',
    label: 'Verify',
    text: "Verify it. Run the relevant tests, typecheck and lint, and show me the results before you say it's done.",
    color: 'caution',
  },
  {
    id: 'stop',
    label: 'Stop',
    text: "Stop. Don't make any more changes. Tell me what you have done so far and what state things are in.",
    color: 'stop',
  },
  {
    id: 'commit',
    label: 'Commit',
    text: 'Commit just the changes you made in this session, with a clear message.',
    more: true,
    color: 'git',
  },
  {
    id: 'review',
    label: 'Review',
    text: 'Review your own changes for bugs and quality, then fix anything you find.',
    more: true,
    color: 'caution',
  },
  {
    id: 'subagents',
    label: 'Subagents',
    text: 'Use subagents for the independent parts of this, and keep the main thread for coordination.',
    more: true,
    color: 'agent',
  },
  {
    id: 'check-docs',
    label: 'Check docs',
    text: 'Look up the current official docs (Context7 or the web) to verify this before you go on.',
    more: true,
    color: 'info',
  },
  {
    id: 'plan-first',
    label: 'Plan first',
    text: "Don't change anything yet. Show me your plan first and wait for my go-ahead.",
    more: true,
    color: 'plan',
  },
  {
    id: 'summarize',
    label: 'Summarize',
    text: 'Summarize where we are in a few bullets: what changed, what works, and what is still open.',
    more: true,
    color: 'neutral',
  },
  {
    id: 'explain',
    label: 'Explain',
    text: 'Explain that more simply, with a concrete example. ',
    send: false,
    more: true,
    color: 'neutral',
  },
]
