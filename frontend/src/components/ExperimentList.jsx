import { useI18n } from '../i18n'

export default function ExperimentList({ items }) {
  const { t } = useI18n()
  if (!items.length) {
    return <p className="muted-line">{t('experimentList.empty')}</p>
  }

  return (
    <ul className="history-list">
      {items.map((item) => (
        <li key={item.id} className="history-item">
          <div><strong>{item.primary_strategy}</strong>{item.secondary_strategy ? ` ${t('experimentList.vs')} ${item.secondary_strategy}` : ''}</div>
          <div className="muted-line">{item.question}</div>
          <div className="muted-line">{item.provider}</div>
          {item.summary_json ? <div className="muted-line">{item.summary_json}</div> : null}
        </li>
      ))}
    </ul>
  )
}
