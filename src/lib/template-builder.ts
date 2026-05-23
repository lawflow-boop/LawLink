/**
 * v0.8 内置 8 个开源模板的 docx 文件动态生成（首批 ★ 模板）
 *
 * 用 docx 库构造 docx Buffer，docxtemplater 占位符使用 {{var}} 语法。
 * 律所部署后可在 /settings/templates 上传自定义模板替换。
 *
 * 8 个：
 *   1. 民事案件收案登记表
 *   2. 刑事案件收案登记表
 *   3. 法律服务风险告知书
 *   4. 委托代理合同（个人）
 *   5. 委托代理合同（单位）
 *   6. 授权委托书（个人）
 *   7. 民事起诉状
 *   8. 民事答辩状
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  HeadingLevel,
  WidthType,
  BorderStyle,
  PageNumber,
  PageOrientation,
  type ISectionOptions
} from "docx";
import type { MatterCategory, TemplateCategory } from "@prisma/client";

export interface BuiltInTemplateMeta {
  key: string; // 唯一稳定 key（seed 用 upsert）
  name: string;
  category: TemplateCategory;
  description: string;
  applicableCategories: MatterCategory[];
  variables: string[];
}

export interface BuiltInTemplate extends BuiltInTemplateMeta {
  buildBuffer: () => Promise<Buffer>;
}

// ============================================================
// 辅助
// ============================================================
const FONT_TITLE = "SimHei";
const FONT_BODY = "FangSong";

function title(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 120, after: 240 },
    children: [
      new TextRun({ text, font: FONT_TITLE, size: 40, bold: true })
    ]
  });
}

function subtitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 200 },
    children: [new TextRun({ text, font: FONT_TITLE, size: 28, bold: true })]
  });
}

function body(text: string, opts?: { indent?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean }): Paragraph {
  return new Paragraph({
    alignment: opts?.align ?? AlignmentType.LEFT,
    spacing: { before: 60, after: 60, line: 360 },
    indent: opts?.indent ? { firstLine: 480 } : undefined,
    children: [new TextRun({ text, font: FONT_BODY, size: 24, bold: opts?.bold })]
  });
}

function blank(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: 60, after: 60 } });
}

function kvRow(k: string, v: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 25, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: k, font: FONT_BODY, size: 22, bold: true })]
          })
        ]
      }),
      new TableCell({
        width: { size: 75, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            children: [new TextRun({ text: v, font: FONT_BODY, size: 22 })]
          })
        ]
      })
    ]
  });
}

function kvTable(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "BBBBBB" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "BBBBBB" }
    },
    rows: rows.map(([k, v]) => kvRow(k, v))
  });
}

function sectionDefaults(children: (Paragraph | Table)[]): ISectionOptions {
  return {
    properties: {
      page: {
        size: { orientation: PageOrientation.PORTRAIT },
        margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } // 2cm
      }
    },
    headers: undefined,
    footers: {
      default: undefined
    },
    children: [
      ...children,
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
        children: [
          new TextRun({ text: "— ", font: FONT_BODY, size: 18, color: "999999" }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT_BODY, size: 18, color: "999999" }),
          new TextRun({ text: " —", font: FONT_BODY, size: 18, color: "999999" })
        ]
      })
    ]
  };
}

async function pack(children: (Paragraph | Table)[]): Promise<Buffer> {
  const doc = new Document({
    creator: "LawLink",
    title: "LawLink 模板",
    sections: [sectionDefaults(children)]
  });
  return Packer.toBuffer(doc);
}

// ============================================================
// 模板 1: 民事案件收案登记表
// ============================================================
const T1_VARS = [
  "firm.name",
  "matter.code",
  "matter.intakeDate",
  "matter.causeText",
  "matter.claimAmount",
  "client.name",
  "client.address",
  "client.phone",
  "opposing.name",
  "opposing.address",
  "proceeding.court",
  "lawyer.name",
  "todayCN"
];

async function buildT1(): Promise<Buffer> {
  return pack([
    body("{{firm.name}}", { align: AlignmentType.CENTER, bold: true }),
    title("民事案件收案登记表"),
    body("案件编号：{{matter.code}}", { align: AlignmentType.RIGHT }),
    blank(),
    kvTable([
      ["收案日期", "{{matter.intakeDate}}"],
      ["案由", "{{matter.causeText}}"],
      ["案件类型", "民事案件"],
      ["委托人", "{{client.name}}"],
      ["委托人住址", "{{client.address}}"],
      ["联系电话", "{{client.phone}}"],
      ["对方当事人", "{{opposing.name}}"],
      ["对方住址", "{{opposing.address}}"],
      ["受理法院", "{{proceeding.court}}"],
      ["涉案标的", "{{matter.claimAmount}}"],
      ["主办律师", "{{lawyer.name}}"]
    ]),
    blank(),
    body("登记日期：{{todayCN}}", { align: AlignmentType.RIGHT })
  ]);
}

// ============================================================
// 模板 2: 刑事案件收案登记表
// ============================================================
const T2_VARS = [
  "firm.name",
  "matter.code",
  "matter.intakeDate",
  "matter.causeText",
  "client.name",
  "client.phone",
  "opposing.name",
  "opposing.address",
  "lawyer.name",
  "todayCN"
];

async function buildT2(): Promise<Buffer> {
  return pack([
    body("{{firm.name}}", { align: AlignmentType.CENTER, bold: true }),
    title("刑事案件收案登记表"),
    body("案件编号：{{matter.code}}", { align: AlignmentType.RIGHT }),
    blank(),
    kvTable([
      ["收案日期", "{{matter.intakeDate}}"],
      ["涉嫌罪名", "{{matter.causeText}}"],
      ["委托人(家属)", "{{client.name}}"],
      ["与被告人关系", ""],
      ["联系电话", "{{client.phone}}"],
      ["被告人姓名", "{{opposing.name}}"],
      ["羁押/居所地点", "{{opposing.address}}"],
      ["案件阶段", "侦查 / 审查起诉 / 一审 / 二审 / 再审"],
      ["办理机关", ""],
      ["主办律师", "{{lawyer.name}}"]
    ]),
    blank(),
    body("登记日期：{{todayCN}}", { align: AlignmentType.RIGHT })
  ]);
}

// ============================================================
// 模板 3: 法律服务风险告知书
// ============================================================
const T3_VARS = ["firm.name", "client.name", "matter.causeText", "lawyer.name", "todayCN"];

async function buildT3(): Promise<Buffer> {
  return pack([
    title("法律服务风险告知书"),
    body("致：{{client.name}}", { bold: true }),
    blank(),
    body(
      "本所及本所律师在接受您的委托办理 {{matter.causeText}} 一案前，依据《律师法》《律师执业行为规范》等相关规定，将以下法律服务风险事项明确告知您，请仔细阅读：",
      { indent: true }
    ),
    blank(),
    body("一、法律服务结果的不确定性。法律事务的处理受案件事实、证据、法律适用、司法裁量、对方当事人行为等多种因素影响，律师无法承诺任何确定的结果。", { indent: true }),
    body("二、案件结果不取决于代理费金额。律师收费与办案投入相关，与诉讼结果无对应关系。", { indent: true }),
    body("三、证据材料的真实性责任。委托人提供的证据材料须真实、合法。如因证据虚假或瑕疵导致不利后果，由委托人自行承担。", { indent: true }),
    body("四、诉讼时效与举证期限。委托人应当在法律规定的诉讼时效内主张权利，在举证期限内提交全部证据，逾期可能丧失相应权利。", { indent: true }),
    body("五、判决的执行风险。即使获得胜诉判决，因对方履行能力等原因，仍可能存在执行不能或执行不到位的风险。", { indent: true }),
    body("六、和解与调解的可能性。律师将根据案件情况评估和解、调解方案，是否接受由委托人最终决定。", { indent: true }),
    body("七、其他事项。", { indent: true }),
    blank(),
    body("委托人(签字)：________________"),
    blank(),
    body("承办律师：{{lawyer.name}}"),
    body("律师事务所：{{firm.name}}"),
    body("告知日期：{{todayCN}}")
  ]);
}

// ============================================================
// 模板 4: 委托代理合同（个人）
// ============================================================
const T4_VARS = [
  "firm.name",
  "firm.address",
  "firm.phone",
  "client.name",
  "client.idNumber",
  "client.address",
  "client.phone",
  "matter.causeText",
  "lawyer.name",
  "todayCN"
];

async function buildT4(): Promise<Buffer> {
  return pack([
    title("委托代理合同"),
    body("(适用于自然人委托)"),
    blank(),
    body("甲方(委托人)：{{client.name}}"),
    body("身份证号：{{client.idNumber}}"),
    body("住址：{{client.address}}"),
    body("联系电话：{{client.phone}}"),
    blank(),
    body("乙方(受托人)：{{firm.name}}"),
    body("地址：{{firm.address}}"),
    body("电话：{{firm.phone}}"),
    blank(),
    body("甲乙双方根据《中华人民共和国民法典》《中华人民共和国律师法》之规定，经协商一致，签订本委托代理合同：", { indent: true }),
    blank(),
    body("第一条 委托事项及代理权限", { bold: true }),
    body("甲方委托乙方指派律师就 {{matter.causeText}} 一案为甲方提供法律服务。代理权限为：________________(一般代理 / 特别代理：包括代为承认、放弃、变更诉讼请求，代为和解，代为提起反诉或上诉等)。", { indent: true }),
    blank(),
    body("第二条 委托代理事项的范围", { bold: true }),
    body("(一审 / 二审 / 再审 / 仲裁 / 执行)", { indent: true }),
    blank(),
    body("第三条 律师费及支付方式", { bold: true }),
    body("代理费金额：人民币________元(大写：________________元整)。", { indent: true }),
    body("支付方式：________________。", { indent: true }),
    blank(),
    body("第四条 其他费用", { bold: true }),
    body("案件办理过程中产生的诉讼费、保全费、鉴定费、差旅费等，由甲方另行承担。", { indent: true }),
    blank(),
    body("第五条 双方权利义务", { bold: true }),
    body("略", { indent: true }),
    blank(),
    body("第六条 合同的解除与终止", { bold: true }),
    body("略", { indent: true }),
    blank(),
    body("第七条 争议解决", { bold: true }),
    body("因本合同发生的争议，由双方协商解决；协商不成的，提交乙方所在地有管辖权的人民法院诉讼解决。", { indent: true }),
    blank(),
    body("本合同一式两份，甲乙双方各执一份，自双方签字盖章之日起生效。", { indent: true }),
    blank(),
    blank(),
    body("甲方(签字)：________________            乙方(盖章)："),
    blank(),
    body("                                            承办律师：{{lawyer.name}}"),
    blank(),
    body("签订日期：{{todayCN}}", { align: AlignmentType.RIGHT })
  ]);
}

// ============================================================
// 模板 5: 委托代理合同（单位）
// ============================================================
const T5_VARS = [
  "firm.name",
  "firm.address",
  "firm.phone",
  "client.name",
  "client.idNumber",
  "client.address",
  "client.phone",
  "matter.causeText",
  "lawyer.name",
  "todayCN"
];

async function buildT5(): Promise<Buffer> {
  return pack([
    title("委托代理合同"),
    body("(适用于法人或非法人组织委托)"),
    blank(),
    body("甲方(委托人)：{{client.name}}"),
    body("统一社会信用代码：{{client.idNumber}}"),
    body("住所地：{{client.address}}"),
    body("法定代表人/负责人：________________"),
    body("联系电话：{{client.phone}}"),
    blank(),
    body("乙方(受托人)：{{firm.name}}"),
    body("地址：{{firm.address}}"),
    body("电话：{{firm.phone}}"),
    blank(),
    body("甲乙双方就以下事项签订本委托代理合同：", { indent: true }),
    blank(),
    body("第一条 委托事项", { bold: true }),
    body("甲方委托乙方指派律师就 {{matter.causeText}} 一案为甲方提供法律服务。", { indent: true }),
    blank(),
    body("第二条 代理权限", { bold: true }),
    body("特别代理(含代为承认、放弃、变更诉讼请求，代为和解，代为提起反诉或上诉)。", { indent: true }),
    blank(),
    body("第三条 律师费", { bold: true }),
    body("代理费金额：人民币________元(大写：________________元整)。", { indent: true }),
    body("支付方式：分期 / 一次性 / 风险代理 / 按小时计费。", { indent: true }),
    blank(),
    body("第四条 履行期间", { bold: true }),
    body("自本合同签订之日起至本案代理事项处理完毕(取得生效法律文书或双方书面终止)。", { indent: true }),
    blank(),
    body("第五条 保密条款", { bold: true }),
    body("乙方对甲方提供的资料及案件信息负有保密义务。", { indent: true }),
    blank(),
    body("第六条 争议解决", { bold: true }),
    body("协商不成提交乙方所在地有管辖权的人民法院。", { indent: true }),
    blank(),
    blank(),
    body("甲方(盖章)：                                    乙方(盖章)："),
    blank(),
    body("法定代表人/负责人：________________              承办律师：{{lawyer.name}}"),
    blank(),
    body("签订日期：{{todayCN}}", { align: AlignmentType.RIGHT })
  ]);
}

// ============================================================
// 模板 6: 授权委托书（个人）
// ============================================================
const T6_VARS = [
  "client.name",
  "client.idNumber",
  "matter.causeText",
  "opposing.name",
  "lawyer.name",
  "firm.name",
  "todayCN"
];

async function buildT6(): Promise<Buffer> {
  return pack([
    title("授权委托书"),
    blank(),
    body("委托人：{{client.name}}"),
    body("身份证号：{{client.idNumber}}"),
    blank(),
    body("受委托人：{{lawyer.name}}，{{firm.name}}律师。"),
    blank(),
    body("现委托上列受委托人在我与 {{opposing.name}} {{matter.causeText}} 一案中，作为我的诉讼代理人。", { indent: true }),
    blank(),
    body("代理权限为(请勾选)：", { bold: true }),
    body("☐ 一般代理。"),
    body("☐ 特别代理。包括：代为承认、放弃、变更诉讼请求；代为提起反诉、上诉；代为申请执行；代为和解、调解；代为签收法律文书。"),
    blank(),
    body("委托期限：自签署之日起至本案代理事项终结。"),
    blank(),
    blank(),
    body("委托人(签字按印)：________________"),
    blank(),
    body("受委托人(签字)：{{lawyer.name}}"),
    blank(),
    body("{{todayCN}}", { align: AlignmentType.RIGHT })
  ]);
}

// ============================================================
// 模板 7: 民事起诉状
// ============================================================
const T7_VARS = [
  "client.name",
  "client.idNumber",
  "client.address",
  "client.phone",
  "opposing.name",
  "opposing.idNumber",
  "opposing.address",
  "matter.causeText",
  "matter.claimAmount",
  "proceeding.court",
  "lawyer.name",
  "todayCN"
];

async function buildT7(): Promise<Buffer> {
  return pack([
    title("民事起诉状"),
    blank(),
    body("原告：{{client.name}}"),
    body("身份证号：{{client.idNumber}}"),
    body("住址：{{client.address}}"),
    body("联系电话：{{client.phone}}"),
    blank(),
    body("被告：{{opposing.name}}"),
    body("身份证号 / 统一社会信用代码：{{opposing.idNumber}}"),
    body("住址：{{opposing.address}}"),
    blank(),
    body("案由：{{matter.causeText}}", { bold: true }),
    body("诉讼标的金额：{{matter.claimAmount}}", { bold: true }),
    blank(),
    body("诉讼请求：", { bold: true }),
    body("1. ________________；", { indent: true }),
    body("2. ________________；", { indent: true }),
    body("3. 本案诉讼费、保全费等由被告承担。", { indent: true }),
    blank(),
    body("事实与理由：", { bold: true }),
    body("________________________________________________________________________", { indent: true }),
    body("________________________________________________________________________", { indent: true }),
    body("________________________________________________________________________", { indent: true }),
    blank(),
    body("综上，根据《中华人民共和国民法典》《中华人民共和国民事诉讼法》之规定，请求贵院依法判决，以维护原告合法权益。", { indent: true }),
    blank(),
    blank(),
    body("此致"),
    body("{{proceeding.court}}", { bold: true }),
    blank(),
    blank(),
    body("起诉人(签字)：________________"),
    body("                                                            代理律师：{{lawyer.name}}"),
    blank(),
    body("{{todayCN}}", { align: AlignmentType.RIGHT })
  ]);
}

// ============================================================
// 模板 8: 民事答辩状
// ============================================================
const T8_VARS = [
  "client.name",
  "client.idNumber",
  "client.address",
  "client.phone",
  "opposing.name",
  "opposing.address",
  "matter.causeText",
  "proceeding.court",
  "proceeding.caseNo",
  "lawyer.name",
  "todayCN"
];

async function buildT8(): Promise<Buffer> {
  return pack([
    title("民事答辩状"),
    blank(),
    body("答辩人：{{client.name}}"),
    body("身份证号：{{client.idNumber}}"),
    body("住址：{{client.address}}"),
    body("联系电话：{{client.phone}}"),
    blank(),
    body("被答辩人：{{opposing.name}}"),
    body("住址：{{opposing.address}}"),
    blank(),
    body("案由：{{matter.causeText}}", { bold: true }),
    body("案号：{{proceeding.caseNo}}", { bold: true }),
    blank(),
    body("针对被答辩人的起诉，答辩人答辩如下：", { indent: true, bold: true }),
    blank(),
    body("一、关于诉讼请求", { bold: true }),
    body("________________________________________________________________________", { indent: true }),
    blank(),
    body("二、关于事实部分", { bold: true }),
    body("________________________________________________________________________", { indent: true }),
    blank(),
    body("三、关于法律适用", { bold: true }),
    body("________________________________________________________________________", { indent: true }),
    blank(),
    body("综上，请求贵院依法驳回被答辩人的诉讼请求，以维护答辩人合法权益。", { indent: true }),
    blank(),
    blank(),
    body("此致"),
    body("{{proceeding.court}}", { bold: true }),
    blank(),
    blank(),
    body("答辩人(签字)：________________"),
    body("                                                            代理律师：{{lawyer.name}}"),
    blank(),
    body("{{todayCN}}", { align: AlignmentType.RIGHT })
  ]);
}

// ============================================================
// 模板 9: 卷宗封皮（v0.9.4 归档）
// ============================================================
const T9_VARS = [
  "firm.name",
  "matter.code",
  "matter.title",
  "matter.causeText",
  "matter.category",
  "client.name",
  "opposing.name",
  "lawyer.name",
  "archive.archiveNo",
  "archive.closedReasonCN",
  "archive.completedAtCN",
  "archive.archivedAtCN"
];

async function buildT9(): Promise<Buffer> {
  return pack([
    blank(),
    body("{{firm.name}}", { align: AlignmentType.CENTER, bold: true }),
    blank(),
    blank(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 240 },
      children: [
        new TextRun({ text: "卷    宗", font: FONT_TITLE, size: 72, bold: true })
      ]
    }),
    blank(),
    blank(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120 },
      children: [
        new TextRun({ text: "{{matter.title}}", font: FONT_TITLE, size: 36, bold: true })
      ]
    }),
    blank(),
    body("{{client.name}} 诉 {{opposing.name}}", { align: AlignmentType.CENTER }),
    blank(),
    blank(),
    blank(),
    kvTable([
      ["归档编号", "{{archive.archiveNo}}"],
      ["案件编号", "{{matter.code}}"],
      ["案件类别", "{{matter.category}}"],
      ["案由", "{{matter.causeText}}"],
      ["结案方式", "{{archive.closedReasonCN}}"],
      ["结案日期", "{{archive.completedAtCN}}"],
      ["归档日期", "{{archive.archivedAtCN}}"],
      ["承办律师", "{{lawyer.name}}"]
    ]),
    blank(),
    blank(),
    body("本卷宗自归档日起按律所规定保存，未经许可不得借阅、复制或转交。", { align: AlignmentType.CENTER })
  ]);
}

// ============================================================
// 模板 10: 卷宗目录（v0.9.4 归档）
// ============================================================
const T10_VARS = [
  "firm.name",
  "matter.code",
  "matter.title",
  "archive.archiveNo",
  "archive.archivedAtCN",
  "lawyer.name"
  // documents[] 通过运行时 inject，不在 detectMissing 范围
];

function docCatalogHeaderRow(): TableRow {
  const headers = ["序号", "材料名称", "类别", "上传日期", "页数", "备注"];
  return new TableRow({
    tableHeader: true,
    children: headers.map((h, idx) => new TableCell({
      width: { size: [8, 38, 14, 16, 10, 14][idx], type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: h, font: FONT_BODY, size: 22, bold: true })]
        })
      ]
    }))
  });
}

function docCatalogLoopRow(): TableRow {
  // docxtemplater 在表格循环：单元格内分别用 {{#documents}}...{{/documents}} 包裹会失效；
  // 标准做法是把 loop 标签放在整行外层，行 cell 内只放纯 {{var}}。这里用注释占位行 + 文档生成时手工插入循环标签。
  // 为简化，直接 build 一行 placeholders，loop 包裹通过 docxtemplater 的 row loop 自动识别（同一行第一个 cell 含 {{#documents}}）。
  const cells: TableCell[] = [
    new TableCell({
      width: { size: 8, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "{{#documents}}{{seq}}", font: FONT_BODY, size: 22 })]
        })
      ]
    }),
    new TableCell({
      width: { size: 38, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({ children: [new TextRun({ text: "{{name}}", font: FONT_BODY, size: 22 })] })
      ]
    }),
    new TableCell({
      width: { size: 14, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "{{categoryCN}}", font: FONT_BODY, size: 22 })]
        })
      ]
    }),
    new TableCell({
      width: { size: 16, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "{{uploadDate}}", font: FONT_BODY, size: 22 })]
        })
      ]
    }),
    new TableCell({
      width: { size: 10, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "{{pages}}", font: FONT_BODY, size: 22 })]
        })
      ]
    }),
    new TableCell({
      width: { size: 14, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({ children: [new TextRun({ text: "{{remark}}{{/documents}}", font: FONT_BODY, size: 22 })] })
      ]
    })
  ];
  return new TableRow({ children: cells });
}

async function buildT10(): Promise<Buffer> {
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "555555" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "555555" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "555555" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "555555" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "AAAAAA" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "AAAAAA" }
    },
    rows: [docCatalogHeaderRow(), docCatalogLoopRow()]
  });

  return pack([
    body("{{firm.name}}", { align: AlignmentType.CENTER, bold: true }),
    title("卷 宗 目 录"),
    body("归档编号：{{archive.archiveNo}}    案件编号：{{matter.code}}", { align: AlignmentType.RIGHT }),
    body("案件：{{matter.title}}", { align: AlignmentType.RIGHT }),
    blank(),
    table,
    blank(),
    body("承办律师：{{lawyer.name}}", { align: AlignmentType.RIGHT }),
    body("归档日期：{{archive.archivedAtCN}}", { align: AlignmentType.RIGHT })
  ]);
}

// ============================================================
// 注册表
// ============================================================
export const BUILTIN_TEMPLATES: BuiltInTemplate[] = [
  {
    key: "civil_intake_registration",
    name: "民事案件收案登记表",
    category: "INTAKE",
    description: "民事案件收案信息登记，用于律所收案立卷。字段自动从案件信息抓取。",
    applicableCategories: ["CIVIL_COMMERCIAL"],
    variables: T1_VARS,
    buildBuffer: buildT1
  },
  {
    key: "criminal_intake_registration",
    name: "刑事案件收案登记表",
    category: "INTAKE",
    description: "刑事案件收案信息登记。被告人羁押地点等关键字段。",
    applicableCategories: ["CRIMINAL"],
    variables: T2_VARS,
    buildBuffer: buildT2
  },
  {
    key: "legal_service_risk_notice",
    name: "法律服务风险告知书",
    category: "INTAKE",
    description: "向委托人告知法律服务的不确定性与各类风险。律师与委托人签字。",
    applicableCategories: [],
    variables: T3_VARS,
    buildBuffer: buildT3
  },
  {
    key: "retainer_individual",
    name: "委托代理合同(个人)",
    category: "RETAINER",
    description: "自然人委托代理合同标准模板，含代理权限/律师费/争议解决条款。",
    applicableCategories: [],
    variables: T4_VARS,
    buildBuffer: buildT4
  },
  {
    key: "retainer_organization",
    name: "委托代理合同(单位)",
    category: "RETAINER",
    description: "法人或非法人组织委托代理合同标准模板。",
    applicableCategories: [],
    variables: T5_VARS,
    buildBuffer: buildT5
  },
  {
    key: "power_of_attorney_individual",
    name: "授权委托书(个人)",
    category: "RETAINER",
    description: "自然人授权委托书，含一般代理 / 特别代理勾选。",
    applicableCategories: [],
    variables: T6_VARS,
    buildBuffer: buildT6
  },
  {
    key: "civil_complaint",
    name: "民事起诉状",
    category: "LITIGATION",
    description: "民事起诉状标准格式。诉讼请求与事实理由需律师填充。",
    applicableCategories: ["CIVIL_COMMERCIAL"],
    variables: T7_VARS,
    buildBuffer: buildT7
  },
  {
    key: "civil_answer",
    name: "民事答辩状",
    category: "LITIGATION",
    description: "民事答辩状标准格式。答辩内容需律师填充。",
    applicableCategories: ["CIVIL_COMMERCIAL"],
    variables: T8_VARS,
    buildBuffer: buildT8
  },
  {
    key: "archive_cover",
    name: "卷宗封皮",
    category: "ARCHIVE",
    description: "归档时自动生成。律所标识 + 案件标题 + 归档编号 + 结案信息。律师勿手动渲染。",
    applicableCategories: [],
    variables: T9_VARS,
    buildBuffer: buildT9
  },
  {
    key: "archive_catalog",
    name: "卷宗目录",
    category: "ARCHIVE",
    description: "归档时自动生成。列出本案全部材料（按上传时间排序）。律师勿手动渲染。",
    applicableCategories: [],
    variables: T10_VARS,
    buildBuffer: buildT10
  }
];
