import { FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, Switch, Typography } from '@mui/material'
import { LOCALES, useI18n } from '../../i18n'
import { useThemeStore } from '../../store/theme'

export default function PreferencesTab({ t }) {
  const { locale, setLocale } = useI18n()
  const mode = useThemeStore((state) => state.mode)
  const setMode = useThemeStore((state) => state.setMode)

  return (
    <div className="settings-preferences">
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>{t('settingsPage.preferences.title')}</Typography>
      <Stack spacing={3}>
        <FormControl fullWidth size="small">
          <InputLabel>{t('settingsPage.preferences.language')}</InputLabel>
          <Select value={locale} label={t('settingsPage.preferences.language')} onChange={(e) => setLocale(e.target.value)}>
            {Object.entries(LOCALES).map(([code, meta]) => (
              <MenuItem key={code} value={code}>{meta.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControlLabel
          control={<Switch checked={mode === 'dark'} onChange={(e) => setMode(e.target.checked ? 'dark' : 'light')} />}
          label={t('settingsPage.preferences.darkMode')}
        />
        <Typography variant="body2" color="text.secondary">{t('settingsPage.preferences.themeHint')}</Typography>
      </Stack>
    </div>
  )
}
