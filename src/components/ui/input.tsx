import * as React from "react"

import { cn } from "@/lib/utils"
import { normalizeQuarterHourDateTimeLocal, normalizeQuarterHourTime } from "@/lib/dateTimeInputs"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  autoComplete?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, step, onBlur, onChange, min, ...props }, ref) => {
    const normalizedStep =
      step
      ?? (type === 'time' || type === 'datetime-local'
        ? 900
        : undefined);
    const normalizedMin =
      min
      ?? (type === 'time'
        ? '00:00'
        : type === 'datetime-local'
          ? '1970-01-01T00:00'
          : undefined);
    return (
      <input
        type={type}
        step={normalizedStep}
        min={normalizedMin}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-muted/35 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/70 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        autoComplete={props.autoComplete ?? 'off'}
        onChange={(event) => {
          const rawValue = event.currentTarget.value;
          if (type === 'time') {
            // Only normalize once a full HH:mm value is present.
            if (/^\d{2}:\d{2}(?::\d{2})?$/.test(rawValue)) {
              const normalized = normalizeQuarterHourTime(rawValue);
              if (normalized) event.currentTarget.value = normalized;
            }
          } else if (type === 'datetime-local') {
            // Only normalize once a full YYYY-MM-DDTHH:mm value is present.
            const normalized = normalizeQuarterHourDateTimeLocal(rawValue);
            if (normalized) event.currentTarget.value = normalized;
          }
          onChange?.(event);
        }}
        onBlur={(event) => {
          if (type === 'time') {
            const normalized = normalizeQuarterHourTime(event.currentTarget.value);
            if (normalized) event.currentTarget.value = normalized;
          } else if (type === 'datetime-local') {
            const normalized = normalizeQuarterHourDateTimeLocal(event.currentTarget.value);
            if (normalized) event.currentTarget.value = normalized;
          }
          onBlur?.(event);
        }}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }