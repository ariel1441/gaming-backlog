import { SegmentedControl } from "../ui";

export default function Segmented({ value, onChange, options }) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      options={options}
      size="sm"
      connected
      ariaLabel="Chart range"
      className="overflow-hidden bg-surface-card"
      activeClassName="bg-action-primary text-content-on-primary"
      inactiveClassName="text-content-secondary hover:bg-surface-elevated"
    />
  );
}
