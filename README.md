# 英国每日热点日报（UK Daily Report）

每天 10:00（英国伦敦时间）自动搜集英国全网热点，输出**英国每日 Top 10 热点**：
每条注明**来源**、**事件分析**和**内容推广结合点**，并生成**灵动版移动端网页**（可分享给朋友）+ **微信小程序**。

## 目录结构

```
outputs/uk-daily-report/
├── report.json                 # 日报数据（Top10，每日自动更新）
├── index.html                  # 灵动版移动端网页（内嵌数据，可离线打开）
├── index.template.html         # 页面模板（构建脚本用于内嵌数据）
├── scripts/
│   ├── fetch_data.mjs          # 采集：BBC RSS / Google Trends UK RSS / Reddit UK JSON → Top10
│   ├── build_page.mjs          # 构建 index.html
│   └── build_miniprogram.mjs   # 生成小程序 data/report.json 与 report.js
├── miniprogram/                # 微信小程序（微信开发者工具导入即可预览）
└── .github/workflows/
    └── daily-report.yml        # 每日 10:00 London 自动更新 + 发布 GitHub Pages
```

## 数据源与规则

- 数据源：BBC News RSS、Google Trends UK RSS（补位）、Reddit UK（r/unitedkingdom、r/AskUK）。
- X (Twitter) / TikTok 官方实时榜单没有公开 API：自动标注“实时榜单不可用 → Google Search UK 实时热门搜索补位”。
- 采集窗口为近 12 小时热点；跨平台按标题去重；近 7 日已持续报道的事件降权（聚合时仅保留最相关 Top 10）。
- 每条热点自动生成：来源 / 热度 / 事件分析 / 内容推广结合点（关键词归入五大专题后套用文案模板；
  同一事件再次出现时自动复用上一次的人工策划文案）。
- 自动适配夏令时：cron 09:00+10:00 UTC 双时点 + 脚本内“伦敦 10 点”校验，保证全年准点 10:00 London。

## 本地运行

```bash
# 1) 采集数据（需要可联网）
node scripts/fetch_data.mjs
# 2) 构建网页
node scripts/build_page.mjs
# 3) 构建小程序数据
node scripts/build_miniprogram.mjs
```

本地预览：直接用浏览器打开 `index.html`（已内嵌数据，无需服务器）；部署到任意静态托管后，
页面会优先请求同目录 `report.json` 获取最新数据。

## 本地自动更新（macOS launchd，不依赖 GitHub）

如果你的 Mac 每天 10:00（伦敦时间）处于开机状态，可以让本机自动抓取并生成最新网页：

```bash
# 1) 建议先把整个目录放到固定位置（避免路径变动），例如：
#    cp -R outputs/uk-daily-report ~/uk-daily-report
#    然后编辑 scripts/com.ukdailyreport.daily.plist 里的路径

# 2) 安装定时任务（每小时触发一次，脚本内部仅在伦敦 10 点时执行）
cp scripts/com.ukdailyreport.daily.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ukdailyreport.daily.plist

# 3) 查看运行日志
tail -f work/cron.log

# 4) 卸载
# launchctl unload ~/Library/LaunchAgents/com.ukdailyreport.daily.plist
```

- 要求：本机已安装 Node.js 18+（`node -v` 可查）。
- 每次更新会重写 `report.json`、`index.html` 与 `miniprogram/data/*`；浏览器打开 `index.html` 即为最新日报。
- 该方案仅本机可用；要让朋友通过链接访问，仍建议用下面的 GitHub Pages 方案。

## 部署为可分享网页（推荐）

1. 把 `outputs/uk-daily-report/` 推送到 GitHub 仓库。
2. 启用 GitHub Actions（已内置 workflow）与 GitHub Pages（分支 `gh-pages`）。
3. 每天 10:00 伦敦时间自动采集 → 生成页面 → 发布 Pages，链接直接发微信/朋友圈即可查看。

其他静态托管（Netlify / Vercel / Cloudflare Pages / OSS）同理：上传目录并配置每日定时任务
运行 `node scripts/fetch_data.mjs && node scripts/build_page.mjs`。

## 微信小程序（快速上手）

1. 注册小程序账号：https://mp.weixin.qq.com （个人主体免费），登录后在「开发 → 开发管理 → 开发设置」查看 AppID。
2. 下载微信开发者工具：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
3. 打开开发者工具 → 导入项目 → 目录选择 `miniprogram/` 文件夹（项目配置已内置）→ AppID 填你的 AppID（未注册前可先用测试号）→ 确定。
4. 编译预览：模拟器直接看效果；点「预览」生成二维码可扫码在手机上体验。
5. 数据打包在 `miniprogram/data/report.js`，由 `scripts/build_miniprogram.mjs` 生成；每日更新先在本机运行
   `node scripts/fetch_data.mjs && node scripts/build_miniprogram.mjs`，再在开发者工具上传新版本。
6. 全自动更新方案（推荐）：开通微信云开发 → 把采集逻辑做成云函数（定时触发器 10:00 伦敦）→ 小程序从云数据库读取；
   或把 `report.json` 部署到已备案 HTTPS 域名后小程序 `wx.request` 拉取（正式版要求域名备案并配置 request 合法域名）。
7. 发布：开发者工具「上传」→ mp.weixin.qq.com「版本管理」提交审核 → 审核通过后发布。
8. 分享：已内置 `onShareAppMessage`（转发好友/群）与 `onShareTimeline`（朋友圈），页面也加了分享按钮。

## 推广假设

内容推广结合点默认按“面向英国本地及中文跨境受众的内容账号（公众号 / 小红书 / TikTok / 短视频），
产品含信息内容、本地服务与电商选品”撰写。如果你的产品定位不同，告诉我，我可以按你的产品重新定制每条建议。

## 说明

- 数据来源于公开平台与媒体，仅供信息参考，不构成投资或医疗建议。
