import type { Document } from '../types/document'

export interface Command {
  readonly type: string
  execute(doc: Document): void
  undo(doc: Document): void
}

/** Commands that support updateText (for new-node workflow) */
export interface TextUpdatable {
  updateText(newText: string): void
}

export function isTextUpdatable(cmd: Command): cmd is Command & TextUpdatable {
  return 'updateText' in cmd
}
