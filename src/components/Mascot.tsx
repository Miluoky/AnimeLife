/** Маскот Anime Life: сонный дух-кинозритель. Для пустых списков и страницы 404. */
export default function Mascot({ size = 140, mood = 'sleepy' }: { size?: number; mood?: 'sleepy' | 'lost' }) {
  return (
    <svg className="mascot" width={size} height={size} viewBox="0 0 140 140" aria-hidden="true">
      <defs>
        <radialGradient id="mascot-glow" cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="70" cy="76" r="62" fill="url(#mascot-glow)" />
      <path
        className="mascot__body"
        d="M38 110V66c0-18 14-32 32-32s32 14 32 32v44l-8-6-8 6-8-6-8 6-8-6-8 6-8-6z"
        fill="var(--surface-2)"
        stroke="var(--line)"
        strokeWidth="2"
      />
      {mood === 'sleepy' ? (
        <>
          <path d="M54 74q6 4 12 0" stroke="var(--text)" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M74 74q6 4 12 0" stroke="var(--text)" strokeWidth="3" strokeLinecap="round" fill="none" />
          <text x="98" y="48" fill="var(--muted)" fontSize="14" fontFamily="var(--font-display)">
            z
          </text>
          <text x="108" y="36" fill="var(--muted)" fontSize="18" fontFamily="var(--font-display)">
            z
          </text>
        </>
      ) : (
        <>
          <circle cx="60" cy="72" r="4" fill="var(--text)" />
          <circle cx="80" cy="72" r="4" fill="var(--text)" />
          <ellipse cx="70" cy="88" rx="4" ry="5" fill="var(--text)" opacity="0.8" />
          <text x="100" y="44" fill="var(--accent)" fontSize="26" fontFamily="var(--font-display)" fontWeight="700">
            ?
          </text>
        </>
      )}
      <circle cx="52" cy="84" r="4" fill="var(--accent)" opacity="0.35" />
      <circle cx="88" cy="84" r="4" fill="var(--accent)" opacity="0.35" />
    </svg>
  )
}
