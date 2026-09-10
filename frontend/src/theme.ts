import { createTheme } from '@mui/material/styles'
import { lightTokens, darkTokens } from './styles/tokens'

const baseComponents = {
  MuiPaper: {
    styleOverrides: {
      root: {
        backgroundImage: 'none',
        border: '1px solid var(--ui-border-soft)',
        boxShadow: 'var(--ui-card-shadow)',
        transition: 'box-shadow 0.2s ease, transform 0.15s ease',
        '&:hover': {
          boxShadow: 'var(--ui-card-shadow-hover)',
        },
      },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: () => ({
        backgroundImage: 'none',
        border: '1px solid var(--ui-border-soft)',
        boxShadow: 'var(--ui-card-shadow)',
        borderRadius: 'var(--ui-panel-radius)',
        transition: 'box-shadow 0.2s ease, transform 0.15s ease',
        '&:hover': {
          boxShadow: 'var(--ui-elevation-2)',
        },
      }),
    },
  },
  MuiDataGrid: {
    styleOverrides: {
      root: {
        border: '1px solid var(--ui-border-soft)',
        borderRadius: 'var(--ui-panel-radius)',
        boxShadow: 'var(--ui-card-shadow)',
      },
      panel: { display: 'none' },
      cell: {
        borderTop: '1px solid var(--ui-border-soft)',
        padding: '0 16px',
        borderBottom: '1px solid var(--ui-border-soft)',
        fontSize: 14,
      },
      columnHeader: {
        backgroundColor: 'var(--ui-surface-2)',
        borderBottom: '1px solid var(--ui-border-strong)',
        fontWeight: 600,
      },
      columnHeaders: {
        backgroundColor: 'var(--ui-surface)',
        borderBottom: '1px solid var(--ui-border-soft)',
      },
      columnHeaderTitle: {
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.04em',
        color: 'var(--ui-text-secondary)',
      },
      row: {
        '&:last-child': { borderBottom: '1px solid var(--ui-border-soft)' },
        '&:hover': { backgroundColor: 'var(--ui-surface-hover)' },
      },
    },
  },
  MuiButton: {
    defaultProps: { size: 'medium' as const, variant: 'contained' as const },
    styleOverrides: {
      root: {
        minHeight: 40,
        borderRadius: 8,
        padding: '8px 16px',
        fontWeight: 600,
        boxShadow: 'var(--ui-elevation-1)',
        transition: 'all 0.15s ease',
        '&:hover': {
          boxShadow: 'var(--ui-elevation-2)',
          transform: 'translateY(-1px)',
        },
      },
    },
  },
  MuiButtonBase: {
    styleOverrides: {
      root: {
        transition: 'all 0.15s ease',
      },
    },
  },
  MuiTextField: {
    defaultProps: { size: 'medium' as const },
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          borderRadius: 'var(--ui-control-radius)',
        },
        '& .MuiOutlinedInput-notchedOutline': {
          borderColor: 'var(--ui-border-soft)',
          transition: 'border-color 0.15s ease',
        },
        '&:hover .MuiOutlinedInput-notchedOutline': {
          borderColor: 'var(--ui-border-strong)',
        },
        '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: 'var(--ui-accent)',
          borderWidth: '2px',
        },
      },
    },
  },
  MuiSelect: {
    defaultProps: { size: 'medium' as const },
    styleOverrides: {
      outlined: {
        borderRadius: 'var(--ui-control-radius)',
      },
    },
  },
  MuiTabs: {
    styleOverrides: {
      root: { minHeight: 44 },
      indicator: {
        backgroundColor: 'var(--ui-accent)',
        height: '3px',
        borderRadius: '2px',
      },
    },
  },
  MuiTab: {
    styleOverrides: {
      root: {
        minHeight: 44,
        padding: '0 16px',
        letterSpacing: '0.2px',
        fontWeight: 500,
      },
    },
  },
  MuiAlert: {
    styleOverrides: {
      root: {
        borderRadius: 'var(--ui-panel-radius)',
        border: '1px solid var(--ui-border-soft)',
        boxShadow: 'var(--ui-card-shadow)',
      },
      standardError: {
        backgroundColor: 'var(--ui-error-soft)',
        color: 'var(--ui-error)',
        borderColor: 'var(--ui-error-border)',
      },
      standardSuccess: {
        backgroundColor: 'var(--ui-success-soft)',
        color: 'var(--ui-success)',
        borderColor: 'var(--ui-success-border)',
      },
      standardWarning: {
        backgroundColor: 'var(--ui-warning-soft)',
        color: 'var(--ui-warning)',
        borderColor: 'var(--ui-warning-border)',
      },
    },
  },
}

const typography = {
  fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
  // Updated h1 to match page title styling (QueryPage header)
  h1: { fontSize: 28, fontWeight: 800, letterSpacing: 0 },
  h2: { fontSize: 20, fontWeight: 600, letterSpacing: 0 },
  h3: { fontSize: 16, fontWeight: 600, letterSpacing: 0 },
  // Semantic subtitle1 for brand title in AppNav
  subtitle1: { fontSize: 15, fontWeight: 800, letterSpacing: 0 },
  body1: { fontSize: 14, letterSpacing: 0 },
  body2: { fontSize: 13, letterSpacing: 0 },
  caption: { fontSize: 12, letterSpacing: 0 },
  button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
// Removed unused h4 definition (ComparisonPage now uses h1)
}

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: lightTokens.bg,
      paper: lightTokens.paper,
    },
    primary: { main: lightTokens.accent },
    success: { main: lightTokens.success },
    error: { main: lightTokens.error },
    warning: { main: lightTokens.warning },
    text: {
      primary: lightTokens.text,
      secondary: lightTokens.textSecondary,
    },
    divider: lightTokens.divider,
  },
  typography,
  shape: { borderRadius: 10 },
  components: baseComponents,
})

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: darkTokens.bg,
      paper: darkTokens.paper,
    },
    primary: { main: darkTokens.accent },
    success: { main: darkTokens.success },
    error: { main: darkTokens.error },
    warning: { main: darkTokens.warning },
    text: {
      primary: darkTokens.text,
      secondary: darkTokens.textSecondary,
    },
    divider: darkTokens.divider,
  },
  typography,
  shape: { borderRadius: 10 },
  components: baseComponents,
})
