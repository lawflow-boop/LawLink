/**
 * 刑事案由 — V1 样本（基于刑法分则 + 最高法《关于执行刑法确定罪名的补充规定》）
 * 完整罪名库（约 469 个）由 Stage 3 通过元典 MCP 抓取入库。
 *
 * code 命名规则：CR-{章序}-{节序}-{罪名序}
 *   CR-1 危害国家安全罪
 *   CR-2 危害公共安全罪
 *   CR-3 破坏社会主义市场经济秩序罪
 *   CR-4 侵犯人身权利、民主权利罪
 *   CR-5 侵犯财产罪
 *   CR-6 妨害社会管理秩序罪
 *   CR-7 危害国防利益罪
 *   CR-8 贪污贿赂罪
 *   CR-9 渎职罪
 *   CR-10 军人违反职责罪
 */

export const criminalCauses = [
  // —— 一级 ——
  { code: "CR-2",  name: "危害公共安全罪",                   level: 1 },
  { code: "CR-3",  name: "破坏社会主义市场经济秩序罪",       level: 1 },
  { code: "CR-4",  name: "侵犯公民人身权利、民主权利罪",     level: 1 },
  { code: "CR-5",  name: "侵犯财产罪",                       level: 1 },
  { code: "CR-6",  name: "妨害社会管理秩序罪",               level: 1 },
  { code: "CR-8",  name: "贪污贿赂罪",                       level: 1 },
  { code: "CR-9",  name: "渎职罪",                           level: 1 },

  // —— 危害公共安全 ——
  { code: "CR-2-01", name: "交通肇事罪",   level: 3, parentCode: "CR-2", keywords: ["交通", "肇事"] },
  { code: "CR-2-02", name: "危险驾驶罪",   level: 3, parentCode: "CR-2", keywords: ["醉驾", "酒驾", "飙车"] },
  { code: "CR-2-03", name: "失火罪",       level: 3, parentCode: "CR-2" },
  { code: "CR-2-04", name: "放火罪",       level: 3, parentCode: "CR-2" },

  // —— 破坏市场经济秩序 ——
  { code: "CR-3-01", name: "生产、销售伪劣产品罪",         level: 3, parentCode: "CR-3" },
  { code: "CR-3-02", name: "走私普通货物、物品罪",         level: 3, parentCode: "CR-3", keywords: ["走私"] },
  { code: "CR-3-03", name: "虚开增值税专用发票罪",         level: 3, parentCode: "CR-3", shortName: "虚开发票", keywords: ["虚开"] },
  { code: "CR-3-04", name: "非法吸收公众存款罪",           level: 3, parentCode: "CR-3", shortName: "非吸",     keywords: ["非吸", "吸存"] },
  { code: "CR-3-05", name: "集资诈骗罪",                   level: 3, parentCode: "CR-3", keywords: ["集资"] },
  { code: "CR-3-06", name: "合同诈骗罪",                   level: 3, parentCode: "CR-3", keywords: ["合同诈骗"] },
  { code: "CR-3-07", name: "职务侵占罪",                   level: 3, parentCode: "CR-3", keywords: ["职务"] },
  { code: "CR-3-08", name: "挪用资金罪",                   level: 3, parentCode: "CR-3", keywords: ["挪用"] },
  { code: "CR-3-09", name: "非国家工作人员受贿罪",         level: 3, parentCode: "CR-3" },
  { code: "CR-3-10", name: "组织、领导传销活动罪",         level: 3, parentCode: "CR-3", keywords: ["传销"] },

  // —— 侵犯人身权利 ——
  { code: "CR-4-01", name: "故意杀人罪",       level: 3, parentCode: "CR-4" },
  { code: "CR-4-02", name: "故意伤害罪",       level: 3, parentCode: "CR-4", keywords: ["伤害"] },
  { code: "CR-4-03", name: "过失致人死亡罪",   level: 3, parentCode: "CR-4" },
  { code: "CR-4-04", name: "强奸罪",           level: 3, parentCode: "CR-4" },
  { code: "CR-4-05", name: "非法拘禁罪",       level: 3, parentCode: "CR-4" },
  { code: "CR-4-06", name: "绑架罪",           level: 3, parentCode: "CR-4" },
  { code: "CR-4-07", name: "诽谤罪",           level: 3, parentCode: "CR-4" },

  // —— 侵犯财产 ——
  { code: "CR-5-01", name: "抢劫罪",       level: 3, parentCode: "CR-5", keywords: ["抢劫"] },
  { code: "CR-5-02", name: "盗窃罪",       level: 3, parentCode: "CR-5", keywords: ["盗窃", "偷"] },
  { code: "CR-5-03", name: "诈骗罪",       level: 3, parentCode: "CR-5", keywords: ["诈骗"] },
  { code: "CR-5-04", name: "抢夺罪",       level: 3, parentCode: "CR-5" },
  { code: "CR-5-05", name: "敲诈勒索罪",   level: 3, parentCode: "CR-5", keywords: ["敲诈", "勒索"] },
  { code: "CR-5-06", name: "侵占罪",       level: 3, parentCode: "CR-5" },

  // —— 妨害社会管理秩序 ——
  { code: "CR-6-01", name: "妨害公务罪",                       level: 3, parentCode: "CR-6" },
  { code: "CR-6-02", name: "寻衅滋事罪",                       level: 3, parentCode: "CR-6", keywords: ["寻衅"] },
  { code: "CR-6-03", name: "聚众斗殴罪",                       level: 3, parentCode: "CR-6", keywords: ["斗殴"] },
  { code: "CR-6-04", name: "走私、贩卖、运输、制造毒品罪",     level: 3, parentCode: "CR-6", shortName: "毒品犯罪", keywords: ["毒品", "贩毒"] },

  // —— 贪污贿赂 ——
  { code: "CR-8-01", name: "贪污罪",       level: 3, parentCode: "CR-8" },
  { code: "CR-8-02", name: "受贿罪",       level: 3, parentCode: "CR-8", keywords: ["受贿"] },
  { code: "CR-8-03", name: "行贿罪",       level: 3, parentCode: "CR-8", keywords: ["行贿"] },
  { code: "CR-8-04", name: "挪用公款罪",   level: 3, parentCode: "CR-8" },

  // —— 渎职 ——
  { code: "CR-9-01", name: "滥用职权罪",   level: 3, parentCode: "CR-9", keywords: ["滥用"] },
  { code: "CR-9-02", name: "玩忽职守罪",   level: 3, parentCode: "CR-9" }
];
