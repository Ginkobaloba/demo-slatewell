import type { LucideIcon } from "lucide-react";

interface Capability {
  name: string;
  detail: string;
}

/**
 * Minimal admin section scaffold. These sections are previewed in the demo
 * (the booking, dashboard, and confirmation flows are the live paths); this
 * gives each nav item a real page with real content instead of a 404.
 */
export function SectionPreview({
  icon: Icon,
  title,
  intro,
  capabilities,
}: {
  icon: LucideIcon;
  title: string;
  intro: string;
  capabilities: Capability[];
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-medium text-foreground">What {title} does</p>
            <p className="text-sm text-muted-foreground">
              The interactive tools land here when Slatewell is set up for your
              business.
            </p>
          </div>
        </div>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {capabilities.map((c) => (
            <li
              key={c.name}
              className="rounded-lg border border-border bg-background p-4"
            >
              <p className="text-sm font-medium text-foreground">{c.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
