import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlaskConical, Gauge, Wrench } from 'lucide-react';

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
];

export default function DevMenuPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold">Developer Menu</h1>
      <p className="text-sm text-muted-foreground">Admin tools and diagnostics.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {devItems.map((item) => (
          <Link key={item.path} to={item.path} className="block">
            <Card className="h-full transition-colors hover:bg-accent/30">
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
    </div>
  );
}

