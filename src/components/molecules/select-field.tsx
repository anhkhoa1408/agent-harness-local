"use client";
import { useState } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
export type SelectOption = { value: string; label: string };
export function SelectField({
  id,
  name,
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  required,
  disabled,
  descriptionId,
  placeholder = "Chọn lựa chọn",
}: {
  id: string;
  name?: string;
  label: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  descriptionId?: string;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(defaultValue ?? "");
  const selected = value ?? local;
  return (
    <Select
      name={name}
      value={selected}
      onValueChange={(next) => {
        // Radix may bubble an empty native value while async options mount.
        // Empty is a placeholder, never a selectable option in these forms.
        if (next === "") return;
        setLocal(next);
        onValueChange?.(next);
      }}
      required={required}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={label}
        className="w-full min-w-0"
        aria-required={required}
        aria-describedby={descriptionId}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-w-[calc(100vw-2rem)]">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
