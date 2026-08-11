# 英国每日热点日报（UK Daily Report）

每天英国时间 10:00 自动生成并更新的英国热点 Top10 单页日报，可每日查看，也可回溯历史日期。

线上地址：<https://huang649653043.github.io/uk-daily-report/>

## 数据源与排序
- 数据源优先级：**TikTok 英国热门话题（官方 Creative Center 榜单）→ Google Search UK 实时热搜 → Reddit UK → BBC News RSS**
- TikTok 官方榜单置顶（每日 Top3：话题 + 新帖数 + 播放量），其余平台按热度补足 Top10
- X (Twitter) 官方实时榜单无公开 API：自动以 Google Search UK 实时热门搜索补位
- 近 7 日已报道事件自动降权冷却；跨平台标题去重
- 每条热点包含：来源链接、事件分析、**家庭清洁类产品内容推广建议**（TikTok/短视频场景种草 + 公众号/小红书图文转化）

## 每日更新
- GitHub Actions 定时任务：每天 09:00 / 10:00 UTC（= 伦敦 10:00 BST/GMT 全年准点）运行 `scripts/fetch_data.mjs` → `scripts/build_page.mjs`
- 构建时自动归档：`archive/YYYY-MM-DD.json`，并维护 `archive/index.json` 日期索引
- 网页右上角日期选择器可切换查看历史日期日报（点击「📅」下拉选择）

## 本地构建
```bash
node scripts/fetch_data.mjs   # 抓取数据（需联网）→ report.json
node scripts/build_page.mjs   # 生成 index.html + archive/ 归档
```

## 说明
- 推广建议围绕家庭清洁类产品（厨房油污清洁、卫浴除垢、地毯/布艺清洁、宠物毛发清理、收纳清洁工具等）展开
- 页面支持 A4 一页打印/截图、深色模式、全文复制；跑马灯展示当日全部热搜标题
- TikTok 官方榜单匿名可见 Top3；若当日不可用，自动退回 Google Search UK 补位并在页脚注明
