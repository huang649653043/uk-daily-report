// 构建脚本：把 report.json 内嵌进 index.html，生成可离线打开、也可托管刷新的单文件页面
// 同时把当日数据归档到 archive/YYYY-MM-DD.json，并维护 archive/index.json 日期索引（供历史日期选择器使用）
// 用法：node scripts/build_page.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const report = JSON.parse(fs.readFileSync(path.join(root, "report.json"), "utf8"));
const tpl = fs.readFileSync(path.join(root, "index.template.html"), "utf8");

if (!tpl.includes("__REPORT_DATA__")) {
  console.error("index.template.html 缺少 __REPORT_DATA__ 占位符");
  process.exit(1);
}

const html = tpl.replace("__REPORT_DATA__", JSON.stringify(report));
fs.writeFileSync(path.join(root, "index.html"), html, "utf8");
console.log("已生成 index.html（" + html.length + " 字节）");

// ---- 历史归档 ----
const date = (report.meta && report.meta.date) || "unknown";
const archiveDir = path.join(root, "archive");
fs.mkdirSync(archiveDir, { recursive: true });
fs.writeFileSync(path.join(archiveDir, date + ".json"), JSON.stringify(report), "utf8");
console.log("已归档 archive/" + date + ".json");

const indexPath = path.join(archiveDir, "index.json");
let dates = [];
try { dates = JSON.parse(fs.readFileSync(indexPath, "utf8")).dates || []; } catch (e) { /* 首次构建 */ }
if (!dates.includes(date)) dates.push(date);
dates.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
fs.writeFileSync(indexPath, JSON.stringify({ dates }, null, 2), "utf8");
console.log("已更新 archive/index.json（共 " + dates.length + " 个日期）");
