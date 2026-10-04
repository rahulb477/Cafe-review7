"use client";

import { useState } from "react";
import { cn } from "@/components/ui";

/** A switch that posts a real "true"/"false" value with the surrounding form. */
export function ToggleField({
  name,
  checked,
  label,
  onChange,
}: {
  name: string;
  checked: boolean;
  label?: string;
  onChange?: (value: boolean) => void;
}) {
  const [on, setOn] = useState(checked);
  const toggle = () => {
    const next = !on;
    setOn(next);
    onChange?.(next);
  };
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label ?? name}
        onClick={toggle}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
          on ? "bg-stamp" : "bg-mocha/35",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-paper shadow transition-transform duration-200 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)]",
            on ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
      <input type="hidden" name={name} value={on ? "true" : "false"} />
    </>
  );
}
