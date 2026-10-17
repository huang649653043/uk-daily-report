// 构建脚本：把 report.json 复制进小程序 data/，并生成可 require 的 report.js
// 用法：node scripts/build_miniprogram.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const json = fs.readFileSync(path.join(root, "report.json"), "utf8");
const dataDir = path.join(root, "miniprogram", "data");
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "report.json"), json, "utf8");
fs.writeFileSync(path.join(dataDir, "report.js"), "module.exports = " + json + ";\n", "utf8");
console.log("已生成 miniprogram/data/report.json 与 report.js");
