import * as React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { FlaskConical, Gauge, Layers, Wrench } from 'lucide-react';
import { replaceProductionsWithInternalDemoSeed } from '@/lib/demoSeed';
import { PageHeader } from '@/components/ui/page-shell';

const devItems = [
  {
    title: 'Time Picker Lab',
    description: 'Compare and validate time selection UX patterns.',
    path: '/dev/time-picker-lab',
    icon: FlaskConical,
  },
  {
    title: 'Production progress lab',
    description: 'Compact progress patterns for dashboard production cards.',
    path: '/dev/production-progress-lab',
    icon: Gauge,
  },
  {
    title: 'UI Diagnostics',
    description: 'Run visual and interaction diagnostics for UI behavior.',
    path: '/dev/ui-diagnostics',
    icon: Wrench,
  },
  {
    title: 'Expand all switch',
    description: 'Layouts for the toolbar expand-all control (same Switch pattern as Confirm deletes).',
    path: '/dev/expand-collapse-lab',
    icon: Layers,
  },
];

export default function DevMenuPage() {
  const [confirmReplaceInternalOpen, setConfirmReplaceInternalOpen] = React.useState(false);
  const [replaceBusy, setReplaceBusy] = React.useState(false);

  const handleReplaceInternalProductions = (): void => {
    setReplaceBusy(true);
    try {
      const n = replaceProductionsWithInternalDemoSeed();
      toast.success('Productions replaced with internal demo seed', {
        description: `${n} production${n === 1 ? '' : 's'} loaded from seedData.internal.ts. Sync to the workspace if you need this on other devices.`,
      });
    } catch (error) {
      toast.error('Could not replace productions', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setReplaceBusy(false);
      setConfirmReplaceInternalOpen(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        eyebrow="Internal"
        title="Developer Menu"
        description="Admin tools and diagnostics."
        icon={<Wrench className="h-6 w-6" aria-hidden />}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {devItems.map((item) => (
          <Link key={item.path} to={item.path} className="block">
            <Card className="h-full transition-colors hover:bg-accent/30 hover:shadow-ti-md">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="border-amber-500/25 bg-amber-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Internal demo productions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Replace <strong>every</strong> production in this browser with the full bundle from{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">seedData.internal.ts</code>. Does not depend on{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">VITE_DEMO_SEED_PROFILE</code>. Other demo data
            (inventory, contacts) is unchanged — push to the workspace afterward if needed.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmReplaceInternalOpen(true)}
              disabled={replaceBusy}
            >
              {replaceBusy ? 'Replacing…' : 'Replace all productions with internal seed'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmReplaceInternalOpen} onOpenChange={setConfirmReplaceInternalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace all productions with internal demo seed?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every production currently stored locally (including non-demo shows) and replaces them with
              only the productions defined in the internal seed bundle. Inventory and other data are not modified. This
              cannot be undone from here — use a backup or cloud history if you need to recover.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={replaceBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleReplaceInternalProductions}
              disabled={replaceBusy}
            >
              {replaceBusy ? 'Replacing…' : 'Replace productions'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
