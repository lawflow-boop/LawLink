/**
 * 行政案件案由 — V1 样本（基于最高法《关于行政案件案由的暂行规定》2021）
 * 完整库由 Stage 3 通过元典 MCP 抓取入库。
 *
 * 行政案由按"行政行为种类"组织，code: AD-{大类}-{细类}
 */

export const administrativeCauses = [
  // —— 一级（行政行为种类）——
  { code: "AD-1", name: "行政许可类",       level: 1 },
  { code: "AD-2", name: "行政处罚类",       level: 1 },
  { code: "AD-3", name: "行政强制类",       level: 1 },
  { code: "AD-4", name: "行政征收征用类",   level: 1 },
  { code: "AD-5", name: "行政给付类",       level: 1 },
  { code: "AD-6", name: "行政登记类",       level: 1 },
  { code: "AD-7", name: "行政复议",         level: 1 },
  { code: "AD-8", name: "政府信息公开",     level: 1 },
  { code: "AD-9", name: "行政协议",         level: 1 },
  { code: "AD-A", name: "行政赔偿",         level: 1 },
  { code: "AD-B", name: "行政公益诉讼",     level: 1 },
  { code: "AD-C", name: "其他行政行为",     level: 1 },

  // —— 行政处罚（最常见）——
  { code: "AD-2-01", name: "治安管理处罚",         level: 3, parentCode: "AD-2", shortName: "治安处罚", keywords: ["治安"] },
  { code: "AD-2-02", name: "市场监督管理处罚",     level: 3, parentCode: "AD-2", keywords: ["市监"] },
  { code: "AD-2-03", name: "交通行政处罚",         level: 3, parentCode: "AD-2", keywords: ["交警"] },
  { code: "AD-2-04", name: "税务行政处罚",         level: 3, parentCode: "AD-2", keywords: ["税务"] },
  { code: "AD-2-05", name: "环境保护行政处罚",     level: 3, parentCode: "AD-2" },
  { code: "AD-2-06", name: "城建行政处罚",         level: 3, parentCode: "AD-2", keywords: ["违建"] },

  // —— 行政强制 ——
  { code: "AD-3-01", name: "行政强制措施",         level: 3, parentCode: "AD-3" },
  { code: "AD-3-02", name: "行政强制执行",         level: 3, parentCode: "AD-3" },

  // —— 行政征收征用 ——
  { code: "AD-4-01", name: "房屋征收补偿决定",     level: 3, parentCode: "AD-4", shortName: "房屋征收", keywords: ["征收", "拆迁"] },
  { code: "AD-4-02", name: "土地征收决定",         level: 3, parentCode: "AD-4", keywords: ["土地征收"] },
  { code: "AD-4-03", name: "行政征用",             level: 3, parentCode: "AD-4" },

  // —— 行政许可 ——
  { code: "AD-1-01", name: "颁发行政许可",         level: 3, parentCode: "AD-1" },
  { code: "AD-1-02", name: "不予颁发行政许可",     level: 3, parentCode: "AD-1" },
  { code: "AD-1-03", name: "撤销行政许可",         level: 3, parentCode: "AD-1" },

  // —— 行政给付 ——
  { code: "AD-5-01", name: "工伤认定",             level: 3, parentCode: "AD-5", keywords: ["工伤"] },
  { code: "AD-5-02", name: "社会保险待遇",         level: 3, parentCode: "AD-5", keywords: ["社保"] },
  { code: "AD-5-03", name: "最低生活保障",         level: 3, parentCode: "AD-5", keywords: ["低保"] },

  // —— 行政登记 ——
  { code: "AD-6-01", name: "不动产登记",           level: 3, parentCode: "AD-6", keywords: ["不动产", "房产证"] },
  { code: "AD-6-02", name: "婚姻登记",             level: 3, parentCode: "AD-6" },
  { code: "AD-6-03", name: "户籍登记",             level: 3, parentCode: "AD-6", keywords: ["户籍"] },
  { code: "AD-6-04", name: "公司登记",             level: 3, parentCode: "AD-6" },

  // —— 政府信息公开 ——
  { code: "AD-8-01", name: "政府信息公开答复",     level: 3, parentCode: "AD-8", keywords: ["信息公开"] },

  // —— 行政协议 ——
  { code: "AD-9-01", name: "国有土地使用权出让合同", level: 3, parentCode: "AD-9" },
  { code: "AD-9-02", name: "政府特许经营协议",       level: 3, parentCode: "AD-9" },

  // —— 行政赔偿 ——
  { code: "AD-A-01", name: "行政赔偿决定",         level: 3, parentCode: "AD-A" },
  { code: "AD-A-02", name: "国家赔偿",             level: 3, parentCode: "AD-A", keywords: ["国家赔偿"] },

  // —— 其他 ——
  { code: "AD-C-01", name: "行政不作为",           level: 3, parentCode: "AD-C", keywords: ["不作为"] },
  { code: "AD-C-02", name: "责令限期改正",         level: 3, parentCode: "AD-C" }
];
