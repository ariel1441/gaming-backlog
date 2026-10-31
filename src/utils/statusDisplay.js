import { statusDisplayLabel } from "../../shared/statusModel.js";
export { statusDisplayLabel } from "../../shared/statusModel.js";
export function statusOption(status) {
  return { value: status, label: statusDisplayLabel(status) };
}
