#!/usr/bin/env node
/**
 * text-png · 透明底文案 PNG 生成器（供后期叠加到画面上）
 * 用法: node text-png.js <spec.json>
 *
 * 排版体系（image2-prompt 技能纪律）：
 *   决定性字体动作 = 竖排大字宋体标题
 *   次级声部       = 竖排英文大写宽字距 + 横排诗句 + 小字元数据
 *   单一强调色     = 鎏金 #C9A15E，正文米白 #F5F1E8
 * 文字全部由浏览器渲染，逐字精确，不依赖图像模型。
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function itemHtml(it) {
  const serif = `"Source Han Serif SC","Noto Serif SC","SimSun",serif`;
  const sans = `"Microsoft YaHei",sans-serif`;
  const paper = "#F5F1E8", gold = "#C9A15E";
  if (it.kind === "main") {
    return `<div class="wrap" style="font-family:${serif}">
      <div class="t">${esc(it.title).replace(/\n/g, "<br>")}</div>
      ${it.sub ? `<div class="s" style="font-family:${sans}">${esc(it.sub)}</div>` : ""}
    </div>
    <style>
      .wrap{display:inline-flex;align-items:flex-start;padding:40px}
      .t{font-size:180px;line-height:1.15;font-weight:700;color:${paper};letter-spacing:18px;writing-mode:vertical-rl}
      .s{font-size:34px;color:${gold};letter-spacing:14px;writing-mode:vertical-rl;margin-top:26px;margin-left:46px;font-weight:400}
    </style>`;
  }
  return `<div class="wrap">
    <div class="vt" style="font-family:${serif}">${esc(it.title)}</div>
    <div class="en" style="font-family:${sans}">${esc(it.en || "")}</div>
    <div class="col">
      <div class="line" style="font-family:${serif}">${esc(it.line).replace(/\n/g, "<br>")}</div>
      <div class="meta" style="font-family:${sans}">${esc(it.meta || "")}</div>
    </div>
  </div>
  <style>
    .wrap{display:inline-flex;align-items:flex-start;gap:34px;padding:40px}
    .vt{font-size:150px;line-height:1.08;font-weight:700;color:${paper};writing-mode:vertical-rl;letter-spacing:10px}
    .en{font-size:26px;color:${gold};letter-spacing:10px;writing-mode:vertical-rl;margin-top:14px;text-transform:uppercase}
    .col{padding-top:16px;max-width:760px}
    .line{font-size:46px;line-height:1.7;color:${paper};letter-spacing:4px;font-weight:600}
    .meta{font-size:26px;color:${gold};letter-spacing:3px;margin-top:26px;opacity:.9}
  </style>`;
}

async function main() {
  const specPath = process.argv[2];
  if (!specPath) { console.error("用法: node text-png.js <spec.json>"); process.exit(1); }
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const dir = path.dirname(path.resolve(specPath));
  const scale = spec.scale || 2;

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1400 },
    deviceScaleFactor: scale,
  });
  for (const it of spec.items) {
    await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent">${itemHtml(it)}</body>`);
    await page.evaluate(() => document.fonts.ready);
    const el = await page.$(".wrap");
    const out = path.join(dir, it.file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await el.screenshot({ path: out, omitBackground: true });
    console.log(`✔ ${out}`);
  }
  await browser.close();
}

main().catch((e) => { console.error("✘ 失败:", e.stack || e); process.exit(1); });
