import { diffWords } from 'diff'

export default function ResponseDiffViewer({ left = '', right = '' }) {
  const parts = diffWords(left || '', right || '')
  if (!left && !right) return <div className="empty-panel">Sem respostas para comparar.</div>
  return (
    <pre className="response-diff" aria-label="diff de respostas">
      {parts.map((part, index) => (
        <span key={index} className={part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-equal'}>
          {part.value}
        </span>
      ))}
    </pre>
  )
}
