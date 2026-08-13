// Progress ring. Closes at the daily target and stays closed — bonus minutes
// never reopen it or start a second ring.

export function Ring({
  minutes,
  target,
  size = 84,
}: {
  minutes: number;
  target: number;
  size?: number;
}): JSX.Element {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fraction = Math.min(1, minutes / target);
  const closed = fraction >= 1;

  return (
    <svg className="ring-svg" width={size} height={size} aria-hidden="true">
      <circle
        className="ring-track"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
      />
      <circle
        className={`ring-fill ${closed ? 'closed' : ''}`}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
      />
    </svg>
  );
}
