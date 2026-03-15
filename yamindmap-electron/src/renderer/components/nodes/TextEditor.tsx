import { useRef, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import { EditTextCommand } from '../../../shared/commands/node-commands'
import { Color } from '../../../shared/types/style'
import {
  TEXT_EDITOR_BORDER_COLOR,
  TEXT_EDITOR_BORDER_WIDTH
} from '../../../shared/constants'

interface TextEditorProps {
  nodeId: string
  initialText: string
  isNewNode: boolean
  shape: string
  fontSize: number
  fontColor: string
  onCommit: () => void
  onCancel: () => void
}

const borderColor = Color.toCss(TEXT_EDITOR_BORDER_COLOR)

export function TextEditor({ nodeId, initialText, isNewNode, shape, fontSize, fontColor, onCommit, onCancel }: TextEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  const committedRef = useRef(false)
  const executeCommand = useStore((s) => s.executeCommand)
  const undo = useStore((s) => s.undo)
  const updateLastText = useStore((s) => s.updateLastText)

  useEffect(() => {
    const el = ref.current
    if (el) {
      el.focus()
      // Select all text
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [])

  const commit = useCallback(() => {
    if (committedRef.current) return
    committedRef.current = true

    const trimmed = (ref.current?.innerText ?? '').trim()
    if (isNewNode) {
      if (trimmed === '') {
        undo()
      } else {
        updateLastText(trimmed)
        useStore.getState().updateDocument((doc) => {
          const node = doc.nodes.get(nodeId)
          if (node) node.content.text = trimmed
        })
      }
    } else {
      if (trimmed !== initialText) {
        executeCommand(new EditTextCommand(nodeId, trimmed))
      }
    }
    onCommit()
  }, [isNewNode, initialText, nodeId, executeCommand, undo, updateLastText, onCommit])

  const cancel = useCallback(() => {
    if (committedRef.current) return
    committedRef.current = true

    if (isNewNode) {
      undo()
    }
    onCancel()
  }, [isNewNode, undo, onCancel])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        commit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
      e.stopPropagation()
    },
    [commit, cancel]
  )

  const centered = shape === 'Ellipse' || shape === 'Diamond'

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        border: `${TEXT_EDITOR_BORDER_WIDTH}px solid ${borderColor}`,
        borderRadius: shape === 'Ellipse' ? '50%' : shape === 'Capsule' ? '9999px' : 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: centered ? 'center' : 'flex-start',
        padding: centered ? '0' : '0 12px',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onKeyDown={handleKeyDown}
        onBlur={commit}
        data-testid="text-editor"
        style={{
          outline: 'none',
          color: fontColor,
          fontSize: `${fontSize}px`,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          lineHeight: 1.3,
          textAlign: centered ? 'center' : 'left',
          cursor: 'text',
          minWidth: 4,
          wordBreak: 'break-word'
        }}
      >
        {initialText}
      </div>
    </div>
  )
}
