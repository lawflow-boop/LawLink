import { HeroBlock } from "@/components/dashboard/hero-block";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { ScheduleList } from "@/components/dashboard/schedule-list";
import { AlertsList } from "@/components/dashboard/alerts-list";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { CategoryChart } from "@/components/dashboard/category-chart";
import {
  getDashboardKpis,
  getDashboardRevenueTrend,
  getDashboardCategoryDistribution,
  getDashboardSchedule,
  getDashboardHeroData
} from "@/server/dashboard/actions";

export default async function DashboardPage() {
  const [kpis, revenueTrend, categoryDistribution, scheduleItems, heroData] =
    await Promise.all([
      getDashboardKpis(),
      getDashboardRevenueTrend(),
      getDashboardCategoryDistribution(),
      getDashboardSchedule(),
      getDashboardHeroData()
    ]);

  return (
    <div className="space-y-6 pb-8">
      <HeroBlock data={heroData} />

      <div className="ll-rule" />

      <KpiCards data={kpis} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ScheduleList data={scheduleItems} />
        </div>
        <div className="lg:col-span-2">
          <AlertsList />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <RevenueChart data={revenueTrend} />
        </div>
        <div className="lg:col-span-2">
          <CategoryChart data={categoryDistribution} />
        </div>
      </div>
    </div>
  );
}
