import { steamPriceDisplay } from '../utils/steamPrice';

export default function SteamPrice({ price, details = false, compact = false, prominent = false }) {
  const display = steamPriceDisplay(price);
  if (!display) return null;
  const stateDescription = [display.freshness, display.note].filter(Boolean).join(". ");
  return (
    <div className="min-w-0 space-y-1.5 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1" title={stateDescription || undefined}>
        <span className={`${prominent ? "text-xl" : "text-lg"} font-semibold leading-none tabular-nums text-content-primary`}>{display.label}</span>
        {display.regular ? <s className="text-content-muted">{display.regular}</s> : null}
        {display.discount && !display.stale ? <span className="rounded-md bg-state-success/10 px-1.5 py-0.5 font-semibold text-state-success">{display.discount}</span> : null}
      </div>
      {details && !compact && display.freshness ? <p className="text-content-muted">{display.freshness}</p> : null}
      {details && !compact && display.lastKnown ? <p className="text-content-muted">{display.lastKnown}</p> : null}
      {details && !compact && display.note ? <p className="text-content-muted">{display.note}</p> : null}
    </div>
  );
}
