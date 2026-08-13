export type Tab = 'today' | 'cards' | 'talk' | 'log';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'cards', label: 'Cards' },
  { id: 'talk', label: 'Talk' },
  { id: 'log', label: 'Log' },
];

export function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }): JSX.Element {
  return (
    <nav className="tab-bar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={active === t.id ? 'active' : ''}
          onClick={() => onChange(t.id)}
          aria-current={active === t.id ? 'page' : undefined}
        >
          <span className="tab-dot" />
          {t.label}
        </button>
      ))}
    </nav>
  );
}
