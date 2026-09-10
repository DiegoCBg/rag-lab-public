const claimTypeLabels = {
  fact: 'Fato',
  interpretation: 'Interpretação',
  inference: 'Inferência',
  conclusion: 'Conclusão',
  uncertainty: 'Incerteza',
}

export function buildRagAnswerDisplay(result) {
  if (!result) return ''

  const base = String(result.answer || '').trim()
  const parts = base ? [base] : []
  const claims = Array.isArray(result.claims)
    ? result.claims.filter((claim) => claim && typeof claim === 'object' && String(claim.text || '').trim())
    : []
  const groundedClaims = claims.filter((claim) => claim.grounded && !base.includes(String(claim.text).trim()))

  if (groundedClaims.length) {
    parts.push('### Afirmações fundamentadas')
    groundedClaims.forEach((claim) => {
      const label = claimTypeLabels[claim.type] || 'Afirmação'
      parts.push(`- **${label}:** ${String(claim.text).trim()}`)
    })
  }

  const unsupported = Array.isArray(result.unsupported_claims)
    ? result.unsupported_claims.filter((item) => item && typeof item === 'object' && String(item.text || '').trim())
    : []
  if (unsupported.length) {
    parts.push('### Pontos não confirmados')
    unsupported.forEach((item) => {
      const reason = item.reason ? ` (${String(item.reason).trim()})` : ''
      parts.push(`- ${String(item.text).trim()}${reason}`)
    })
  }

  const limitations = Array.isArray(result.limitations)
    ? result.limitations.map((item) => String(item).trim()).filter(Boolean)
    : []
  if (limitations.length) {
    parts.push('### Limitações')
    limitations.forEach((item) => parts.push(`- ${item}`))
  }

  return parts.join('\n\n')
}

