#!/usr/bin/env node
/**
 * marketing-image-pipeline 体内渲染引擎
 * （vendored from longimage v1.5.1 + 本技能专属扩展：specs 参数表 / compare 对比屏 / taobao 平台）
 * 用法: node render.js <config.json> [--out 输出.png]
 *
 * 流程: 读取 JSON 配置(图片顺序+文案+风格) -> 拼装固定宽度 HTML ->
 *       无头 Edge 整页截图 -> 超过单图高度上限时自动等分切图。
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const PLATFORMS = {
  xiaohongshu: { width: 1080, maxSliceHeight: 3240 }, // 1:3
  moments:     { width: 1080, maxSliceHeight: 3240 },
  douyin:      { width: 1242, maxSliceHeight: 3726 }, // 1:3
  taobao:      { width: 750,  maxSliceHeight: 15000 }, // 商详宽 750；淘宝对单图高宽容
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// #hex -> "r,g,b"（拼 rgba() 用）
const hx = (h) => { h = String(h).replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(","); };
// 相对亮度 0-1：accent 偏亮时色带文字自动转深（白字压金底=对比度不合格）
const lum = (h) => { const [r, g, b] = hx(h).split(",").map((v) => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

const themeOf = (cfg) => Object.assign({ bg: "#FFF8F3", ink: "#33292a", accent: "#E8505B", card: "#ffffff" }, cfg.theme || {});

// 读取图片像素尺寸（PNG IHDR / JPEG SOF / SVG 声明）
function measureImage(file) {
  const b = fs.readFileSync(file);
  if (b.slice(1, 4).toString() === "PNG") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const mk = b[o + 1];
      if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc)
        return { h: b.readUInt16BE(o + 5), w: b.readUInt16BE(o + 7) };
      o += 2 + b.readUInt16BE(o + 2);
    }
  }
  const s = b.toString("utf8", 0, 2000);
  const wm = /width="(\d+)/.exec(s), hm = /height="(\d+)/.exec(s);
  return { w: +(wm && wm[1]) || 1, h: +(hm && hm[1]) || 1 };
}

// 图墙布局：整行图(wall) / 双列配对行(wall-row) / 文字色块格(tile)
function buildWall(cfg, cfgDir, w, th) {
  const half = w / 2;
  const natH = (src, cw) => { const m = measureImage(path.resolve(cfgDir, src)); return Math.round((cw * m.h) / m.w); };
  const txt = (ti) => `<div class="tt">${esc(ti.title)}</div><div class="tl">${esc(ti.line).replace(/\n/g, "<br>")}</div>` +
    (ti.note ? `<div class="tn">${esc(ti.note)}</div>` : "");
  const imgCell = (b, cw, h, flex) =>
    `<div class="wcell"${flex ? ' style="flex:1"' : ` style="width:${cw}px;height:${h}px"`}>` +
    `<img src="${esc(path.resolve(cfgDir, b.src).replace(/\\/g, "/"))}"${b.pos ? ` style="object-position:${esc(b.pos)}"` : ""}></div>`;
  const cell = (b, cw, flex) => b.type === "tile"
    ? `<div class="wcell wt-${b.tone || "dark"}"${flex ? ' style="flex:1"' : ""}><div class="wtile">${txt(b)}</div></div>`
    : imgCell(b, cw, b.h || natH(b.src, cw), flex);
  const out = [];
  for (const b of cfg.blocks || []) {
    if (b.type === "wall") out.push(imgCell(b, w, b.h || natH(b.src, w)));
    else if (b.type === "tile") out.push(`<div class="wband wt-${b.tone || "dark"}">${txt(b)}</div>`);
    else if (b.type === "wall-row") {
      const leftH = b.left.h || natH(b.left.src, half);
      out.push(`<div class="wrow">` +
        `<div class="wcol" style="height:${leftH}px;width:${half}px">${cell(b.left, half)}</div>` +
        `<div class="wcol" style="height:${leftH}px;width:${half}px">${(b.right || []).map((r) => cell(r, half, !!r.fill)).join("")}</div>` +
        `</div>`);
    } else {
      // 顺排块（text/heading/section/features/cards/cta/quote/list/steps/spacer/image）混入墙流
      const inner = buildBlocks([b], cfg).html;
      if (!inner) throw new Error(`wall 布局不支持块类型: ${b.type}`);
      out.push(`<div class="wflow">${inner}</div>`);
    }
  }
  return out.join("");
}

function buildBlocks(blocks, cfg) {
  const w = cfg._width;
  const t = themeOf(cfg);
  const pad = Math.round(w * 0.066); // 约 72px @1080
  const html = [];
  for (const b of blocks) {
    switch (b.type) {
      case "image": {
        const cap = b.caption ? `<div class="cap">${esc(b.caption)}</div>` : "";
        const r = b.square ? " sq" : "";
        const fb = b.fullbleed ? " fb" : "";
        const sm = b.seamless ? " seam" : "";
        let ov = "";
        if (b.overlay) {
          const o = b.overlay;
          ov = `<div class="ov ${o.pos || "tl"}"${o.at ? ` style="${o.at}"` : ""}>` +
            (o.title ? `<div class="ovt">${esc(o.title)}</div>` : "") +
            (o.en ? `<div class="ove">${esc(o.en)}</div>` : "") +
            (o.line || o.meta
              ? `<div class="ovb">${o.line ? `<p class="ovl">${esc(o.line).replace(/\n/g, "<br>")}</p>` : ""}` +
                (o.meta ? `<p class="ovm">${esc(o.meta)}</p>` : "") +
                `</div>`
              : "") +
            `</div>`;
        }
        const ovs = b.overlay && b.overlay.scrim ? `<div class="ovs"${b.overlay.scrim === "top" ? ' style="background:linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,.05) 60%)"' : ""}></div>` : "";
        const fixh = b.h ? ` style="height:${b.h}px;overflow:hidden"` : "";
        const fixi = b.h ? ` style="height:100%;object-fit:cover${b.pos ? `;object-position:${esc(b.pos)}` : ""}"` : "";
        html.push(`<figure class="img${r}${fb}${sm}"${fixh}>${ov}${ovs}<img src="${esc(b._src)}" alt=""${fixi}>${cap}</figure>`);
        break;
      }
      case "heading":
        html.push(`<h2>${esc(b.text)}</h2>`);
        break;
      case "text":
        html.push(`<p${b.center ? ' class="tc"' : ""}>${esc(b.text).replace(/\n/g, "<br>")}</p>`);
        break;
      case "quote":
        html.push(`<blockquote>${esc(b.text)}</blockquote>`);
        break;
      case "list":
        html.push(`<ul>${(b.items || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`);
        break;
      case "steps": // 编号步骤条：cols:2 转宫格（服务流程 2×2）
        html.push(
          `<ol class="steps${b.cols === 2 ? " g2" : ""}">${(b.items || []).map((i) => `<li><span>${esc(i)}</span></li>`).join("")}</ol>`
        );
        break;
      case "divider":
        html.push(`<div class="divider"></div>`);
        break;
      case "section": // 居中节标题：kicker 英文眉题 + 大字标题 + 副题（title 支持 \n）
        html.push(`<div class="blk-section"><div class="kicker">${esc(b.kicker || "")}</div>` +
          `<div class="t">${esc(b.title).replace(/\n/g, "<br>")}</div>` +
          (b.sub ? `<div class="sub">${esc(b.sub)}</div>` : "") + `</div>`);
        break;
      case "features": // 卖点网格：cols 列数(默认2) center 居中 noidx 去编号
        html.push(`<div class="feat${b.center ? " fc" : ""}" style="grid-template-columns:repeat(${b.cols || 2},1fr)">` +
          (b.items || []).map((f, i) =>
            `<div class="fi">${b.noidx ? "" : `<div class="idx">${String(i + 1).padStart(2, "0")}</div>`}` +
            `<div class="t">${esc(f.t)}</div>` +
            (f.d ? `<div class="d">${esc(f.d)}</div>` : "") + `</div>`).join("") + `</div>`);
        break;
      case "cards": // 案例卡片：图（或 ph 中性占位）+ 标题 + 右侧 tag
        html.push(`<div class="cards">${(b.items || []).map((c) =>
          `<div class="ci"><div class="im">${c._src ? `<img src="${esc(c._src)}">` : `<div class="ph">${esc(c.ph || "图片占位")}</div>`}</div>` +
          `<div class="cap"><span>${esc(c.title)}</span>` +
          (c.tag ? `<span class="tag">${esc(c.tag)}</span>` : "") + `</div></div>`).join("")}</div>`);
        break;
      case "cover": { // 封面块：背景图 + 导语浮层（标题已合成在背景里）；place:"top" 顶部留白压字，默认底部+遮罩
        const m = measureImage(path.resolve(cfg._dir, b.bg));
        const ch = b.h || Math.round((w * m.h) / m.w);
        const top = b.place === "top";
        const scrim = b.scrim ?? (top ? 0 : 0.6);
        const grad = scrim > 0 ? `linear-gradient(180deg,rgba(${hx(t.bg)},0) 52%,rgba(${hx(t.bg)},${scrim}) 100%),` : "";
        html.push(`<div class="cover${top ? " top" : ""}" style="height:${ch}px;background-position:${esc(b.pos || (top ? "50% 0%" : "50% 45%"))};background-image:${grad}url('file:///${esc(path.resolve(cfg._dir, b.bg).replace(/\\/g, "/"))}')">` +
          (b.t ? `<div class="cv-t">${esc(b.t).replace(/\n/g, "<br>")}</div>` : "") +
          (b.d ? `<div class="cv-d">${esc(b.d).replace(/\n/g, "<br>")}</div>` : "") + `</div>`);
        break;
      }
      case "lede": // 导语带：封面下方过渡区，粗体主张 + 淡色说明（t/d 均支持 \n 手动断行）
        html.push(`<div class="lede"><div class="lt">${esc(b.t).replace(/\n/g, "<br>")}</div>` +
          (b.d ? `<div class="ld">${esc(b.d).replace(/\n/g, "<br>")}</div>` : "") + `</div>`);
        break;
      case "band": // 色带容器：把子块包进全幅强调色背景（cobalt/主题 accent），首尾呼应用；亮 accent 自动转深字
        html.push(`<div class="cband${b.tone === "accent" ? " acc" : ""}${b.tone === "accent" && lum(t.accent) > 0.5 ? " bright" : ""}">${buildBlocks(b.blocks || [], cfg).html}</div>`);
        break;
      case "cta": // 结尾行动号召：居中大字 + 多行信息（title 支持 \n；占位勿虚构）
        html.push(`<div class="cta"><div class="t">${esc(b.title).replace(/\n/g, "<br>")}</div>` +
          (b.lines || []).map((l) => `<div class="l">${esc(l)}</div>`).join("") + `</div>`);
        break;
      case "spacer":
        html.push(`<div style="height:${b.h || 40}px"></div>`);
        break;
      case "band": // 纯色文字横幅
        html.push(`<div class="band"><p>${esc(b.text).replace(/\n/g, "<br>")}</p></div>`);
        break;
      case "specs": { // 参数表：title(可选) rows[[键,值],...] note(可选，事实核查提示挂这)
        if (!b.rows || !b.rows.length) throw new Error("specs 块缺少 rows");
        html.push(`<div class="blk-specs">` +
          (b.title ? `<div class="st">${esc(b.title)}</div>` : "") +
          `<table>${b.rows.map((r) => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join("")}</table>` +
          (b.note ? `<div class="sn">${esc(b.note)}</div>` : "") + `</div>`);
        break;
      }
      case "compare": { // 对比屏：title(可选) head[我方名,对方名] rows[[维度,我方,对方],...] win:"left"|"right" 默认 left
        if (!b.rows || !b.rows.length) throw new Error("compare 块缺少 rows");
        const head = b.head || ["本品", "普通款"];
        const winCls = b.win === "right" ? ["cmp-dim", "cmp-win"] : ["cmp-win", "cmp-dim"];
        html.push(`<div class="blk-cmp">` +
          (b.title ? `<div class="st">${esc(b.title)}</div>` : "") +
          `<div class="ch"><span class="cd"></span><span class="ca ${winCls[0]}">${esc(head[0])}</span><span class="cb ${winCls[1]}">${esc(head[1])}</span></div>` +
          b.rows.map((r) => `<div class="cr"><span class="cd">${esc(r[0])}</span><span class="ca ${winCls[0]}">${esc(r[1])}</span><span class="cb ${winCls[1]}">${esc(r[2])}</span></div>`).join("") +
          `</div>`);
        break;
      }
      case "wallrows": { // 规划图墙：rows 项 {cat}=类目标签行 | [a,b]=等宽双列(行高取左图比例,右图 cover 裁齐) | {src,h?}=通栏行(h 定高裁切)
        const inner = w - pad * 2;
        const gap = 4, half = (inner - gap) / 2; // 半宽含缝精确等分，双列行与通栏行右缘严格对齐
        const cell = (src, cw, ch, pos) => `<div class="wrc" style="width:${cw}px;height:${ch}px"><img src="${esc(path.resolve(cfg._dir, src).replace(/\\/g, "/"))}"${pos ? ` style="object-position:${esc(pos)}"` : ""}></div>`;
        let ci = 0;
        html.push(`<div class="wrg">` + (b.rows || []).map((r) => {
          if (r.cat) return `<div class="wrcat"><span class="wi">${String(++ci).padStart(2, "0")}</span><span class="wt">${esc(r.cat)}</span></div>`;
          if (Array.isArray(r)) {
            const m = measureImage(path.resolve(cfg._dir, r[0]));
            const ch = Math.round((half * m.h) / m.w);
            return `<div class="wrr">` + r.map((s) => cell(s, half, ch)).join("") + `</div>`;
          }
          const m = measureImage(path.resolve(cfg._dir, r.src));
          return `<div class="wrr">` + cell(r.src, inner, r.h || Math.round((inner * m.h) / m.w), r.pos) + `</div>`;
        }).join("") + `</div>`);
        break;
      }
      case "placeholder": { // 中性占位块：无素材时的构图校对，颜色全从主题派生，不引入外来色
        const [rw, rh] = String(b.ratio || "16:9").split(":").map(Number);
        const ph = Math.round((w - pad * 2) * rh / rw);
        html.push(`<div class="blk-ph" style="height:${ph}px"><span>${esc(b.label || "图片占位")} · ${b.ratio || "16:9"}</span></div>`);
        break;
      }
      default:
        throw new Error(`未知 block 类型: ${b.type}`);
    }
  }
  return { html: html.join("\n"), pad };
}

function buildHtml(cfg) {
  const w = cfg._width;
  const t = Object.assign({ bg: "#FFF8F3", ink: "#33292a", accent: "#E8505B", card: "#ffffff" }, cfg.theme || {});
  const style = cfg.style || "xiaohongshu";
  const { html: body, pad } = cfg.layout === "wall"
    ? { html: "", pad: Math.round(w * 0.066) }
    : buildBlocks(cfg.blocks || [], cfg);
  const font = `"PingFang SC","Microsoft YaHei","Source Han Sans SC","Noto Sans SC",sans-serif`;
  const serif = `"Source Han Serif SC","Noto Serif SC","SimSun",serif`;

  const styleCss = {
    xiaohongshu: `
      body{background:${t.bg};color:${t.ink};font-family:${font}}
      .hero h1{font-size:${Math.round(w * 0.075)}px;line-height:1.25;font-weight:800}
      .hero .sub{font-size:${Math.round(w * 0.033)}px;opacity:.75;margin-top:${Math.round(w * 0.022)}px}
      h2{font-size:${Math.round(w * 0.048)}px;margin:${Math.round(w * 0.075)}px 0 ${Math.round(w * 0.03)}px}
      h2::before{content:"";display:inline-block;width:${Math.round(w * 0.028)}px;height:${Math.round(w * 0.028)}px;background:${t.accent};border-radius:999px;margin-right:${Math.round(w * 0.022)}px;vertical-align:baseline}
      p,li{font-size:36px;line-height:1.75}
      figure.img{margin:${Math.round(w * 0.05)}px 0}
      figure.img img{width:100%;display:block;border-radius:${Math.round(w * 0.037)}px;box-shadow:0 12px 40px rgba(0,0,0,.10)}
      figure.img.sq img{aspect-ratio:1/1;object-fit:cover}
      figcaption,.cap{font-size:30px;opacity:.6;text-align:center;margin-top:18px}
      blockquote{margin:${Math.round(w * 0.06)}px 0;padding:${Math.round(w * 0.045)}px;background:${t.card};border-left:${Math.round(w * 0.012)}px solid ${t.accent};border-radius:0 ${Math.round(w * 0.028)}px ${Math.round(w * 0.028)}px 0;font-size:38px;line-height:1.7;font-weight:600}
      ol.steps{counter-reset:n;list-style:none;padding:0}
      ol.steps li{counter-increment:n;display:flex;gap:24px;align-items:flex-start;margin:28px 0}
      ol.steps li::before{content:counter(n);flex:0 0 auto;width:56px;height:56px;border-radius:999px;background:${t.accent};color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:32px}
      .divider{margin:${Math.round(w * 0.09)}px 0;text-align:center;color:${t.accent};letter-spacing:${Math.round(w * 0.03)}px;font-size:34px}
      .band{background:${t.accent};color:#fff;margin:${Math.round(w * 0.075)}px -${pad}px;padding:${Math.round(w * 0.05)}px ${pad}px}
      .band p{font-size:40px;font-weight:700;line-height:1.6}
      .footer{margin-top:${Math.round(w * 0.09)}px;padding-top:${Math.round(w * 0.04)}px;border-top:2px dashed rgba(0,0,0,.18);font-size:30px;opacity:.55;text-align:center}
    `,
    magazine: `
      body{background:${t.bg};color:${t.ink};font-family:${font}}
      .hero{border-top:${Math.round(w * 0.016)}px solid ${t.ink};padding-top:${Math.round(w * 0.04)}px}
      .hero h1{font-size:${Math.round(w * 0.082)}px;line-height:1.2;font-weight:900;letter-spacing:2px}
      .hero .sub{font-size:${Math.round(w * 0.033)}px;letter-spacing:${Math.round(w * 0.012)}px;margin-top:${Math.round(w * 0.02)}px;text-transform:uppercase;opacity:.7}
      h2{font-size:${Math.round(w * 0.05)}px;margin:${Math.round(w * 0.09)}px 0 ${Math.round(w * 0.035)}px;border-bottom:2px solid ${t.ink};padding-bottom:16px}
      p,li{font-size:36px;line-height:1.85}
      figure.img{margin:${Math.round(w * 0.055)}px 0}
      figure.img img{width:100%;display:block}
      figure.img.sq img{aspect-ratio:1/1;object-fit:cover}
      figcaption,.cap{font-size:28px;opacity:.6;margin-top:16px;font-style:italic}
      blockquote{margin:${Math.round(w * 0.07)}px ${Math.round(w * 0.05)}px;font-size:44px;line-height:1.6;font-weight:700;border-top:2px solid ${t.accent};border-bottom:2px solid ${t.accent};padding:${Math.round(w * 0.04)}px 0;text-align:center}
      ol.steps{list-style:decimal;padding-left:60px}
      ol.steps li{font-size:36px;line-height:1.8;margin:24px 0}
      .divider{margin:${Math.round(w * 0.09)}px 0;text-align:center;font-size:32px;letter-spacing:${Math.round(w * 0.03)}px}
      .band{background:${t.ink};color:${t.bg};margin:${Math.round(w * 0.08)}px -${pad}px;padding:${Math.round(w * 0.055)}px ${pad}px}
      .band p{font-size:40px;font-weight:700;line-height:1.6;text-align:center}
      .footer{margin-top:${Math.round(w * 0.1)}px;padding-top:${Math.round(w * 0.035)}px;border-top:1px solid rgba(0,0,0,.3);font-size:28px;opacity:.6;text-align:center;letter-spacing:2px}
    `,
    minimal: `
      body{background:${t.bg};color:${t.ink};font-family:${font}}
      .hero{padding-top:${Math.round(w * 0.04)}px}
      .hero h1{font-size:${Math.round(w * 0.068)}px;line-height:1.35;font-weight:600}
      .hero .sub{font-size:${Math.round(w * 0.032)}px;opacity:.55;margin-top:${Math.round(w * 0.02)}px}
      h2{font-size:${Math.round(w * 0.042)}px;margin:${Math.round(w * 0.11)}px 0 ${Math.round(w * 0.035)}px;font-weight:600}
      p,li{font-size:36px;line-height:1.85;opacity:.82}
      figure.img{margin:${Math.round(w * 0.05)}px 0}
      figure.img img{width:100%;display:block;border-radius:8px}
      figure.img.fb{margin-left:-${pad}px;margin-right:-${pad}px;width:calc(100% + ${pad * 2}px)}
      figure.img.fb img{border-radius:0}
      figure.img.sq img{aspect-ratio:1/1;object-fit:cover}
      figcaption,.cap{font-size:28px;opacity:.5;margin-top:14px}
      blockquote{margin:${Math.round(w * 0.08)}px 0;padding-left:${Math.round(w * 0.04)}px;border-left:3px solid ${t.accent};font-size:40px;line-height:1.65}
      ol.steps{list-style:decimal;padding-left:56px}
      ol.steps li{font-size:36px;line-height:1.8;margin:24px 0}
      .divider{margin:${Math.round(w * 0.12)}px 0;border-top:1px solid rgba(128,128,128,.35)}
      .band{background:${t.accent};border-radius:16px;padding:${Math.round(w * 0.05)}px;margin:${Math.round(w * 0.07)}px 0}
      .band p{color:#fff;opacity:1;font-weight:600}
      .footer{margin-top:${Math.round(w * 0.12)}px;padding-top:${Math.round(w * 0.035)}px;border-top:1px solid rgba(128,128,128,.35);font-size:28px;opacity:.5;text-align:center}
    `,
  }[style];
  if (!styleCss) throw new Error(`未知风格: ${style}（可选 xiaohongshu / magazine / minimal）`);

  const hero = cfg.title
    ? `<header class="hero${cfg.display_title ? " display" : ""}${cfg.hero_sans ? " sans" : ""}${cfg.hero_center ? " center" : ""}${cfg.hero_bg ? " bg" : ""}${cfg.hero_sub_flank ? " flank" : ""}">` +
      (cfg.badge ? `<div class="badge">${esc(cfg.badge)}</div>` : "") +
      `<h1>${esc(cfg.title).replace(/\n/g, "<br>")}</h1>${cfg.subtitle ? `<div class="sub">${esc(cfg.subtitle).replace(/\n/g, "<br>")}</div>` : ""}` +
      (cfg.hero_lede || []).map((l, i) => `<p class="hl${i ? " dim" : ""}">${esc(l).replace(/\n/g, "<br>")}</p>`).join("") +
      `</header>`
    : "";
  const dividerChar = cfg.style === "magazine" ? "◆ ◆ ◆" : "· · ·";
  const bodyHtml = body.replace(/<div class="divider"><\/div>/g,
    `<div class="divider">${dividerChar}</div>`);
  const footer = cfg.footer ? `<footer class="footer">${esc(cfg.footer)}</footer>` : "";

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=${w}">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${w}px}
  .page{width:${w}px;padding:${pad}px}
  img{max-width:100%}
  figure.img{position:relative}
  figure.img.seam{margin:0}
  .ov{position:absolute;display:flex;gap:26px;align-items:flex-start;text-shadow:0 2px 30px rgba(0,0,0,.65),0 1px 4px rgba(0,0,0,.55);z-index:2}
  .img .ovs{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.02) 45%,rgba(0,0,0,.58));pointer-events:none;z-index:1}
  .ov.tl{top:56px;left:56px}.ov.tr{top:56px;right:56px}
  .ov.bl{bottom:56px;left:56px}.ov.br{bottom:56px;right:56px}
  .ov.tc{top:56px;left:50%;transform:translateX(-50%)}.ov.bc{bottom:56px;left:50%;transform:translateX(-50%)}
  .ovt{font-family:${serif};font-size:128px;line-height:1.06;font-weight:700;color:#F5F1E8;writing-mode:vertical-rl;letter-spacing:8px}
  .ove{font-size:24px;color:#C9A15E;letter-spacing:9px;writing-mode:vertical-rl;margin-top:12px;text-transform:uppercase}
  .ovb{padding-top:10px;max-width:560px}
  .ovl{font-family:${serif};font-size:42px;line-height:1.6;color:#F5F1E8;font-weight:600;letter-spacing:3px;max-width:620px}
  .ovm{font-size:24px;color:#C9A15E;letter-spacing:3px;margin-top:20px}
  .hero .badge{display:inline-block;border:1.5px solid ${t.accent};color:${t.accent};font-size:26px;letter-spacing:6px;padding:12px 32px;border-radius:999px;margin-bottom:30px}
  .hero.sans h1,.hero.display.sans h1{font-family:${font};font-weight:800;letter-spacing:2px}
  .hero.sans .sub,.hero.display.sans .sub{font-family:${font};font-weight:600;letter-spacing:5px}
  .hero.bg{background-image:linear-gradient(rgba(${hx(t.bg)},${cfg.hero_bg_scrim ?? 0.45}),rgba(${hx(t.bg)},${cfg.hero_bg_scrim ?? 0.45})),url('file:///${cfg._hero_bg}');background-size:cover;background-position:center 38%;margin-left:-${pad}px;margin-right:-${pad}px;padding:${Math.round(w * 0.1)}px ${pad}px ${Math.round(w * 0.075)}px}
  .hero.flank .sub{display:flex;justify-content:center;align-items:center;gap:26px}
  .hero.flank .sub::before,.hero.flank .sub::after{content:"";flex:0 0 64px;height:2px;background:${t.accent};opacity:.55}
  .hero .hl{font-family:${font};font-size:34px;font-weight:700;letter-spacing:3px;margin-top:34px}
  .hero .hl.dim{font-size:29px;font-weight:400;opacity:.78;line-height:1.75;margin-top:16px;letter-spacing:1px}
  .tc{text-align:center}
  .lede{background:linear-gradient(180deg,${cfg.lede_from || "#E7E4DE"} 0%,${t.bg} 92%);margin:0 -${pad}px;padding:${Math.round(w * 0.05)}px ${pad}px ${Math.round(w * 0.062)}px;text-align:center}
  .cband{background:linear-gradient(160deg,#20307E 0%,${t.accent} 100%);color:#fff;margin:0 -${pad}px;padding:${Math.round(w * 0.02)}px ${pad}px ${Math.round(w * 0.05)}px}
  .cband.acc{background:${t.accent}}
  .cband .blk-section .kicker{color:#A9BCFF}
  .cband .blk-section .t{color:#fff}
  .cband .blk-section .sub{color:rgba(255,255,255,.6)}
  .cband .feat .fi{border-top-color:rgba(255,255,255,.22)}
  .cband .feat .idx{color:#A9BCFF}
  .cband .feat .t{color:#fff}
  .cband .feat .d{color:rgba(255,255,255,.72)}
  .cband .cta{border-top-color:rgba(255,255,255,.28)}
  .cband .cta .l{color:rgba(255,255,255,.85);opacity:1}
  .cband.acc.bright{color:#1A1305}
  .cband.acc.bright .cta{border-top-color:rgba(26,19,5,.25)}
  .cband.acc.bright .cta .l{color:rgba(26,19,5,.78)}
  .lede .lt{display:inline-flex;align-items:center;gap:28px;font-size:38px;font-weight:800;letter-spacing:6px}
  ${cfg.lede_flank !== false ? `.lede .lt::before,.lede .lt::after{content:"";flex:0 0 44px;height:2px;background:${t.accent};opacity:.6}` : ""}
  .lede .ld{font-size:28px;line-height:1.9;letter-spacing:1px;opacity:.7;margin-top:20px}
  .cover{background-size:cover;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;text-align:center;margin:0 -${pad}px;padding:0 ${pad}px ${Math.round(w * 0.05)}px}
  .cover.top{justify-content:flex-start;padding:${Math.round(w * 0.09)}px ${pad}px 0}
  .cover .cv-t{font-size:38px;font-weight:800;letter-spacing:5px}
  .cover .cv-d{font-size:28px;letter-spacing:1px;opacity:.72;margin-top:14px;line-height:1.7}
  .hero.center{text-align:center}
  .hero.center .sub{margin-left:auto;margin-right:auto}
  .hero.display{text-align:center;padding:${Math.round(w * 0.05)}px 0 ${Math.round(w * 0.02)}px}
  .blk-section{text-align:center;margin:${Math.round(w * 0.1)}px 0 ${Math.round(w * 0.04)}px}
  .blk-section .kicker{color:${t.accent};font-size:24px;letter-spacing:8px;text-transform:uppercase}
  .blk-section .t{font-family:${serif};font-size:${Math.round(w * 0.063)}px;font-weight:700;letter-spacing:4px;margin:16px 0 10px}
  .blk-section .sub{font-size:28px;opacity:.55;letter-spacing:2px}
  .feat{display:grid;grid-template-columns:1fr 1fr;gap:0 56px;margin:${Math.round(w * 0.04)}px 0}
  .feat .fi{padding:34px 0;border-top:1px solid rgba(128,128,128,.3)}
  .feat .idx{color:${t.accent};font-size:22px;letter-spacing:3px}
  .feat .t{font-family:${serif};font-size:44px;font-weight:700;margin:10px 0 6px;letter-spacing:2px}
  .feat .d{font-size:26px;opacity:.6;line-height:1.6}
  .feat.fc{gap:0 28px}
  .feat.fc .fi{text-align:center;padding:30px 8px}
  .feat.fc .t{font-size:42px;letter-spacing:3px;margin:0}
  .cards{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin:${Math.round(w * 0.04)}px 0}
  .cards .ci:last-child:nth-child(odd){grid-column:1/-1}
  .cards .ci:last-child:nth-child(odd) .im{aspect-ratio:16/9}
  .cards .im{aspect-ratio:4/3;overflow:hidden;border-radius:6px}
  .cards .im img{width:100%;height:100%;object-fit:cover;display:block}
  .cards .cap{display:flex;justify-content:space-between;align-items:center;margin-top:16px;font-size:28px;letter-spacing:1px}
  .cards .tag{color:${t.accent};font-size:22px;letter-spacing:2px;white-space:nowrap}
  .cta{text-align:center;margin:${Math.round(w * 0.11)}px 0 ${Math.round(w * 0.04)}px;padding:${Math.round(w * 0.06)}px 0 0;border-top:1px solid rgba(128,128,128,.35)}
  .cta .t{font-family:${serif};font-size:${Math.round(w * 0.054)}px;font-weight:700;letter-spacing:4px}
  ${cfg.head_sans ? `.feat .t,.blk-section .t,.cta .t,.lede .lt,.ovl,.blk-specs .st,.blk-cmp .st{font-family:${font}}` : ""}
  ${cfg.feat_borders === false ? `.feat .fi,.feat.fc .fi{border-top:0;padding-top:22px}` : ""}
  .cta .l{font-size:28px;opacity:.65;margin-top:18px;letter-spacing:2px}
  .blk-specs{margin:${Math.round(w * 0.05)}px 0}
  .blk-specs .st,.blk-cmp .st{font-family:${serif};font-size:${Math.round(w * 0.05)}px;font-weight:700;letter-spacing:3px;margin-bottom:${Math.round(w * 0.03)}px}
  .blk-specs table{width:100%;border-collapse:collapse}
  .blk-specs th{width:28%;text-align:left;font-weight:600;opacity:.55;font-size:28px;padding:${Math.round(w * 0.024)}px ${Math.round(w * 0.02)}px ${Math.round(w * 0.024)}px 0;border-bottom:1px solid rgba(128,128,128,.28);vertical-align:top}
  .blk-specs td{font-size:30px;line-height:1.6;padding:${Math.round(w * 0.024)}px 0;border-bottom:1px solid rgba(128,128,128,.28)}
  .blk-specs .sn{font-size:26px;opacity:.6;margin-top:22px;line-height:1.6}
  .blk-cmp{margin:${Math.round(w * 0.05)}px 0}
  .blk-cmp .ch,.blk-cmp .cr{display:grid;grid-template-columns:1.1fr 1.5fr 1.5fr;gap:${Math.round(w * 0.012)}px;margin-bottom:${Math.round(w * 0.012)}px}
  ol.steps.g2{list-style:none;padding:0;counter-reset:n;display:grid;grid-template-columns:1fr 1fr;gap:12px 40px;margin:${Math.round(w * 0.04)}px 0}
  ol.steps.g2 li{counter-increment:n;display:flex;gap:22px;align-items:center;margin:14px 0;font-size:34px;font-weight:600;letter-spacing:2px;line-height:1.5}
  ol.steps.g2 li::before{content:counter(n);flex:0 0 auto;width:64px;height:64px;border-radius:999px;background:${t.accent};color:${lum(t.accent) > 0.5 ? "#1A1305" : "#fff"};font-weight:800;display:flex;align-items:center;justify-content:center;font-size:30px}
  .wrg{display:flex;flex-direction:column;gap:4px;margin:${Math.round(w * 0.04)}px 0}
  .wrcat{display:flex;align-items:baseline;gap:20px;margin-top:30px;margin-bottom:6px}
  .wrcat .wi{font-size:26px;font-weight:700;letter-spacing:2px;color:${t.accent}}
  .wrcat .wt{font-family:${serif};font-size:46px;font-weight:700;letter-spacing:5px;color:${t.ink}}
  .wrr{display:flex;gap:4px}
  .wrc{overflow:hidden;flex:0 0 auto}
  .wrc img{width:100%;height:100%;object-fit:cover;display:block}
  .blk-ph{margin:${Math.round(w * 0.05)}px 0;background:rgba(${hx(t.ink)},.055);border:2px dashed rgba(${hx(t.ink)},.2);border-radius:12px;display:flex;align-items:center;justify-content:center}
  .blk-ph span{font-size:26px;letter-spacing:8px;color:rgba(${hx(t.ink)},.34)}
  .cards .im .ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(${hx(t.ink)},.055);font-size:24px;letter-spacing:5px;color:rgba(${hx(t.ink)},.34)}
  .blk-cmp .cd{font-size:27px;opacity:.62;display:flex;align-items:center;padding:0 ${Math.round(w * 0.016)}px}
  .blk-cmp .ca,.blk-cmp .cb{font-size:29px;line-height:1.55;padding:${Math.round(w * 0.02)}px ${Math.round(w * 0.016)}px;text-align:center;display:flex;align-items:center;justify-content:center;border-radius:8px}
  .blk-cmp .cmp-win{background:${t.accent};color:#fff;font-weight:700;letter-spacing:1px}
  .blk-cmp .cmp-dim{background:rgba(128,128,128,.14);opacity:.78}
  .blk-cmp .ch{font-size:31px;font-weight:700}
  .hero.display h1{font-family:${serif};font-size:${cfg.title_px || Math.round(w * 0.13)}px;line-height:1.15;font-weight:700;letter-spacing:${Math.round(w * 0.014)}px}
  .hero.display .sub{font-size:${Math.round(w * 0.028)}px;color:${t.accent};letter-spacing:${Math.round(w * 0.012)}px;margin-top:${Math.round(w * 0.02)}px;font-weight:400;opacity:1}
  .hero.display::after{content:"";display:block;width:${Math.round(w * 0.06)}px;height:2px;background:${t.accent};margin:${Math.round(w * 0.035)}px auto 0}
  .wall{width:${w}px}
  .wflow{padding:0 ${Math.round(w * 0.066)}px}
  .wrow{display:flex}
  .wcol{display:flex;flex-direction:column}
  .wcell{overflow:hidden;flex:0 0 auto}
  .wcell img{width:100%;height:100%;object-fit:cover;display:block}
  .wband{display:flex;align-items:baseline;gap:40px;padding:46px 72px}
  .wband .tt{font-family:${serif};font-size:${Math.round(w * 0.057)}px;font-weight:700;letter-spacing:8px;line-height:1.15}
  .wband .tl{font-size:30px;letter-spacing:4px;opacity:.9}
  .wband .tn{font-size:24px;letter-spacing:2px;opacity:.6}
  .wtile{height:100%;padding:44px;display:flex;flex-direction:column;justify-content:flex-end;gap:20px}
  .wtile .tt{font-family:${serif};font-size:64px;font-weight:700;letter-spacing:6px;line-height:1.15}
  .wtile .tl{font-size:28px;letter-spacing:3px;line-height:1.6;opacity:.9}
  .wtile .tn{font-size:22px;letter-spacing:2px;opacity:.6}
  .wt-gold{background:${t.accent};color:#1A1305}
  .wt-dark{background:#16131A;color:#EAE5DB}
  .wt-paper{background:#EAE5DB;color:#241C10}
  ${styleCss}
</style></head>
<body>${cfg.layout === "wall"
    ? `${hero ? `<div class="page">${hero}</div>` : ""}<div class="wall">${buildWall(cfg, cfg._dir, w, t)}</div>`
    : `<div class="page">${hero}${bodyHtml}${footer}</div>`}</body></html>`;
}

// ---- 纯 Node PNG 编解码（zlib 内置，无第三方依赖）----
// Chromium fullPage 截图在页面高 >16384px 时会用陈旧瓦片填充超限区域（假内容）。
// 对策：分块 viewport 截图（每块 ≤15000px），再逐行拼接成整图。
function crc32(buf) {
  let c, table = crc32.t || (crc32.t = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
    return t;
  })());
  c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function pngDecode(buf) {
  if (buf.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("非 PNG");
  let p = 8, w = 0, h = 0, bpp = 4, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.slice(p + 4, p + 8).toString("ascii");
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0 || (data[9] !== 6 && data[9] !== 2)) throw new Error("仅支持 8bit RGB/RGBA 非隔行 PNG");
      bpp = data[9] === 6 ? 4 : 3; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const raw = require("zlib").inflateSync(Buffer.concat(idat));
  const stride = w * bpp, out = Buffer.alloc(h * stride);
  const paeth = (a, b, c) => { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  let q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++]; const row = raw.slice(q, q + stride); q += stride;
    const o = y * stride, up = o - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0, b = y ? out[up + x] : 0, c = y && x >= bpp ? out[up + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c);
      out[o + x] = v & 0xff;
    }
  }
  if (bpp === 4) return { w, h, data: out };
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) { out.copy(rgba, j, i * 3, i * 3 + 3); rgba[j + 3] = 255; }
  return { w, h, data: rgba };
}
function pngEncode(w, h, data) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const rows = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    rows[y * (w * 4 + 1)] = 0;
    data.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", require("zlib").deflateSync(rows, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  const args = process.argv.slice(2);
  const cfgPath = args.find((a) => !a.startsWith("--"));
  if (!cfgPath) {
    console.error('用法: node render.js <config.json> [--out 输出.png]');
    process.exit(1);
  }
  const outIdx = args.indexOf("--out");
  const outArg = outIdx >= 0 ? args[outIdx + 1] : undefined;
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const cfgDir = path.dirname(path.resolve(cfgPath));

  const plat = PLATFORMS[cfg.platform || "xiaohongshu"];
  cfg._width = cfg.width || plat.width;
  cfg._dir = cfgDir;
  if (cfg.hero_bg) {
    if (!fs.existsSync(path.resolve(cfgDir, cfg.hero_bg))) throw new Error(`背景图不存在: ${cfg.hero_bg}`);
    cfg._hero_bg = path.resolve(cfgDir, cfg.hero_bg).replace(/\\/g, "/");
  }
  const maxSlice = cfg.maxSliceHeight || plat.maxSliceHeight;

  // 解析素材路径（含 wall 布局的嵌套 src）
  const check = (src) => { if (src && !fs.existsSync(path.resolve(cfgDir, src))) throw new Error(`图片不存在: ${src}`); };
  for (const b of cfg.blocks || []) {
    if (b.type === "image") {
      if (!b.src) throw new Error("image 块缺少 src");
      b._src = path.resolve(cfgDir, b.src).replace(/\\/g, "/");
      check(b.src);
    } else if (b.type === "wall") check(b.src);
    else if (b.type === "cover") check(b.bg);
    else if (b.type === "cards") {
      for (const c of b.items || []) {
        if (!c.src) continue; // 无 src = 中性占位卡（ph）
        c._src = path.resolve(cfgDir, c.src).replace(/\\/g, "/");
        check(c.src);
      }
    } else if (b.type === "wall-row") {
      if (b.left && b.left.type !== "tile") check(b.left.src);
      for (const r of b.right || []) if (r.type !== "tile") check(r.src);
    }
  }

  const html = buildHtml(cfg);
  const tmpHtml = path.join(cfgDir, "_render.html");
  fs.writeFileSync(tmpHtml, html, "utf8");

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({
    viewport: { width: cfg._width, height: 1200 },
    deviceScaleFactor: 1,
  });
  await page.goto("file:///" + tmpHtml.replace(/\\/g, "/"));
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);

  const { height } = await page.evaluate(() => {
    const r = document.body.getBoundingClientRect();
    return { height: Math.ceil(r.bottom) };
  });
  const outBase = outArg || path.join(cfgDir, cfg.output || "out/long.png");
  fs.mkdirSync(path.dirname(path.resolve(outBase)), { recursive: true });
  const ext = path.extname(outBase);
  const stem = outBase.slice(0, -ext.length);

  const CHUNK = 15000; // Chromium 截图表面 ~16384px 上限，超限区域会被陈旧瓦片填充
  if (height > CHUNK) {
    const strips = [];
    for (let y = 0; y < height; y += CHUNK) {
      const ch = Math.min(CHUNK, height - y);
      await page.setViewportSize({ width: cfg._width, height: ch });
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(120);
      strips.push({ y, ch, buf: await page.screenshot() });
    }
    const first = pngDecode(strips[0].buf);
    const full = Buffer.alloc(cfg._width * height * 4);
    for (const s of strips) {
      const d = pngDecode(s.buf);
      d.data.copy(full, s.y * cfg._width * 4, 0, Math.min(d.data.length, s.ch * cfg._width * 4));
    }
    fs.writeFileSync(outBase, pngEncode(cfg._width, height, full));
    console.log(`✔ 整图 ${outBase}  ${cfg._width}×${height}px（分 ${strips.length} 块拼接）`);
  } else {
    await page.screenshot({ path: outBase, fullPage: true });
    console.log(`✔ 整图 ${outBase}  ${cfg._width}×${height}px`);
  }

  let n = 1;
  if (height > maxSlice) {
    n = Math.ceil(height / maxSlice);
    const sliceH = Math.ceil(height / n);
    for (let i = 0; i < n; i++) {
      const h = Math.min(sliceH, height - i * sliceH);
      const f = `${stem}-part${String(i + 1).padStart(2, "0")}${ext}`;
      await page.screenshot({ path: f, fullPage: true, clip: { x: 0, y: i * sliceH, width: cfg._width, height: h } });
      console.log(`✔ 切图 ${f}  ${cfg._width}×${h}px`);
    }
    console.log(`（超过 ${maxSlice}px 高，已等分为 ${n} 张，可依次上传）`);
  }
  await browser.close();
  fs.unlinkSync(tmpHtml);
}

main().catch((e) => { console.error("✘ 失败:", e.stack || e); process.exit(1); });
