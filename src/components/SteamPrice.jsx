import { steamPriceDisplay } from '../utils/steamPrice';

export default function SteamPrice({ price }) {
  const display = steamPriceDisplay(price);
  if (!display) return null;
  return (
    <div className="min-w-0 space-y-1 text-xs" title={display.freshness}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-content-muted">Steam Israel</span>
        <span className="font-semibold text-content-primary">{display.label}</span>
        {display.regular ? <s className="text-content-muted">{display.regular}</s> : null}
        {display.discount ? <span className="text-state-success">{display.discount}</span> : null}
      </div>
      <p className="text-content-muted">{display.freshness}</p>
      {display.lastKnown ? <p className="text-content-muted">{display.lastKnown}</p> : null}
      {display.note ? <p className="text-content-muted">{display.note}</p> : null}
    </div>
  );
}
