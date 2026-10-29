import { lazy, Suspense, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDataRefresh } from '../../hooks/useDataRefresh';
import { useDashboardQuery } from '../../features/dashboard/hooks/useDashboardQuery';
import { invalidateDashboard } from '../../lib/queryInvalidation';
import ManagerDashboardHero from './dashboard/ManagerDashboardHero';
import ManagerKpiCards from './dashboard/ManagerKpiCards';
import ManagerDashboardPanels from './dashboard/ManagerDashboardPanels';

const ManagerCharts = lazy(() => import('./dashboard/ManagerCharts'));

function ChartSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="h-[320px] rounded-2xl bg-slate-100 animate-pulse" />
      <div className="h-[320px] rounded-2xl bg-slate-100 animate-pulse" />
    </div>
  );
}

export default function ManagerDashboard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching } = useDashboardQuery('/sales-manager/dashboard');

  const refresh = useCallback(() => {
    invalidateDashboard(queryClient);
  }, [queryClient]);

  useDataRefresh(['dashboard'], refresh);

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-9 h-9 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {isFetching && (
        <div className="h-0.5 w-full bg-violet-500/30 rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-violet-500 animate-pulse" />
        </div>
      )}

      <ManagerDashboardHero
        pendingFollowups={data?.kpis?.pendingFollowups ?? 0}
        newLeadsToday={data?.kpis?.newLeadsToday ?? 0}
        pendingQuotes={data?.pendingApprovals?.length || 0}
      />

      <ManagerKpiCards kpis={data?.kpis} />

      <Suspense fallback={<ChartSkeleton />}>
        <ManagerCharts data={data} />
      </Suspense>

      <ManagerDashboardPanels data={data} />

      <footer className="pt-3 pb-1 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
        <p>© {new Date().getFullYear()} HindHolidays. All rights reserved.</p>
        <p>
          Made with <span className="text-rose-500">♥</span> for your success
        </p>
      </footer>
    </div>
  );
}
