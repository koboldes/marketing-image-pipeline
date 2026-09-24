#!/usr/bin/env node
/**
 * composite · 双层封面合成（背景层 + 透明文字层 → 封面 PNG）
 * 用法: node composite.js <bg.png> <text.png> <out.png> [宽x高=1360x768] [文字层缩放=1]
 * 文字层须为 RGBA 透明底；两层同画幅（推荐 16:9）。换文案只需重生成文字层再跑本脚本。
 * 缩放>1 放大文字层（居中，等比），如 1.2 = 标题占宽从六成提到约七成二（巨字压图感）。
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
(async () => {
  const [bg, txt, out] = process.argv.slice(2);
  const wh = (process.argv[5] || "1360x768").split("x").map(Number);
  const scale = Number(process.argv[6]) || 1;
  if (!bg || !txt || !out) { console.error("用法: node composite.js <bg> <text> <out> [WxH] [文字宽占比]"); process.exit(1); }
  const url = (p) => path.resolve(p).replace(/\\/g, "/");
  // 文字层始终按自身比例贴放（width=画布宽×scale，height 自适应），水平垂直居中；
  // scale 默认 0.95；背景与文字层同比例时视觉等同旧行为。
  const ts = `width:${Math.round(wh[0] * scale)}px;height:auto;left:50%;top:50%;transform:translate(-50%,-50%);`;
  const html = `<!doctype html><meta charset=utf-8><style>*{margin:0}.c{position:relative;width:${wh[0]}px;height:${wh[1]}px;overflow:hidden}.c img{position:absolute;top:0;left:0;width:100%;height:100%}.c img.t{position:absolute;${ts}}</style><div class="c"><img src="${url(bg)}"><img class="t" src="${url(txt)}"></div>`;
  const tmp = path.join(process.env.TEMP || "/tmp", "li-comp.html");
  fs.writeFileSync(tmp, html);
  const b = await chromium.launch({ channel: "msedge", headless: true });
  const pg = await b.newPage({ viewport: { width: wh[0], height: wh[1] } });
  await pg.goto("file:///" + url(tmp));
  await pg.waitForLoadState("networkidle");
  await pg.screenshot({ path: path.resolve(out) });
  await b.close();
  fs.unlinkSync(tmp);
  console.log(`✔ ${out}  ${wh[0]}×${wh[1]}`);
})();
