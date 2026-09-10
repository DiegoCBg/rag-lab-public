import { useI18n } from '../i18n'
import MarkdownContent from './MarkdownContent'

export default function ComparePanel({ result }) {
  const { t } = useI18n()
  if (!result) {
    return <p>{t('comparePanel.noResult')}</p>
  }

  return (
    <div className="compare-panel">
      <div className="compare-meta">
<span><strong>{t('comparePanel.provider')}</strong> {result.provider}</span>
        <span><strong>{t('comparePanel.strategy')}</strong> {result.strategy}</span>
      </div>
      <div className="compare-answer"><strong>{t('comparePanel.answer')}</strong><MarkdownContent>{result.answer}</MarkdownContent></div>
      <div>
        <strong>{t('comparePanel.chunks')}</strong>
        <ul>
          {result.chunks.map((chunk) => <li key={chunk}>{chunk}</li>)}
        </ul>
      </div>
      <div>
        <strong>{t('comparePanel.sources')}</strong>
        <ul>
          {result.sources.map((source) => <li key={source}>{source}</li>)}
        </ul>
      </div>
    </div>
  )
}
