import type { KeyboardEvent } from 'react'

type TabTarget = HTMLTextAreaElement | HTMLInputElement
type TabKeyEvent = KeyboardEvent<TabTarget>

export function insertTabAtSelection(event: TabKeyEvent, setValue: (value: string) => void): void {
  if (event.key !== 'Tab') return

  event.preventDefault()
  const target = event.currentTarget
  const start = target.selectionStart ?? target.value.length
  const end = target.selectionEnd ?? start
  const nextValue = `${target.value.slice(0, start)}\t${target.value.slice(end)}`
  setValue(nextValue)

  const restoreSelection = () => {
    target.selectionStart = start + 1
    target.selectionEnd = start + 1
  }
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(restoreSelection)
  } else {
    restoreSelection()
  }
}
