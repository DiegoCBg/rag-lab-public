import { useI18n } from '../i18n'

export default function DocumentList({ documents, onDelete, deletingId = null }) {
  const { t } = useI18n()
  if (!documents.length) {
    return <p className="muted-line">{t('documentList.empty')}</p>
  }

  return (
    <ul className="doc-list">
      {documents.map((doc) => (
        <li key={doc.id} className="doc-item">
          <span>{doc.filename}</span>
          <span className="doc-status">{doc.status}</span>
          {onDelete ? (
            <button
              type="button"
              className="secondary-btn"
              onClick={() => onDelete(doc)}
              disabled={deletingId === doc.id}
            >
              {deletingId === doc.id ? t('documentList.deleting') : t('documentList.delete')}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
