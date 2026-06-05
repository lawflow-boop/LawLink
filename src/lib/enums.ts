/**
 * 枚举展示中文映射。前端用这里的 label，DB/API 用枚举值。
 */
import type {
  ClientType,
  ClientCooperationStatus,
  ClientGender,
  MatterCategory,
  MatterStatus,
  IntakeStatus,
  UserRole,
  ProcedureType,
  LitigationStanding,
  FeeType,
  InvoiceRequestStatus,
  PartyType,
  BarFilingType
} from "@prisma/client";

export const clientTypeLabel: Record<ClientType, string> = {
  INDIVIDUAL: "自然人",
  COMPANY: "公司",
  ORGANIZATION: "其他组织"
};

// v0.39: 客户合作状态
export const cooperationStatusLabel: Record<ClientCooperationStatus, string> = {
  POTENTIAL: "潜在",
  NEGOTIATING: "洽谈中",
  SIGNED: "已签约",
  TERMINATED: "已终止"
};

export const COOPERATION_STATUS_OPTIONS: ClientCooperationStatus[] = [
  "POTENTIAL",
  "NEGOTIATING",
  "SIGNED",
  "TERMINATED"
];

// v0.39: 客户性别（个人客户）
export const genderLabel: Record<ClientGender, string> = {
  MALE: "男",
  FEMALE: "女"
};

export const GENDER_OPTIONS: ClientGender[] = ["MALE", "FEMALE"];

// v0.30: 当事人主体类型。自然人填身份证号，其余主体填统一社会信用代码。
export const partyTypeLabel: Record<PartyType, string> = {
  NATURAL_PERSON: "自然人",
  COMPANY: "公司",
  PARTNERSHIP: "合伙企业",
  INDIVIDUAL_BUSINESS: "个体工商户",
  INSTITUTION: "事业单位",
  SOCIAL_ORG: "社会组织",
  GOVERNMENT: "政府机关",
  OTHER_ORG: "其他组织",
  ORGANIZATION: "其他组织" // 旧数据兼容
};

// 录入下拉的主体类型顺序（不含旧的 ORGANIZATION）
export const PARTY_TYPE_OPTIONS: PartyType[] = [
  "NATURAL_PERSON",
  "COMPANY",
  "PARTNERSHIP",
  "INDIVIDUAL_BUSINESS",
  "INSTITUTION",
  "SOCIAL_ORG",
  "GOVERNMENT",
  "OTHER_ORG"
];

// v0.30: 需向律协备案与否
export const barFilingLabel: Record<BarFilingType, string> = {
  NONE: "否",
  COLLECTIVE: "需要，涉集体案件",
  SENSITIVE: "需要，涉敏感案件",
  MAJOR: "需要，涉重大案件",
  OTHER: "需要，其他特殊案件"
};

export const BAR_FILING_OPTIONS: BarFilingType[] = [
  "NONE",
  "COLLECTIVE",
  "SENSITIVE",
  "MAJOR",
  "OTHER"
];

// v0.31: 案件类别按业务性质分三类——决定收案表单结构
// litigation 诉讼/仲裁（民商事/刑事/行政）；project 非诉/专项；counsel 顾问
export type CategoryKind = "litigation" | "project" | "counsel";

export function matterCategoryKind(c: MatterCategory): CategoryKind {
  if (c === "LEGAL_COUNSEL") return "counsel";
  if (c === "NON_LITIGATION" || c === "SPECIAL_PROJECT") return "project";
  // 民商诉讼 / 劳动仲裁 / 商事仲裁 / 刑事 / 行政 → 诉讼/仲裁类
  return "litigation";
}

// 非诉 / 专项 业务类型（可微调）
export const PROJECT_BUSINESS_TYPES: string[] = [
  "尽职调查",
  "合同审查 / 起草",
  "投融资",
  "并购重组",
  "改制上市",
  "破产清算",
  "知识产权",
  "合规体系",
  "招投标",
  "行政许可 / 审批",
  "其他"
];

// 顾问类型
export const COUNSEL_TYPES: string[] = ["常年法律顾问", "专项法律顾问"];

export const matterCategoryLabel: Record<MatterCategory, string> = {
  CIVIL_COMMERCIAL: "民商诉讼",
  LABOR_ARBITRATION: "劳动仲裁",
  COMMERCIAL_ARBITRATION: "商事仲裁",
  CRIMINAL: "刑事诉讼",
  ADMINISTRATIVE: "行政诉讼",
  NON_LITIGATION: "非诉项目",
  LEGAL_COUNSEL: "常年顾问",
  SPECIAL_PROJECT: "法律专项"
};

export const matterCategoryColor: Record<MatterCategory, string> = {
  CIVIL_COMMERCIAL: "#5B8DEF",
  LABOR_ARBITRATION: "#34D399",
  COMMERCIAL_ARBITRATION: "#38BDF8",
  CRIMINAL: "#FB923C",
  ADMINISTRATIVE: "#FBBF24",
  NON_LITIGATION: "#4FD1C5",
  LEGAL_COUNSEL: "#9B7BF7",
  SPECIAL_PROJECT: "#60A5FA"
};

// v0.17: 案件类别单字图标（用于列表卡片标题前）
export const matterCategoryShort: Record<MatterCategory, string> = {
  CIVIL_COMMERCIAL: "民",
  LABOR_ARBITRATION: "劳",
  COMMERCIAL_ARBITRATION: "商",
  CRIMINAL: "刑",
  ADMINISTRATIVE: "行",
  NON_LITIGATION: "非",
  LEGAL_COUNSEL: "顾",
  SPECIAL_PROJECT: "专"
};

export const matterStatusLabel: Record<MatterStatus, string> = {
  PENDING_ACCEPTANCE: "待启动",
  IN_PROGRESS: "办理中",
  ON_HOLD: "暂停",
  CLOSED: "已结案",
  ARCHIVED: "已归档"
};

export const intakeStatusLabel: Record<IntakeStatus, string> = {
  INTAKE: "已咨询",
  PENDING_CONFIRMATION: "待确认",
  CONVERTED: "已转化",
  DECLINED: "不接案",
  NEEDS_REVISION: "待补正"
};

export const userRoleLabel: Record<UserRole, string> = {
  ADMIN: "系统管理员",
  PRINCIPAL_LAWYER: "主办律师",
  LAWYER: "经办律师",
  ASSISTANT: "助理",
  FINANCE: "财务"
};

export const litigationStandingLabel: Record<LitigationStanding, string> = {
  PLAINTIFF: "原告",
  JOINT_PLAINTIFF: "共同原告",
  DEFENDANT: "被告",
  JOINT_DEFENDANT: "共同被告",
  THIRD_PARTY: "第三人",
  COUNTERCLAIM_PLAINTIFF: "反诉原告",
  COUNTERCLAIM_DEFENDANT: "反诉被告",
  APPELLANT: "上诉人",
  APPELLEE: "被上诉人",
  RETRIAL_APPLICANT: "再审申请人",
  RETRIAL_RESPONDENT: "再审被申请人",
  ENFORCEMENT_APPLICANT: "申请执行人",
  EXECUTED_PERSON: "被执行人",
  CRIMINAL_DEFENDANT: "刑事被告人",
  CRIMINAL_VICTIM: "被害人",
  PRIVATE_PROSECUTOR: "自诉人",
  CRIMINAL_INCIDENTAL_PLAINTIFF: "刑事附带民事原告",
  ARBITRATION_CLAIMANT: "仲裁申请人",
  ARBITRATION_RESPONDENT: "仲裁被申请人",
  ADMIN_PLAINTIFF: "行政原告",
  ADMIN_DEFENDANT: "行政被告",
  ADMIN_RECONSIDERATION_APPLICANT: "复议申请人",
  ADMIN_RECONSIDERATION_RESPONDENT: "复议被申请人",
  NON_LITIGATION_PARTY: "项目当事人"
};

export const procedureTypeLabel: Record<ProcedureType, string> = {
  FIRST_INSTANCE: "一审",
  SECOND_INSTANCE: "二审",
  RETRIAL_REVIEW: "再审审查",
  RETRIAL: "再审",
  REMAND_FIRST: "重审一审",
  REMAND_SECOND: "重审二审",
  PROSECUTORIAL_SUPERVISION: "检察监督",
  COMMERCIAL_ARBITRATION: "商事仲裁",
  LABOR_ARBITRATION: "劳动仲裁",
  ARBITRATION_SET_ASIDE: "撤销仲裁裁决",
  ARBITRATION_ENFORCEMENT_REVIEW: "不予执行仲裁审查",
  ENFORCEMENT: "强制执行",
  ENFORCEMENT_OBJECTION: "执行异议",
  INVESTIGATION: "侦查",
  PROSECUTION_REVIEW: "审查起诉",
  DEATH_PENALTY_REVIEW: "死刑复核",
  CRIMINAL_ENFORCEMENT: "刑罚执行",
  COMMUTATION_PAROLE_REVIEW: "减刑假释审查",
  ADMIN_RECONSIDERATION: "行政复议",
  ADMIN_NON_LITIGATION_ENFORCEMENT: "非诉行政执行",
  NON_LITIGATION_PHASE: "非诉阶段",
  CUSTOM: "自定义"
};

export const feeTypeLabel: Record<FeeType, string> = {
  FIXED: "固定收费",
  CONTINGENCY: "风险代理",
  TIMED: "计时收费"
};

export const invoiceRequestStatusLabel: Record<InvoiceRequestStatus, string> = {
  PENDING: "待财务处理",
  APPROVED: "已批准",
  ISSUED: "已开具",
  REJECTED: "已驳回"
};

export const invoiceRequestStatusColor: Record<InvoiceRequestStatus, string> = {
  PENDING: "#FBBF24",
  APPROVED: "#5B8DEF",
  ISSUED: "#4ADE80",
  REJECTED: "#F87171"
};

/**
 * 按程序类型 + 立场（我方 or 对方）返回可选诉讼地位枚举。
 * 用于收案表单 / 案件详情中的当事人录入联动。
 */
export function procedureToStandingOptions(
  proc: ProcedureType | null | undefined,
  side: "ours" | "opposite"
): LitigationStanding[] {
  if (!proc) return Object.keys(litigationStandingLabel) as LitigationStanding[];

  switch (proc) {
    case "FIRST_INSTANCE":
    case "REMAND_FIRST":
      return side === "ours"
        ? ["PLAINTIFF", "DEFENDANT", "THIRD_PARTY", "COUNTERCLAIM_PLAINTIFF", "COUNTERCLAIM_DEFENDANT"]
        : ["PLAINTIFF", "DEFENDANT", "THIRD_PARTY", "COUNTERCLAIM_PLAINTIFF", "COUNTERCLAIM_DEFENDANT"];

    case "SECOND_INSTANCE":
    case "REMAND_SECOND":
      return ["APPELLANT", "APPELLEE", "THIRD_PARTY"];

    case "RETRIAL_REVIEW":
    case "RETRIAL":
      return ["RETRIAL_APPLICANT", "RETRIAL_RESPONDENT", "THIRD_PARTY"];

    case "PROSECUTORIAL_SUPERVISION":
      return ["RETRIAL_APPLICANT", "RETRIAL_RESPONDENT", "THIRD_PARTY"];

    case "COMMERCIAL_ARBITRATION":
    case "LABOR_ARBITRATION":
      return ["ARBITRATION_CLAIMANT", "ARBITRATION_RESPONDENT", "THIRD_PARTY"];

    case "ARBITRATION_SET_ASIDE":
    case "ARBITRATION_ENFORCEMENT_REVIEW":
      return ["ARBITRATION_CLAIMANT", "ARBITRATION_RESPONDENT"];

    case "ENFORCEMENT":
    case "ENFORCEMENT_OBJECTION":
      return ["ENFORCEMENT_APPLICANT", "EXECUTED_PERSON", "THIRD_PARTY"];

    case "INVESTIGATION":
    case "PROSECUTION_REVIEW":
    case "DEATH_PENALTY_REVIEW":
    case "CRIMINAL_ENFORCEMENT":
    case "COMMUTATION_PAROLE_REVIEW":
      return [
        "CRIMINAL_DEFENDANT",
        "CRIMINAL_VICTIM",
        "PRIVATE_PROSECUTOR",
        "CRIMINAL_INCIDENTAL_PLAINTIFF"
      ];

    case "ADMIN_RECONSIDERATION":
      return ["ADMIN_RECONSIDERATION_APPLICANT", "ADMIN_RECONSIDERATION_RESPONDENT", "THIRD_PARTY"];

    case "ADMIN_NON_LITIGATION_ENFORCEMENT":
      return ["ADMIN_PLAINTIFF", "ADMIN_DEFENDANT", "EXECUTED_PERSON"];

    case "NON_LITIGATION_PHASE":
    case "CUSTOM":
      return ["NON_LITIGATION_PARTY"];

    default:
      return Object.keys(litigationStandingLabel) as LitigationStanding[];
  }
}
