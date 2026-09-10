import { useI18n } from '../i18n'

export default function ExecutionHistory({ items }) {
  const { t } = useI18n()
  if (!items.length) {
    return <p className="muted-line">{t('executionHistory.empty')}</p>
  }

  return (
    <ul className="history-list">
      {items.map((item) => (
        <li key={item.id} className="history-item">
          <div><strong>{item.strategy}</strong> {t('executionHistory.via')} {item.provider}</div>
          <div className="muted-line">{item.question}</div>
          <div className="muted-line">{item.answer_preview}</div>
        </li>
      ))}
    </ul>
  )
}
