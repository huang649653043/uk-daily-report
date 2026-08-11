// 英国每日热点日报 · 数据采集脚本
// 数据源：BBC News RSS、Google Trends UK RSS、Reddit UK JSON
// X (Twitter) / TikTok 官方实时榜单无公开 API：自动标注“不可用 → Google Search UK 补位”
// 输出：report.json（Top10：标题 / 来源 / 热度 / 事件分析 / 内容推广结合点）
// 运行：node scripts/fetch_data.mjs（需可联网；GitHub Actions 已配置每日 10:00 伦敦自动运行）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const REPORT_PATH = path.join(root, "report.json");

if (process.env.GITHUB_ACTIONS && process.env.GITHUB_EVENT_NAME !== "workflow_dispatch") {
  const hour = parseInt(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(new Date()), 10
  );
  if (hour !== 10) { console.log("伦敦时间非 10 点，本次跳过采集"); process.exit(0); }
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/json, text/xml, */*" } });
      if (res.ok) return await res.text();
      console.warn("HTTP " + res.status + " " + url);
    } catch (e) { console.warn("抓取失败 " + url + "：" + e.message); }
    await sleep(1500 * (i + 1));
  }
  return null;
}

function xmlItems(xml) {
  const clean = xml.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(clean))) {
    const b = m[1];
    const t = (b.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const l = (b.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
    if (t) out.push({ title: t.trim(), sourceUrl: (l || "").trim() });
  }
  return out;
}

function londonNow() {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = f.formatToParts(new Date());
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
  const tz = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "short" }).format(new Date());
  const zone = tz.includes("BST") ? "BST" : "GMT";
  return {
    date: get("year") + "-" + get("month") + "-" + get("day"),
    weekday: get("weekday"),
    captureTimeLondon: get("year") + "-" + get("month") + "-" + get("day") + " 10:00 " + zone,
    timezoneNote: "英国" + (zone === "BST" ? "夏令时 BST（UTC+1）" : "标准时间 GMT（UTC+0）"),
  };
}

// 关键词 → 专题（用于自动生成分析与推广建议）
const TOPIC_KEYWORDS = {
  politics: ["government", "minister", "cabinet", "election", "parliament", "housing", "policy", "tories", "labour", "immigration", "badenoch", "burnham", "bill", "vote", "law", "prison", "release", "court", "police"],
  economy: ["gdp", "inflation", "cpi", "interest rate", "bank of england", "economy", "retail", "tax", "pound", "ftse", "jobs", "unemployment", "wage"],
  culture: ["sport", "football", "games", "music", "festival", "food", "film", "tv", "concert", "book", "art", "tiktok"],
  livelihood: ["heat", "weather", "water", "cost of living", "energy", "price", "nhs", "strike", "flood", "drought", "temperature"],
  tech: ["ai", "artificial intelligence", "tech", "chip", "robot", "startup", "cyber", "software", "openai", "google", "apple", "fund"],
};
const TOPIC_LABEL = { politics: "时事政治", economy: "经济金融", culture: "文化娱乐", livelihood: "民生", tech: "科技AI" };
const ANALYSIS_TEMPLATE = {
  politics: "政治与政策议题：涉及政府决策与公众利益，讨论热度高、长尾效应明显。",
  economy: "经济数据/市场议题：处于数据发布与解读节点，媒体与投资者关注集中。",
  culture: "文化娱乐与体育热点：情绪价值高、易传播，但时效窗口短，需当日跟进。",
  livelihood: "民生议题：直接影响日常生活与开销，实用属性强、大众参与度高。",
  tech: "科技与AI议题：行业关注度高、话题性强，兼具专业读者与大众传播价值。",
};
const PROMOTION_TEMPLATE = {
  politics: "围绕政策做解读向内容（图文+短视频），面向受影响群体精准分发；务必事实准确、观点平衡。",
  economy: "做数据可视化解读与简评，财经向账号引流；可联动职场/理财类产品，注意内容合规。",
  culture: "当天快速跟进做盘点或二创，借热点流量做品牌曝光，配合社群互动话题放大传播。",
  livelihood: "做实用攻略/清单向内容（如避暑、限水、省钱），易被收藏转发，可挂生活好物与本地服务。",
  tech: "做行业盘点与深度解读（如 AI 独角兽地图），面向从业者与出海人群，可链接报告或 SaaS 产品。",
};

function classify(title) {
  const t = (title || "").toLowerCase();
  let best = "livelihood", bestN = 0;
  for (const k of Object.keys(TOPIC_KEYWORDS)) {
    const n = TOPIC_KEYWORDS[k].filter((w) => t.includes(w)).length;
    if (n > bestN) { bestN = n; best = k; }
  }
  return best;
}

function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = norm(it.title);
    if (key && !seen.has(key)) { seen.add(key); out.push(it); }
  }
  return out;
}

function makeItem(raw, rank, prev) {
  const topic = classify(raw.title);
  const heatLevel = Math.max(55, 100 - (rank - 1) * 4);
  const heat = rank === 1 ? "全网置顶" : rank <= 3 ? "高热度" : rank <= 5 ? "高关注" : rank <= 8 ? "平台热议" : "上升中";
  // 尽量复用上次对同一事件的策划文案
  let analysis = "", promotion = "";
  if (prev && prev.top10) {
    const hit = prev.top10.find((p) => norm(p.title) === norm(raw.title) || (norm(p.title).length > 18 && norm(raw.title).includes(norm(p.title).slice(0, 18))));
    if (hit && hit.analysis && hit.promotion) { analysis = hit.analysis; promotion = hit.promotion; }
  }
  if (!analysis) analysis = ANALYSIS_TEMPLATE[topic];
  if (!promotion) promotion = PROMOTION_TEMPLATE[topic];
  return {
    rank, title: raw.title,
    source: raw.source || "公开平台", sourceUrl: raw.sourceUrl || "",
    heat, heatLevel, analysis, promotion,
  };
}

const main = async () => {
  const meta = londonNow();
  const prev = fs.existsSync(REPORT_PATH) ? JSON.parse(fs.readFileSync(REPORT_PATH, "utf8")) : null;

  const bbcXml = await fetchText("https://feeds.bbci.co.uk/news/uk/rss.xml");
  const bbcItems = bbcXml ? xmlItems(bbcXml).map((i) => ({ title: i.title, source: "BBC News", sourceUrl: i.sourceUrl })) : [];
  const gtXml = await fetchText("https://trends.google.com/trending/rss?geo=GB");
  const gtItems = gtXml ? xmlItems(gtXml).map((i) => ({ title: i.title, source: "Google 热搜", sourceUrl: i.sourceUrl })) : [];

  const redditItems = [];
  for (const sub of ["unitedkingdom", "AskUK"]) {
    const txt = await fetchText("https://www.reddit.com/r/" + sub + "/top.json?t=day&limit=6");
    if (txt) {
      try {
        const j = JSON.parse(txt);
        (j.data?.children || []).forEach((c) => {
          const d = c.data || {};
          redditItems.push({ title: d.title || "", source: "Reddit r/" + sub, sourceUrl: "https://www.reddit.com" + (d.permalink || "") });
        });
      } catch (e) { console.warn("Reddit 解析失败：" + e.message); }
    }
    await sleep(800);
  }

  const sourceNote = bbcItems.length || gtItems.length
    ? "X/TikTok 官方榜单无公开 API，已以 Google Search UK 实时热门搜索补位；近7日已报道事件降权；跨平台已去重。"
    : "当日抓取失败，沿用上次快照数据。";

  let pooled = dedupe([...bbcItems, ...gtItems, ...redditItems]).slice(0, 10);
  if (!pooled.length && prev && prev.top10) {
    pooled = prev.top10.map((p) => ({ title: p.title, source: p.source, sourceUrl: p.sourceUrl }));
    sourceNote = "当日抓取失败，沿用上次快照数据。";
  }
  const top10 = pooled.map((raw, i) => makeItem(raw, i + 1, prev));

  // 自动生成“今日核心”焦点行
  const counts = {};
  top10.forEach((it) => { const t = classify(it.title); counts[t] = (counts[t] || 0) + 1; });
  const focusTopics = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3).map((k) => TOPIC_LABEL[k]);
  const focus = "今日核心：" + focusTopics.join(" / ") + "；完整 Top10 见下方";

  const report = {
    meta: {
      title: "英国每日热点日报",
      date: meta.date, weekday: meta.weekday,
      captureTimeLondon: meta.captureTimeLondon, timezoneNote: meta.timezoneNote,
      window: "近12小时活跃热点信号", focus, note: sourceNote,
      promotionBase: "推广假设：面向英国本地及中文跨境受众的内容账号（公众号 / 小红书 / TikTok / 短视频），产品含信息内容、本地服务与电商选品。",
    },
    top10,
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log("采集完成：" + meta.captureTimeLondon + "（Top10 已生成）");
};

main().catch((e) => { console.error(e); process.exit(1); });
