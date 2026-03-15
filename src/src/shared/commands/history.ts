import type { Command } from './command'
import type { Document } from '../types/document'
import { isTextUpdatable } from './command'

export class CommandHistory {
  private undoStack: Command[] = []
  private redoStack: Command[] = []

  execute(cmd: Command, doc: Document): void {
    cmd.execute(doc)
    this.undoStack.push(cmd)
    this.redoStack = []
  }

  undo(doc: Document): boolean {
    const cmd = this.undoStack.pop()
    if (!cmd) return false
    cmd.undo(doc)
    this.redoStack.push(cmd)
    return true
  }

  redo(doc: Document): boolean {
    const cmd = this.redoStack.pop()
    if (!cmd) return false
    cmd.execute(doc)
    this.undoStack.push(cmd)
    return true
  }

  /** Update the text on the last command (for new-node commit workflow). */
  updateLastText(newText: string): boolean {
    const last = this.undoStack[this.undoStack.length - 1]
    if (!last || !isTextUpdatable(last)) return false
    last.updateText(newText)
    return true
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoCount(): number {
    return this.undoStack.length
  }

  get redoCount(): number {
    return this.redoStack.length
  }
}
