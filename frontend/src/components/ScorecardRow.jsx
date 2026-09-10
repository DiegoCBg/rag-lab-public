export default function ScorecardRow({ label, primaryValue, secondaryValue }) {
  return (
    <div className="scorecard-row">
      <span>{label}</span>
      <span>{primaryValue}</span>
      <span>{secondaryValue}</span>
    </div>
  )
}
