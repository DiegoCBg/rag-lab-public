import { Button } from '@mui/material'
import LanguageIcon from '@mui/icons-material/Language'
import { LOCALES, useI18n } from '../i18n'

export default function LocaleSwitcher({ compact = false }) {
  const { locale, setLocale } = useI18n()
  const next = locale === 'pt-BR' ? 'en' : 'pt-BR'

  return (
    <Button
      size="small"
      variant="outlined"
      onClick={() => setLocale(next)}
      startIcon={<LanguageIcon />}
      className="locale-switcher-button"
    >
      {compact ? LOCALES[next].label.split(' ')[0] : LOCALES[next].label}
    </Button>
  )
}
