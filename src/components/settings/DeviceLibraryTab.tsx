import { useState, useCallback, useMemo } from 'react';
import { Cpu } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getDeviceLibrary } from '@/lib/deviceLibraryStorage';
import { DeviceLibrarySortableList } from '@/components/settings/DeviceLibrarySortableList';

export function DeviceLibraryTab() {
  const [epoch, setEpoch] = useState(0);
  const refresh = useCallback(() => setEpoch((n) => n + 1), []);
  const rows = useMemo(() => getDeviceLibrary(), [epoch]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
          Device library
        </CardTitle>
        <CardDescription>
          Same interaction model as lookup lists: reorder with the handle, edit with the pencil, add with the button.
          Cable rows can carry default unit, jacket color, and a restock increment; media converters can record a
          signal path (e.g. SDI to HDMI). Included in full backups when the file contains a deviceLibrary block.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DeviceLibrarySortableList entries={rows} onEntriesChange={refresh} />
      </CardContent>
    </Card>
  );
}
