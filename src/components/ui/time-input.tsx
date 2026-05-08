import * as React from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { InputProps } from '@/components/ui/input';
import { normalizeQuarterHourTime, TIME_INPUT_STEP_SECONDS } from '@/lib/dateTimeInputs';

export type TimeInputProps = Omit<InputProps, 'type'> & {
  /** After blur: normalized HH:mm on the quarter hour, or undefined if empty. */
  onBlurCommit?: (value: string | undefined) => void;
};

/**
 * Typed time field with fifteen-minute granularity and normalization on blur
 * ({@link normalizeQuarterHourTime}).
 */
export const TimeInput = React.forwardRef<HTMLInputElement, TimeInputProps>(function TimeInput(
  { className, value, onChange, onBlurCommit, disabled },
  _ref,
) {
  const timeOptions = React.useMemo(() => {
    const options: string[] = [];
    for (let minutes = 0; minutes < 24 * 60; minutes += TIME_INPUT_STEP_SECONDS / 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      options.push(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`);
    }
    return options;
  }, []);

  const normalizedValue = value ? normalizeQuarterHourTime(String(value)) : '';

  return (
    <Select
      value={normalizedValue || 'none'}
      onValueChange={(nextValue) => {
        const resolved = nextValue === 'none' ? '' : normalizeQuarterHourTime(nextValue);
        const target = { value: resolved } as HTMLInputElement;
        onChange?.({ currentTarget: target, target } as React.ChangeEvent<HTMLInputElement>);
        onBlurCommit?.(resolved || undefined);
      }}
      disabled={disabled}
    >
      <SelectTrigger className={cn(className)}>
        <SelectValue placeholder="--:--" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">--:--</SelectItem>
        {timeOptions.map((timeOption) => (
          <SelectItem key={timeOption} value={timeOption}>
            {timeOption}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});
