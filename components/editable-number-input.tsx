"use client";

import {
  type FocusEvent,
  type InputHTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";

export function numberToEditableDraft(value: number | "") {
  return value === "" || !Number.isFinite(value) ? "" : String(value);
}

export function parseEditableNumberDraft(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

type EditableNumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number | "";
  onValueChange: (value: number) => void;
};

/**
 * Controlled numeric project values need a separate text draft while the user edits them.
 * Otherwise Number("") immediately becomes 0 and makes the zero appear impossible to delete.
 */
export default function EditableNumberInput({
  value,
  onValueChange,
  onFocus,
  onBlur,
  ...inputProps
}: EditableNumberInputProps) {
  const [draft, setDraft] = useState(() => numberToEditableDraft(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(numberToEditableDraft(value));
  }, [value]);

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    focusedRef.current = true;
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    focusedRef.current = false;
    const parsed = parseEditableNumberDraft(draft);
    if (parsed === null) {
      setDraft(numberToEditableDraft(value));
    } else {
      setDraft(String(parsed));
    }
    onBlur?.(event);
  };

  return (
    <input
      {...inputProps}
      type="number"
      value={draft}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={(event) => {
        const nextDraft = event.currentTarget.value;
        setDraft(nextDraft);
        const parsed = parseEditableNumberDraft(nextDraft);
        if (parsed !== null) onValueChange(parsed);
      }}
    />
  );
}
