"use client";

import { useEffect } from "react";

const AUTO_REPLACE_INPUT_TYPES = new Set([
  "email",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "url",
]);

export function isAutoReplaceInputType(type: string) {
  return AUTO_REPLACE_INPUT_TYPES.has(type.toLowerCase());
}

function editableField(target: EventTarget | null) {
  if (target instanceof HTMLTextAreaElement) {
    return !target.disabled && !target.readOnly && target.dataset.autoReplace !== "off" ? target : null;
  }
  if (target instanceof HTMLInputElement) {
    return !target.disabled
      && !target.readOnly
      && target.dataset.autoReplace !== "off"
      && isAutoReplaceInputType(target.type || "text")
      ? target
      : null;
  }
  return null;
}

export default function AutoReplaceInputs() {
  useEffect(() => {
    let pendingFrame = 0;

    const selectExistingValue = (event: Event) => {
      const field = editableField(event.target);
      if (!field?.value) return;
      window.cancelAnimationFrame(pendingFrame);
      pendingFrame = window.requestAnimationFrame(() => {
        if (document.activeElement !== field || !field.value) return;
        try {
          field.select();
        } catch {
          // Der Browser darf das Feld weiterhin normal bearbeiten, falls eine Auswahl nicht unterstützt wird.
        }
      });
    };

    document.addEventListener("focusin", selectExistingValue, true);
    document.addEventListener("pointerup", selectExistingValue, true);
    return () => {
      window.cancelAnimationFrame(pendingFrame);
      document.removeEventListener("focusin", selectExistingValue, true);
      document.removeEventListener("pointerup", selectExistingValue, true);
    };
  }, []);

  return null;
}
