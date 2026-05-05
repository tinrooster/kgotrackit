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
          Define reusable device profiles (for example, a specific model under a template category) so item and
          template forms can fill known details faster. Included in full backups when the file contains a
          deviceLibrary block.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DeviceLibrarySortableList entries={rows} onEntriesChange={refresh} />
      </CardContent>
    </Card>
  );
}
