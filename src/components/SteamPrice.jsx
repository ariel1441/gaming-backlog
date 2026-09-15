import { steamPriceDisplay } from '../utils/steamPrice';

export default function SteamPrice({ price, details = false, compact = false }) {
  const display = steamPriceDisplay(price);
  if (!display) return null;
  return (
    <div className="min-w-0 space-y-1.5 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-content-muted">Steam Israel</span>
        <span className="text-base font-semibold tabular-nums text-content-primary">{display.label}</span>
        {display.regular ? <s className="text-content-muted">{display.regular}</s> : null}
        {display.discount && !display.stale ? <span className="rounded-md bg-state-success/10 px-1.5 py-0.5 font-semibold text-state-success">{display.discount}</span> : null}
        {details && compact ? <span className="text-content-muted">· {display.freshness}</span> : null}
        {details && compact && display.note ? <span className="text-content-muted">· {display.note}</span> : null}
      </div>
      {details && !compact ? <p className="text-content-muted">{display.freshness}</p> : null}
      {display.lastKnown ? <p className="text-content-muted">{display.lastKnown}</p> : null}
      {display.note && !compact ? <p className="text-content-muted">{display.note}</p> : null}
    </div>
  );
}
