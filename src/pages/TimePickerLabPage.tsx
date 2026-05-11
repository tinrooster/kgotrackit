import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { TimeInput } from '@/components/ui/time-input';
import { PageHeader } from '@/components/ui/page-shell';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toMinutes(time: string): number {
  const [hoursPart, minutesPart] = time.split(':');
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }
  return Math.max(0, Math.min(23 * 60 + 59, hours * 60 + minutes));
}

function toTime(minutes: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, minutes));
  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
}

function snapToQuarter(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

function addMinutes(base: string, delta: number): string {
  return toTime(snapToQuarter(toMinutes(base) + delta));
}

function formatAmPm(time: string): string {
  const [hoursPart, minutesPart] = time.split(':');
  const hours24 = Number(hoursPart);
  const minutes = Number(minutesPart);
  if (!Number.isFinite(hours24) || !Number.isFinite(minutes)) return '--:--';
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${pad2(minutes)} ${suffix}`;
}

export default function TimePickerLabPage() {
  const [value, setValue] = useState('13:00');
  const [maskedValue, setMaskedValue] = useState('13:00');
  const [hourWheel, setHourWheel] = useState('13');
  const [minuteWheel, setMinuteWheel] = useState('00');
  const [meridianWheel, setMeridianWheel] = useState<'AM' | 'PM'>('PM');

  const quickPicks = ['05:00', '06:00', '09:00', '11:00', '15:00', '16:00', '17:00', '18:00', '23:00'];

  const timelineValue = useMemo(() => toMinutes(value), [value]);

  const wheelValue = useMemo(() => {
    const hour12 = Number(hourWheel);
    const minute = Number(minuteWheel);
    if (!Number.isFinite(hour12) || !Number.isFinite(minute)) return '00:00';
    const normalized12 = Math.max(1, Math.min(12, hour12));
    const hours24 = meridianWheel === 'AM'
      ? (normalized12 === 12 ? 0 : normalized12)
      : (normalized12 === 12 ? 12 : normalized12 + 12);
    return `${pad2(hours24)}:${pad2(minute)}`;
  }, [hourWheel, minuteWheel, meridianWheel]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        eyebrow="Lab"
        title="Time Selection Lab"
        description={
          <>
            Test alternatives without changing production screens. Shared value preview: <span className="font-medium text-foreground">{value}</span> ({formatAmPm(value)})
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Stepper Buttons (-15 / +15)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">Current: <span className="font-medium">{value}</span></div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setValue((previous) => addMinutes(previous, -15))}>-15 min</Button>
              <Button type="button" onClick={() => setValue((previous) => addMinutes(previous, 15))}>+15 min</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Masked Text + Snap</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={maskedValue}
              onChange={(event) => setMaskedValue(event.target.value)}
              onBlur={() => {
                const normalized = toTime(snapToQuarter(toMinutes(maskedValue)));
                setMaskedValue(normalized);
                setValue(normalized);
              }}
              placeholder="HH:mm"
            />
            <p className="text-xs text-muted-foreground">Type any time, then blur to snap to 15 minutes.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Segmented Wheel (Hour / Minute / AM-PM)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Input value={hourWheel} onChange={(event) => setHourWheel(event.target.value)} />
              <Input value={minuteWheel} onChange={(event) => setMinuteWheel(event.target.value)} />
              <Input value={meridianWheel} onChange={(event) => setMeridianWheel(event.target.value.toUpperCase() === 'AM' ? 'AM' : 'PM')} />
            </div>
            <Button type="button" variant="outline" onClick={() => setValue(wheelValue)}>Apply Wheel Value ({wheelValue})</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Quick-Pick Chips</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {quickPicks.map((timeOption) => (
                <Button
                  key={timeOption}
                  type="button"
                  size="sm"
                  variant={value === timeOption ? 'default' : 'outline'}
                  onClick={() => setValue(timeOption)}
                >
                  {timeOption}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Timeline Slider (Snaps to 15)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Slider
              value={[timelineValue]}
              min={0}
              max={23 * 60 + 45}
              step={15}
              onValueChange={(nextValues) => setValue(toTime(nextValues[0] ?? 0))}
            />
            <div className="text-sm">Selected: <span className="font-medium">{value}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Keyboard Spinner (Arrow Keys)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={value}
              onChange={(event) => setValue(toTime(snapToQuarter(toMinutes(event.target.value))))}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setValue((previous) => addMinutes(previous, 15));
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setValue((previous) => addMinutes(previous, -15));
                }
              }}
            />
            <p className="text-xs text-muted-foreground">Use Arrow Up/Down for quarter-hour stepping.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Current TrackIT TimeInput</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <TimeInput
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            onBlurCommit={(nextValue) => setValue(nextValue ?? '00:00')}
          />
          <p className="text-xs text-muted-foreground">This is the component currently used in scheduling contexts.</p>
        </CardContent>
      </Card>
    </div>
  );
}
