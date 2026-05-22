/**
 * 枚举展示中文映射。前端用这里的 label，DB/API 用枚举值。
 */
import type {
  ClientType,
  MatterCategory,
  MatterStatus,
  IntakeStatus,
  UserRole,
  ProcedureType,
  LitigationStanding
} from "@prisma/client";

export const clientTypeLabel: Record<ClientType, string> = {
  INDIVIDUAL: "自然人",
  COMPANY: "公司",
  ORGANIZATION: "其他组织"
};

export const matterCategoryLabel: Record<MatterCategory, string> = {
  CIVIL_COMMERCIAL: "民商事",
  CRIMINAL: "刑事",
  ADMINISTRATIVE: "行政",
  NON_LITIGATION: "非诉",
  LEGAL_COUNSEL: "顾问",
  SPECIAL_PROJECT: "专项"
};

export const matterCategoryColor: Record<MatterCategory, string> = {
  CIVIL_COMMERCIAL: "#5B8DEF",
  CRIMINAL: "#FB923C",
  ADMINISTRATIVE: "#FBBF24",
  NON_LITIGATION: "#4FD1C5",
  LEGAL_COUNSEL: "#9B7BF7",
  SPECIAL_PROJECT: "#60A5FA"
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
  DECLINED: "不接案"
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
  DEFENDANT: "被告",
  THIRD_PARTY: "第三人",
  CRIMINAL_DEFENDANT: "刑事被告人",
  CRIMINAL_VICTIM: "被害人",
  PRIVATE_PROSECUTOR: "自诉人",
  CRIMINAL_INCIDENTAL_PLAINTIFF: "刑事附带民事原告",
  ARBITRATION_CLAIMANT: "仲裁申请人",
  ARBITRATION_RESPONDENT: "仲裁被申请人",
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
  COMMERCIAL_ARBITRATION: "民商事仲裁",
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
