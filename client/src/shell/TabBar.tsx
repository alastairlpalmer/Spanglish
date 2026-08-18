export type Tab = 'today' | 'cards' | 'talk' | 'reading' | 'log';

// Small stroke icons, 18px, inheriting currentColor — instrument, not toy.
const ICONS: Record<Tab, JSX.Element> = {
  today: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
  cards: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="14" height="12" rx="2" />
      <path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2" />
    </svg>
  ),
  talk: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
    </svg>
  ),
  reading: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6c-2-1.5-4.5-2-8-2v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2V4c-3.5 0-6 .5-8 2z" />
      <path d="M12 6v14" />
    </svg>
  ),
  log: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 20V10" />
      <path d="M10 20V4" />
      <path d="M15 20v-8" />
      <path d="M20 20V7" />
    </svg>
  ),
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'cards', label: 'Cards' },
  { id: 'talk', label: 'Talk' },
  { id: 'reading', label: 'Read' },
  { id: 'log', label: 'Log' },
];

export function TabBar({
  active,
  onChange,
  badges,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  /** Small count bubbles per tab (e.g. cards due). Zero/absent = no badge. */
  badges?: Partial<Record<Tab, number>>;
}): JSX.Element {
  return (
    <nav className="tab-bar">
      {TABS.map((t) => {
        const badge = badges?.[t.id] ?? 0;
        return (
          <button
            key={t.id}
            className={active === t.id ? 'active' : ''}
            onClick={() => onChange(t.id)}
            aria-current={active === t.id ? 'page' : undefined}
          >
            {ICONS[t.id]}
            {t.label}
            {badge > 0 && <span className="tab-badge">{badge > 99 ? '99+' : badge}</span>}
          </button>
        );
      })}
    </nav>
  );
}
