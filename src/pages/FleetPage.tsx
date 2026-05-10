import { Truck, AlertCircle, Users, Wrench, ClipboardList, Radio } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const COMING_FEATURES = [
  {
    icon: Truck,
    title: 'Fleet board',
    description: 'At-a-glance grid of every vehicle — status pill, current operator, location, and open issues.',
  },
  {
    icon: AlertCircle,
    title: 'Subsystem tracking',
    description: 'Dejero, modem, P2, mast, laptop, and mechanical — per-vehicle status with loaner workflow.',
  },
  {
    icon: Users,
    title: 'Crew assignments',
    description: 'Default photographer / reporter per vehicle, plus date-ranged temporary overrides.',
  },
  {
    icon: Wrench,
    title: 'Scheduled work',
    description: 'Smog shop, Ford service, IT visits — takes truck offline automatically while in progress.',
  },
  {
    icon: ClipboardList,
    title: 'Daily digest composer',
    description: 'Select today\'s log entries and render a Fortin-style update email, grouped by vehicle.',
  },
  {
    icon: Radio,
    title: 'Phone roster',
    description: 'Printable 2-column crew card grid with photographer, M-number, and cell numbers.',
  },
];

export default function FleetPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Fleet</h1>
        <p className="text-sm text-muted-foreground">
          Manage news vehicles, crew assignments, equipment subsystems, and daily status updates.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Truck className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>Fleet module — in development</CardTitle>
              <CardDescription>
                Tracks M1–M25, Sat Truck, Expedition, M-26, and M-33 (maint/eng)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COMING_FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="flex gap-3 rounded-lg border border-border/60 bg-muted/30 p-3"
              >
                <feature.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{feature.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
