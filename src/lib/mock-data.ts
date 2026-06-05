/**
 * 工作台 mock 数据。Stage 1 用来打磨 UI，Stage 2 替换为 Prisma 查询。
 */

export type TrendDirection = "up" | "down" | "warn";

export type KpiItem = {
  key: string;
  label: string;
  value: number;
  valueFormat?: "currency";
  trend: { direction: TrendDirection; text: string };
  sparkline: number[];
};

export const dashboardKpis: KpiItem[] = [
  {
    key: "in_progress",
    label: "办理中案件",
    value: 18,
    trend: { direction: "up", text: "+3 本周" },
    sparkline: [12, 14, 13, 15, 16, 16, 17, 17, 18, 18, 17, 18, 18, 18]
  },
  {
    key: "pending",
    label: "待确认收案",
    value: 5,
    trend: { direction: "warn", text: "2 待处理" },
    sparkline: [2, 3, 3, 4, 4, 3, 5, 5, 4, 5, 5, 5, 5, 5]
  },
  {
    key: "deadline",
    label: "近 7 天期限",
    value: 7,
    trend: { direction: "warn", text: "2 临近" },
    sparkline: [4, 5, 5, 6, 5, 6, 6, 7, 7, 8, 7, 7, 7, 7]
  },
  {
    key: "received",
    label: "本月实收",
    value: 286000,
    valueFormat: "currency",
    trend: { direction: "up", text: "+12%" },
    sparkline: [180, 220, 240, 200, 260, 280, 270, 290, 280, 286, 286, 286, 286, 286]
  }
];

export const todayFocus = {
  title: "举证截止",
  matter: "青石建设诉华东置业",
  internalCode: "LL-2026-CC-0015",
  daysLeft: 3,
  href: "/matters/m-0015"
};

export type ScheduleItem = {
  id: string;
  date: string;
  weekday: string;
  time?: string;
  type: "deadline" | "hearing";
  title: string;
  matter: string;
  procedure?: string;
};

export const scheduleItems: ScheduleItem[] = [
  {
    id: "s1",
    date: "5月 25",
    weekday: "周一",
    time: "14:00",
    type: "deadline",
    title: "举证截止",
    matter: "青石建设诉华东置业",
    procedure: "一审"
  },
  {
    id: "s2",
    date: "5月 28",
    weekday: "周四",
    time: "09:30",
    type: "hearing",
    title: "开庭 · 第一次",
    matter: "劳动争议仲裁后一审"
  },
  {
    id: "s3",
    date: "5月 28",
    weekday: "周四",
    time: "18:00",
    type: "deadline",
    title: "归档材料截止",
    matter: "林某劳动争议"
  },
  {
    id: "s4",
    date: "5月 30",
    weekday: "周六",
    time: "23:59",
    type: "deadline",
    title: "上诉期限",
    matter: "明远科技股权转让"
  }
];

export type TodoItem = {
  id: string;
  severity: "blocking" | "urgent" | "normal";
  title: string;
  detail: string;
  href: string;
};

export const todoItems: TodoItem[] = [
  {
    id: "t1",
    severity: "blocking",
    title: "冲突命中 BLOCKING，待结论",
    detail: "Intake I-2026-001",
    href: "/intakes/I-2026-001"
  },
  {
    id: "t2",
    severity: "urgent",
    title: "拟答辩状（已逾期 1 天）",
    detail: "LL-2026-CC-0015",
    href: "/matters/m-0015"
  },
  {
    id: "t3",
    severity: "normal",
    title: "审阅交易文件第二稿",
    detail: "LL-2026-NL-0011",
    href: "/matters/m-0011"
  },
  {
    id: "t4",
    severity: "normal",
    title: "电话回访客户",
    detail: "LL-2026-CC-0006",
    href: "/matters/m-0006"
  }
];

export const revenueTrend = [
  { month: "12月", received: 180, receivable: 220 },
  { month: "1月", received: 220, receivable: 260 },
  { month: "2月", received: 240, receivable: 280 },
  { month: "3月", received: 200, receivable: 240 },
  { month: "4月", received: 260, receivable: 300 },
  { month: "5月", received: 286, receivable: 320 }
];

export const categoryDistribution = [
  { name: "民商事", value: 18, code: "CC", color: "#5B8DEF" },
  { name: "非诉", value: 12, code: "NL", color: "#4FD1C5" },
  { name: "顾问", value: 8, code: "GC", color: "#9B7BF7" },
  { name: "刑事", value: 2, code: "CR", color: "#FB923C" },
  { name: "行政", value: 1, code: "AD", color: "#FBBF24" },
  { name: "专项", value: 1, code: "SP", color: "#60A5FA" }
];
