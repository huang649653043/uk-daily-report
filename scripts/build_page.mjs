// 构建脚本：把 report.json 内嵌进 index.html，生成可离线打开、也可托管刷新的单文件页面
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
