/**
 * 民事案件案由 — V1 样本（基于《民事案件案由规定》2020 修正版）
 * 完整库（约 480 个三级 + 四级）由 Stage 3 通过元典 MCP 抓取入库。
 *
 * code 命名规则：CC-{一级}-{二级}-{三级}
 *   CC-1 → 人格权纠纷
 *   CC-3 → 物权纠纷
 *   CC-4 → 合同纠纷
 *   CC-9 → 婚姻家庭、继承纠纷
 *   ...
 */

export const civilCauses = [
  // —— 一级 ——
  { code: "CC-1",  name: "人格权纠纷",           level: 1 },
  { code: "CC-2",  name: "婚姻家庭、继承纠纷",   level: 1 },
  { code: "CC-3",  name: "物权纠纷",             level: 1 },
  { code: "CC-4",  name: "合同纠纷",             level: 1 },
  { code: "CC-5",  name: "劳动争议纠纷",         level: 1 },
  { code: "CC-6",  name: "知识产权与竞争纠纷",   level: 1 },
  { code: "CC-7",  name: "公司、证券、保险纠纷", level: 1 },
  { code: "CC-8",  name: "侵权责任纠纷",         level: 1 },

  // —— 人格权 ——
  { code: "CC-1-01", name: "名誉权纠纷",       level: 3, parentCode: "CC-1", keywords: ["名誉"] },
  { code: "CC-1-02", name: "隐私权纠纷",       level: 3, parentCode: "CC-1", keywords: ["隐私"] },
  { code: "CC-1-03", name: "肖像权纠纷",       level: 3, parentCode: "CC-1" },

  // —— 婚姻家庭、继承 ——
  { code: "CC-2-01", name: "离婚纠纷",         level: 3, parentCode: "CC-2", shortName: "离婚",  keywords: ["离婚"] },
  { code: "CC-2-02", name: "离婚后财产纠纷",   level: 3, parentCode: "CC-2", keywords: ["离婚后"] },
  { code: "CC-2-03", name: "抚养纠纷",         level: 3, parentCode: "CC-2", keywords: ["抚养"] },
  { code: "CC-2-04", name: "赡养纠纷",         level: 3, parentCode: "CC-2", keywords: ["赡养"] },
  { code: "CC-2-05", name: "法定继承纠纷",     level: 3, parentCode: "CC-2", keywords: ["继承"] },
  { code: "CC-2-06", name: "遗嘱继承纠纷",     level: 3, parentCode: "CC-2", keywords: ["遗嘱"] },

  // —— 物权 ——
  { code: "CC-3-01", name: "物权保护纠纷",     level: 3, parentCode: "CC-3" },
  { code: "CC-3-02", name: "相邻关系纠纷",     level: 3, parentCode: "CC-3", keywords: ["相邻"] },
  { code: "CC-3-03", name: "共有纠纷",         level: 3, parentCode: "CC-3" },
  { code: "CC-3-04", name: "业主撤销权纠纷",   level: 3, parentCode: "CC-3" },

  // —— 合同 ——
  { code: "CC-4-01", name: "买卖合同纠纷",         level: 3, parentCode: "CC-4", shortName: "买卖", keywords: ["买卖"] },
  { code: "CC-4-02", name: "借款合同纠纷",         level: 3, parentCode: "CC-4", keywords: ["借款"] },
  { code: "CC-4-03", name: "民间借贷纠纷",         level: 3, parentCode: "CC-4", shortName: "借贷", keywords: ["民间借贷", "借贷", "借款"] },
  { code: "CC-4-04", name: "建设工程施工合同纠纷", level: 3, parentCode: "CC-4", shortName: "建工", keywords: ["建工", "工程", "施工"] },
  { code: "CC-4-05", name: "房屋租赁合同纠纷",     level: 3, parentCode: "CC-4", shortName: "房屋租赁", keywords: ["房租", "租赁"] },
  { code: "CC-4-06", name: "劳务合同纠纷",         level: 3, parentCode: "CC-4", keywords: ["劳务"] },
  { code: "CC-4-07", name: "服务合同纠纷",         level: 3, parentCode: "CC-4", keywords: ["服务"] },
  { code: "CC-4-08", name: "委托合同纠纷",         level: 3, parentCode: "CC-4", keywords: ["委托"] },
  { code: "CC-4-09", name: "承揽合同纠纷",         level: 3, parentCode: "CC-4", keywords: ["承揽"] },
  { code: "CC-4-10", name: "居间合同纠纷",         level: 3, parentCode: "CC-4", keywords: ["居间"] },
  { code: "CC-4-11", name: "保证合同纠纷",         level: 3, parentCode: "CC-4", keywords: ["担保", "保证"] },
  { code: "CC-4-12", name: "股权转让纠纷",         level: 3, parentCode: "CC-4", keywords: ["股权"] },

  // —— 劳动 ——
  { code: "CC-5-01", name: "劳动合同纠纷",         level: 3, parentCode: "CC-5", keywords: ["劳动", "劳动合同"] },
  { code: "CC-5-02", name: "追索劳动报酬纠纷",     level: 3, parentCode: "CC-5", keywords: ["工资", "报酬"] },

  // —— 公司 ——
  { code: "CC-7-01", name: "股东资格确认纠纷",     level: 3, parentCode: "CC-7", keywords: ["股东"] },
  { code: "CC-7-02", name: "股东出资纠纷",         level: 3, parentCode: "CC-7" },
  { code: "CC-7-03", name: "公司决议纠纷",         level: 3, parentCode: "CC-7" },
  { code: "CC-7-04", name: "股东损害公司债权人利益责任纠纷", level: 3, parentCode: "CC-7" },

  // —— 侵权 ——
  { code: "CC-8-01", name: "机动车交通事故责任纠纷", level: 3, parentCode: "CC-8", shortName: "交通事故", keywords: ["交通", "车祸"] },
  { code: "CC-8-02", name: "提供劳务者受害责任纠纷", level: 3, parentCode: "CC-8" },
  { code: "CC-8-03", name: "产品责任纠纷",         level: 3, parentCode: "CC-8" },
  { code: "CC-8-04", name: "医疗损害责任纠纷",     level: 3, parentCode: "CC-8", keywords: ["医疗"] },
  { code: "CC-8-05", name: "网络侵权责任纠纷",     level: 3, parentCode: "CC-8" }
];
