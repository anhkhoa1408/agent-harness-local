import type { ModelInfo } from "@/domain/model-policy";
import { SelectField } from "./select-field";
export function ModelSelector({
  id,
  value,
  catalog,
  onSelect,
  disabled,
}: {
  id: string;
  value: string;
  catalog: ModelInfo[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <SelectField
      id={id}
      label={`Model ${id.replace("model-", "")}`}
      value={value}
      required
      disabled={disabled}
      placeholder="Chọn model"
      onValueChange={onSelect}
      options={catalog.map((model) => ({ value: model.id, label: model.id }))}
    />
  );
}
