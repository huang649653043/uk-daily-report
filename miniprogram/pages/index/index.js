const report = require("../../data/report.js");

Page({
  data: {
    meta: null,
    top10: []
  },
  onLoad() {
    const r = report || {};
    this.setData({ meta: r.meta || null, top10: r.top10 || [] });
  },
  // 分享给朋友 / 群
  onShareAppMessage() {
    const m = this.data.meta || {};
    return {
      title: (m.title || "英国每日热点日报") + " · " + (m.date || "") + " Top10 已更新",
      path: "/pages/index/index"
    };
  },
  // 分享到朋友圈
  onShareTimeline() {
    const m = this.data.meta || {};
    return { title: (m.title || "英国每日热点日报") + " · " + (m.date || "") };
  }
});
