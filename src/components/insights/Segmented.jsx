import { SegmentedControl } from "../ui";

export default function Segmented({ value, onChange, options }) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      options={options}
      size="sm"
      variant="connected"
      ariaLabel="Chart range"
      className="bg-surface-card"
    />
  );
}
