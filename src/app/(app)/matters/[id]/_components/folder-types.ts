/**
 * 卷宗 / 模板相关的共享类型（v0.8）
 */

export type FolderPayload = {
  id: string;
  name: string;
  orderIndex: number;
  isDefault: boolean;
};

export type FolderDocument = {
  id: string;
  name: string;
  size: number | null;
  folderId: string | null;
  templateId: string | null;
  createdAt: Date;
};

export type TemplateSummary = {
  id: string;
  name: string;
  category:
    | "INTAKE"
    | "RETAINER"
    | "LITIGATION"
    | "HEARING"
    | "WORK_PRODUCT"
    | "ARCHIVE"
    | "CLOSING"
    | "BLANK";
  description: string | null;
  applicableCategories: string[];
  variables: string[];
  isBuiltIn: boolean;
};

export const TEMPLATE_CATEGORY_CN: Record<TemplateSummary["category"], string> = {
  INTAKE: "收案文书",
  RETAINER: "委托文书",
  LITIGATION: "诉讼文书",
  HEARING: "庭审文书",
  WORK_PRODUCT: "工作成果",
  ARCHIVE: "卷宗文书",
  CLOSING: "结案文书",
  BLANK: "空白文档"
};

export const VARIABLE_LABEL_CN: Record<string, string> = {
  "firm.name": "律所名称",
  "firm.address": "律所地址",
  "firm.phone": "律所电话",
  "lawyer.name": "主办律师",
  "lawyer.phone": "律师电话",
  "matter.code": "案件编号",
  "matter.title": "案件名称",
  "matter.causeText": "案由",
  "matter.intakeDate": "收案日期",
  "matter.claimAmount": "涉案标的",
  "matter.ourStanding": "我方诉讼地位",
  "client.name": "委托人姓名",
  "client.idNumber": "委托人证件号",
  "client.address": "委托人住址",
  "client.phone": "委托人电话",
  "opposing.name": "对方姓名",
  "opposing.idNumber": "对方证件号",
  "opposing.address": "对方住址",
  "opposing.phone": "对方电话",
  "proceeding.court": "受理法院",
  "proceeding.caseNo": "案号",
  "todayCN": "生成日期"
};
