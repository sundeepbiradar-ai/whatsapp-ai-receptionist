import Link from 'next/link';

import { dashboardNavigationItems } from '@/lib/dashboard/navigation';

export function DashboardNav(): React.ReactElement {
  return (
    <nav aria-label="Dashboard sections" className="mt-8 flex flex-wrap gap-3">
      {dashboardNavigationItems.map((item) => (
        <Link className="button-secondary" href={item.href} key={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
