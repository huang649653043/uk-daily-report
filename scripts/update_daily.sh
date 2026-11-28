#!/bin/bash
# 英国每日热点日报 · 每日更新脚本
# 由 launchd 每小时调用一次；仅当伦敦时间为 10 点时才真正抓取并生成页面（自动适配 BST/GMT 与本地时区）
# 也可手动运行：bash scripts/update_daily.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p work
HOUR=$(TZ=Europe/London date +%H)
echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] London hour=$HOUR" >> work/cron.log
if [ "$HOUR" != "10" ]; then
  exit 0
fi
echo "--- 开始更新 ---" >> work/cron.log
node scripts/fetch_data.mjs >> work/cron.log 2>&1
node scripts/build_page.mjs >> work/cron.log 2>&1
node scripts/build_miniprogram.mjs >> work/cron.log 2>&1
echo "--- 更新完成 ---" >> work/cron.log
