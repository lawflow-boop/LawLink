import { getSession } from "@/lib/auth/session";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { ScheduleList } from "@/components/dashboard/schedule-list";
import { AlertsList } from "@/components/dashboard/alerts-list";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { CategoryChart } from "@/components/dashboard/category-chart";
import { MyWeeklyCard } from "@/components/dashboard/my-weekly-card";
import {
  getDashboardKpis,
  getDashboardRevenueTrend,
  getDashboardCategoryDistribution,
  getDashboardSchedule,
  getDashboardHeroData
} from "@/server/dashboard/actions";
import { getLawyerWeeklyDigest } from "@/server/reports/weekly";

export default async function DashboardPage() {
  const session = await getSession();

  const [kpis, revenueTrend, categoryDistribution, scheduleItems, hero, weekly] =
    await Promise.all([
      getDashboardKpis(),
      getDashboardRevenueTrend(),
      getDashboardCategoryDistribution(),
      getDashboardSchedule(),
      getDashboardHeroData(),
      session?.user
        ? getLawyerWeeklyDigest({
            userId: session.user.id,
            userName: session.user.name ?? "我"
          })
        : Promise.resolve(null)
    ]);

  return (
    <div className="space-y-5 pb-8">
      {/* v0.43：顶部问候区（恢复留白感），下接细分隔线 */}
      <DashboardGreeting
        name={session?.user?.name ?? ""}
        summary={{
          todayDeadlineCount: hero.todayDeadlineCount,
          weekHearingCount: hero.weekHearingCount,
          nearTermCount: hero.nearTermCount
        }}
      />

      <div className="ll-rule" />

      <KpiCards data={kpis} />

      {/* 主区：近期日程（大）+ 待我处理 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ScheduleList data={scheduleItems} />
        </div>
        <div className="lg:col-span-2">
          <AlertsList />
        </div>
      </div>

      {weekly && <MyWeeklyCard digest={weekly} />}

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
