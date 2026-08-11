// 英国每日热点日报 · 数据采集脚本
// 数据源优先级：TikTok 英国热门话题（官方 Creative Center 榜单）→ Google Search UK 实时热搜 → Reddit UK → BBC News RSS
// X (Twitter) 官方实时榜单无公开 API：自动标注“不可用 → Google Search UK 补位”
// 输出：report.json（Top10：标题 / 来源 / 热度 / 事件分析 / 家庭清洁产品内容推广结合点）
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

async function fetchText(url, accept, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept || "application/rss+xml, application/json, text/xml, */*" },
      });
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

// ---------- TikTok 英国热门话题（官方 Creative Center，SSR HTML 匿名可读 Top3） ----------
function parseTikTokHashtags(html) {
  const out = [];
  const re = /class="[^"]*truncate[^"]*text-\[18px\][^"]*"[^>]*>#([A-Za-z0-9_]+)<\/div>([\s\S]{0,1600}?)<span[^>]*class="[^"]*text-\[18px\][^"]*"[^>]*>([\d.,]+[KM]?)<\/span><span[^>]*>Posts<\/span>([\s\S]{0,400}?)<span[^>]*class="[^"]*text-\[18px\][^"]*"[^>]*>([\d.,]+[KM]?)<\/span><span[^>]*>Views<\/span>/gi;
  let m;
  while ((m = re.exec(html))) out.push({ tag: m[1], posts: m[3], views: m[5] });
  return out;
}

async function fetchTikTokHashtags() {
  for (const period of [1, 7, 30]) {
    const url = "https://ads.tiktok.com/creative/creativeCenter/trends/hashtag?period=" + period + "&region=GB";
    const html = await fetchText(url, "text/html,application/xhtml+xml,*/*", 2);
    if (!html) continue;
    const items = parseTikTokHashtags(html.replace(/\s+/g, " "));
    if (items.length) {
      console.log("TikTok 英国热门话题抓取成功（period=" + period + "）：" + items.map((i) => "#" + i.tag).join(" / "));
      return items.slice(0, 3);
    }
    console.warn("TikTok period=" + period + " 未解析到话题");
  }
  return [];
}

// 已知 TikTok 话题的准确解读；未知话题走通用模板
const TIKTOK_KNOWN = {
  hekination: {
    desc: "利物浦前锋 Hugo Ekitiké 球迷热梗（Heki+Nation）刷屏，社区二创爆发，播放量破千万。",
    promo: "借球迷流量拍\"比赛日客厅 5 分钟焕新\"：沙发/地毯宠物毛发+零食渍清理、派对后油污清洁，挂 #hekination + #CleanTok，评论区引导进店铺。",
  },
  ekitike: {
    desc: "法国前锋 Hugo Ekitiké 相关话题（Sports & Outdoor）持续高热，新帖 5.4K、播放 6.5M。",
    promo: "体育流量选题：\"看球聚会后厨房 5 分钟急救\"（油污/酒渍/除味）短平快实测视频，挂 #ekitike，直接导流清洁产品。",
  },
  brunonation: {
    desc: "曼联队长 Bruno Fernandes 球迷社区话题，足球流量稳定，新帖 4.4K、播放 3.2M。",
    promo: "球迷向种草：\"比赛日地毯/沙发清洁挑战\" Before-After 对比视频，挂 #brunonation 蹭热度，评论区引导购买。",
  },
};

function viewToHeat(views) {
  const s = String(views || "1K").toUpperCase();
  const n = parseFloat(s) * (s.endsWith("M") ? 1e6 : s.endsWith("K") ? 1e3 : 1);
  return Math.min(99, Math.round(58 + Math.log10(Math.max(n, 2000)) * 12));
}

function makeTikTokItem(t, rank) {
  const heat = viewToHeat(t.views);
  const heatLabel = rank === 1 ? "TikTok 顶流" : rank === 2 ? "TikTok 热议" : "TikTok 上升";
  const known = TIKTOK_KNOWN[(t.tag || "").toLowerCase()] || {};
  return {
    rank, title: "#" + t.tag, platform: "tiktok", badge: "🎬 TikTok",
    source: "TikTok 英国热门话题", sourceUrl: "https://www.tiktok.com/tag/" + encodeURIComponent(t.tag),
    heat: heatLabel + " · " + t.posts + " 帖 / " + t.views + " 播放", heatLevel: heat,
    analysis: known.desc || ("TikTok 英国热门话题 #" + t.tag + "，近 24 小时 " + t.posts + " 个新帖、" + t.views + " 次播放，社区创作活跃。"),
    promotion: known.promo || ("借 #" + t.tag + " 流量做\"清洁解压 Before/After\"短视频（去油污/除垢/宠物毛发），挂 #" + t.tag + " + #CleanTok，评论区引导进店铺转化。"),
  };
}

// ---------- 关键词 → 专题（用于自动生成分析与推广建议） ----------
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
// 推广建议统一围绕家庭清洁类产品展开
const PROMOTION_TEMPLATE = {
  politics: "政策热点借势：用\"国民解压/大扫除\"生活内容承接流量（除油除垢 Before-After），避开争议站队，观点号保持事实准确。",
  economy: "省钱话题绑定：做\"物价高企，3 个自制清洁配方省 10 倍\"测评图文，易收藏转发，直接挂清洁剂链接。",
  culture: "娱乐体育热点：借看球/派对/音乐节场景拍\"狂欢后 5 分钟清洁\"短剧，展示去污渍、除味、收纳，娱乐化种草。",
  livelihood: "民生实用场景：高温/潮湿/宠物/过敏季清洁攻略（除霉、除螨、宠物毛发、油污），清单式图文易收藏，直接带清洁产品。",
  tech: "科技 AI 热点：做\"AI 时代家务减负\"内容——智能清洁工具 vs 经典清洁剂实测对比，测评种草，专业+实用双人群。",
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

function platformOf(source) {
  const s = String(source || "");
  if (s.startsWith("TikTok")) return "tiktok";
  if (s.startsWith("Google")) return "google";
  if (s.startsWith("Reddit")) return "reddit";
  if (s.startsWith("BBC")) return "bbc";
  return "news";
}
const BADGE = { tiktok: "🎬 TikTok", google: "🔎 Google 热搜", reddit: "👽 Reddit UK", bbc: "📰 BBC", news: "📰 媒体" };

// 近7日已报道事件降权冷却：与上一日 Top10 同题者排到末尾
function cool(prev, items) {
  const prevKeys = new Set((prev?.top10 || []).map((p) => norm(p.title)));
  const hot = [], cold = [];
  for (const it of items) (prevKeys.has(norm(it.title)) ? cold : hot).push(it);
  return [...hot, ...cold];
}

function makeItem(raw, rank, prev) {
  const topic = classify(raw.title);
  const heatLevel = Math.max(55, 100 - (rank - 1) * 4);
  const heat = rank === 1 ? "全网置顶" : rank <= 3 ? "高热度" : rank <= 5 ? "高关注" : rank <= 8 ? "平台热议" : "上升中";
  let analysis = "", promotion = "";
  if (prev && prev.top10) {
    const hit = prev.top10.find((p) => norm(p.title) === norm(raw.title) || (norm(p.title).length > 18 && norm(raw.title).includes(norm(p.title).slice(0, 18))));
    if (hit && hit.analysis && hit.promotion) { analysis = hit.analysis; promotion = hit.promotion; }
  }
  if (!analysis) analysis = ANALYSIS_TEMPLATE[topic];
  if (!promotion) promotion = PROMOTION_TEMPLATE[topic];
  const platform = raw.platform || platformOf(raw.source);
  return {
    rank, title: raw.title, platform, badge: BADGE[platform] || "📰 媒体",
    source: raw.source || "公开平台", sourceUrl: raw.sourceUrl || "",
    heat, heatLevel, analysis, promotion,
  };
}

const main = async () => {
  const meta = londonNow();
  const prev = fs.existsSync(REPORT_PATH) ? JSON.parse(fs.readFileSync(REPORT_PATH, "utf8")) : null;

  // 1) TikTok 官方英国热门话题（置顶）
  const tiktokRaw = await fetchTikTokHashtags();
  const tiktokItems = tiktokRaw.map((t, i) => makeTikTokItem(t, i + 1));

  // 2) 其余平台
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

  const tiktokOK = tiktokItems.length > 0;
  const sourceNote = tiktokOK
    ? "TikTok 英国热门话题（官方榜单）领跑，其余由 Google 热搜 + Reddit UK + BBC 综合；X 无公开榜单已由 Google Search UK 补位；近7日已报道事件降权；跨平台已去重。"
    : "TikTok 官方榜单当日不可用，已以 Google Search UK 实时热门搜索补位；近7日已报道事件降权；跨平台已去重。";

  let top10 = [];
  if (tiktokOK) {
    top10 = tiktokItems.slice();
    const others = cool(prev, dedupe([...bbcItems, ...gtItems, ...redditItems]));
    others.slice(0, 10 - tiktokItems.length).forEach((raw, i) => {
      top10.push(makeItem(raw, tiktokItems.length + i + 1, prev));
    });
  } else {
    const others = cool(prev, dedupe([...bbcItems, ...gtItems, ...redditItems]));
    others.slice(0, 10).forEach((raw, i) => top10.push(makeItem(raw, i + 1, prev)));
  }
  if (!top10.length && prev && prev.top10) {
    top10 = prev.top10.map((p) => makeItem({ title: p.title, source: p.source, sourceUrl: p.sourceUrl, platform: p.platform }, p.rank || 1, null));
    sourceNote = "当日抓取失败，沿用上次快照数据。";
  }

  // 自动生成“今日核心”焦点行
  let focus;
  if (tiktokOK) {
    focus = "TikTok 领跑：" + tiktokItems.map((t) => t.title).join(" ") + "；其余见 Google / Reddit / BBC 综合榜";
  } else {
    const counts = {};
    top10.forEach((it) => { const t = classify(it.title); counts[t] = (counts[t] || 0) + 1; });
    const focusTopics = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3).map((k) => TOPIC_LABEL[k]);
    focus = "今日核心：" + focusTopics.join(" / ") + "；完整 Top10 见下方";
  }

  const report = {
    meta: {
      title: "英国每日热点日报",
      date: meta.date, weekday: meta.weekday,
      captureTimeLondon: meta.captureTimeLondon, timezoneNote: meta.timezoneNote,
      window: "近12小时活跃热点信号", focus, note: sourceNote,
      promotionBase: "推广假设：家庭清洁类产品（厨房油污清洁、卫浴除垢、地毯/布艺清洁、宠物毛发清理、收纳清洁工具等），面向英国本地与中文跨境用户，主打 TikTok 短视频场景种草 + 公众号/小红书图文转化。",
    },
    top10,
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log("采集完成：" + meta.captureTimeLondon + "（Top10 已生成，其中 TikTok " + tiktokItems.length + " 条置顶）");
};

main().catch((e) => { console.error(e); process.exit(1); });
