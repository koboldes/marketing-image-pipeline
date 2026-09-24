#!/usr/bin/env node
/**
 * project · 内容契约(contract.json) → 体内引擎 config 的投影器 + 契约校验器
 *
 * 用法:
 *   node scripts/project.js <contract.json> --all              # 按 meta.platforms 全投
 *   node scripts/project.js <contract.json> --platform taobao  # 投单平台
 *   node scripts/project.js <contract.json> --validate         # 只校验契约
 *   可选: --out-dir DIR(默认 <契约目录>/pipeline)
 *         --slice13(xhs/douyin 按 1:3 上传上限切图;默认单张不分段)
 *   素材 "generate"/缺文件 → 投影为中性占位块(颜色随主题派生)，换真图后重投影即替换。
 *
 * 铁律：投影是纯翻译，不生产内容——config 里出现的每个字都来自 contract；
 * 事实(facts)缺失一律渲染"待核查"占位，永不编造。
 */
const fs = require("fs");
const path = require("path");

const PLATFORMS = {
  taobao: { engine: "taobao",      width: 750,  slice13: 15000 },
  jd:     { engine: "taobao",      width: 750,  slice13: 15000 }, // 京东商详同为 750px 规格，复用 taobao 引擎档
  xhs:    { engine: "xiaohongshu", width: 1080, slice13: 3240 },
  douyin: { engine: "douyin",      width: 1242, slice13: 3726 },
};
const KINDS = ["hero", "pain", "sellingpoint", "scene", "compare", "review", "specs", "certs", "process", "gallery", "close"];

// 两 hex 按 t 比例混合（0 取 a，1 取 b）——用于从 palette 派生 lede_from 等衍生色
const mixHex = (a, b, t) => {
  const p = (h) => { h = String(h).replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const A = p(a), B = p(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
};

const readContract = (p) => {
  const abs = path.resolve(p);
  return { c: JSON.parse(fs.readFileSync(abs, "utf8")), dir: path.dirname(abs) };
};

// src 相对契约目录解析；"generate"=AI 待生成(渲染时跳过图只排版)，其余文件必须存在
const assetFile = (a) => a && a.src && a.src !== "generate" && a.src !== "placeholder";

function validate(c, cdir) {
  const errs = [];
  const E = (m) => errs.push(m);
  if (!c.meta || !c.meta.name) E("meta.name 必填（产品名）");
  const plats = (c.meta && c.meta.platforms) || [];
  if (!plats.length) E("meta.platforms 至少一个平台");
  for (const p of plats) if (!PLATFORMS[p]) E(`未知平台: ${p}（可选 taobao/xhs/douyin）`);

  const sps = (c.product && c.product.sellingPoints) || [];
  const spIds = new Set();
  sps.forEach((s, i) => {
    if (!s.id) E(`sellingPoints[${i}] 缺 id`);
    if (spIds.has(s.id)) E(`sellingPoint id 重复: ${s.id}`);
    spIds.add(s.id);
  });

  const screens = (c.content && c.content.screens) || [];
  if (!screens.length) E("content.screens 为空——没有屏序就没有长图");
  const usedRefs = new Set();
  let heroN = 0, closeN = 0;
  screens.forEach((s, i) => {
    if (!KINDS.includes(s.kind)) { E(`screens[${i}] kind 非法: ${s.kind}`); return; }
    if (s.kind === "hero" && ++heroN > 1) E("hero 屏最多一个");
    if (s.kind === "close" && ++closeN > 1) E("close 收口屏最多一个");
    if (s.kind === "sellingpoint") {
      if (!spIds.has(s.ref)) E(`screens[${i}] 卖点屏 ref="${s.ref}" 在 product.sellingPoints 中不存在`);
      if (usedRefs.has(s.ref)) E(`卖点 ${s.ref} 占了多屏——一个核心卖点只许一屏，合屏须先与用户确认`);
      usedRefs.add(s.ref);
    }
  });
  for (const id of spIds) if (!usedRefs.has(id)) E(`核心卖点 ${id} 没有对应屏——每个卖点必须独占一屏`);

  const seenId = new Set();
  for (const a of Object.keys(c.assets || {})) {
    if (seenId.has(a)) E(`assets 键重复: ${a}`);
    seenId.add(a);
  }
  screens.forEach((s, i) => {
    const id = s.id || `${s.kind}-${i}`;
    const as = (c.assets || {})[id];
    const srcs = as ? (Array.isArray(as.src) ? as.src : [as.src]) : [];
    for (const p of srcs) {
      if (!p || p === "generate" || p === "placeholder") continue;
      if (!fs.existsSync(path.resolve(cdir, p))) E(`assets.${id}: 素材文件不存在: ${p}（AI 待生成请写 "generate"）`);
    }
  });
  return errs;
}

// ---- 投影 ----
function project(c, cdir, platform, o) {
  const P = PLATFORMS[platform];
  const outDir = o.outDir;
  const rel = (p) => { const r = path.relative(outDir, path.resolve(cdir, p)); return r.split("\\").join("/"); };
  const st = c.style || {};
  const cfg = {
    platform: P.engine,
    width: P.width,
    maxSliceHeight: o.slice13 ? P.slice13 : 99999,
    style: st.style || "xiaohongshu",
    output: `img-${platform}.png`,
    blocks: [],
  };
  if (st.palette) cfg.theme = st.palette;
  if (!cfg.lede_from && st.palette && st.palette.bg && st.palette.ink)
    cfg.lede_from = mixHex(st.palette.bg, st.palette.ink, 0.14); // 导语带底色随主题派生，不引入外来色
  if (st.fontMood === "modern" || st.head_sans) cfg.head_sans = true;
  if (st.knobs) Object.assign(cfg, st.knobs);

  const toRel = (p) => (path.isAbsolute(p) ? p.split("\\").join("/") : p);
  const assetFor = (id) => {
    const a = (c.assets || {})[id];
    if (!a) return null;
    const srcs = (Array.isArray(a.src) ? a.src : a.src ? [a.src] : [])
      .map((p) => (p === "generate" || p === "placeholder") ? null : toRel(rel(p)));
    return { a, srcs }; // null = 待生图/缺素材 → 投影为中性占位块（颜色随主题）
  };

  const sps = {};
  for (const s of ((c.product || {}).sellingPoints) || []) sps[s.id] = s;
  const warnings = [];
  let spN = 0;
  (c.content.screens || []).forEach((s, i) => {
    const id = s.id || `${s.kind}-${i}`;
    const copy = s.copy || {};
    const as = assetFor(id);
    switch (s.kind) {
      case "hero": {
        const t = copy.title || c.content.valuePromise || c.meta.name;
        if (as && as.srcs[0]) {
          cfg.blocks.push({ type: "cover", bg: as.srcs[0],
            t: as.a.bakedText ? undefined : t, d: copy.sub, place: copy.place });
        } else {
          cfg.display_title = true;
          if (copy.badge) cfg.badge = copy.badge;
          cfg.title = t;
          if (copy.sub) cfg.subtitle = copy.sub;
          if (as) cfg.blocks.push({ type: "placeholder", ratio: "4:3", label: "头图" });
        }
        break;
      }
      case "pain":
        cfg.blocks.push({ type: "lede", t: copy.title || c.content.painLine || "", d: copy.body });
        break;
      case "sellingpoint": {
        const sp = sps[s.ref] || {};
        const stitle = copy.title || sp.feature;
        const ssub = copy.sub || sp.benefit;
        if (copy.overlay && as && as.srcs[0]) {
          // 图上压字模式：卖点屏与前后图无缝相连，标题/副题走浮层+底部遮罩——治"整页碎块感"
          // copy.h 统一裁高（cover），让不同比例的作品图在同一节奏带里等高
          cfg.blocks.push({ type: "image", src: as.srcs[0], fullbleed: true, seamless: true,
            h: copy.h, pos: copy.focus,
            overlay: { pos: copy.pos || "bl", line: stitle, meta: ssub, scrim: true } });
        } else {
          cfg.blocks.push({ type: "section", kicker: `卖点 ${String(++spN).padStart(2, "0")}`,
            title: stitle, sub: ssub });
          if (as && as.srcs[0])
            cfg.blocks.push({ type: "image", src: as.srcs[0], fullbleed: true, seamless: true });
          else if (as)
            cfg.blocks.push({ type: "placeholder", ratio: "16:9", label: "卖点图" });
        }
        const pts = copy.points || (sp.evidence && sp.evidence.map((e) => ({ t: e })));
        if (pts && pts.length)
          cfg.blocks.push({ type: "features", cols: 1, noidx: true, items: pts });
        break;
      }
      case "scene": {
        const items = copy.items || [];
        if (copy.title) cfg.blocks.push({ type: "section", title: copy.title, sub: copy.sub });
        if (as && as.srcs.length)
          cfg.blocks.push({ type: "cards", items: items.map((it, k) => {
            const s = as.srcs[k % as.srcs.length];
            return s ? { src: s, title: it.name || it, tag: it.note }
                     : { ph: "场景图", title: it.name || it, tag: it.note };
          }) });
        else if (items.length)
          cfg.blocks.push({ type: "features", noidx: true,
            items: items.map((it) => ({ t: it.name || it, d: it.note })) });
        break;
      }
      case "compare":
        cfg.blocks.push({ type: "compare", title: copy.title, head: copy.head, rows: copy.rows, win: copy.win });
        break;
      case "review": {
        if (copy.title) cfg.blocks.push({ type: "section", title: copy.title });
        for (const q of copy.quotes || []) cfg.blocks.push({ type: "quote", text: typeof q === "string" ? q : q.text });
        break;
      }
      case "specs": {
        const f = c.facts || {};
        let rows = Object.entries(f.specs || {}).map(([k, v]) => [k, v]);
        let note = copy.note || f.note;
        if (!rows.length) {
          rows = [["规格参数", "待核查——请提供真实数据"], ["成分/材质", "待核查"]];
          note = note || "本表为占位：参数、成分、功效、认证等事实性内容以你的研发数据为准。";
        }
        cfg.blocks.push({ type: "specs", title: copy.title || "产品参数", rows, note });
        break;
      }
      case "certs": {
        const cs = ((c.facts || {}).certs || []);
        cfg.blocks.push({ type: "section", title: copy.title || "资质与检测" });
        cfg.blocks.push(cs.length
          ? { type: "features", cols: 2, noidx: true, items: cs.map((x) => ({ t: x.name || x, d: x.desc })) }
          : { type: "text", text: "资质/检测信息：待补充（勿虚构）", center: true });
        break;
      }
      case "process": { // 服务流程屏（服务类详情页主力）：section 标题 + steps 编号步骤（cols:2 宫格）
        cfg.blocks.push({ type: "section", title: copy.title || "服务流程" });
        if (copy.items && copy.items.length)
          cfg.blocks.push({ type: "steps", items: copy.items, cols: copy.cols || 1 });
        break;
      }
      case "gallery": { // 作品流屏：layout:"wall" 走规划图墙（rows 成对/通栏）；缺省单列 fullbleed+seamless
        if (copy.title) cfg.blocks.push({ type: "section", kicker: copy.kicker, title: copy.title, sub: copy.sub });
        if (copy.layout === "wall" && copy.rows) {
          cfg.blocks.push({ type: "wallrows", rows: copy.rows.map((r) =>
            r.cat ? { cat: r.cat } : Array.isArray(r) ? r.map((s) => toRel(rel(s))) : { src: toRel(rel(r.src)), h: r.h, pos: r.pos }) });
        } else {
          for (const it of copy.items || [])
            cfg.blocks.push({ type: "image", src: toRel(rel(it.src)), fullbleed: true, seamless: true });
        }
        break;
      }
      case "close": {
        // 收口包进强调色带（三明治结构首尾呼应）；色带内 cta 的分隔线自动转白
        cfg.blocks.push({ type: "band", tone: "accent", blocks: [{ type: "cta",
          title: copy.title || "现在就把" + (c.meta.name || "它") + "带回家",
          lines: [copy.sub, copy.action].filter(Boolean) }] });
        break;
      }
    }
    if (platform === "douyin" && i === 0 && s.kind === "hero")
      warnings.push("抖音首屏是 hero 封面：建议把最强卖点或痛点屏前置（hook 前置），可在 screens 里调整顺序");
  });
  if ((platform === "taobao" || platform === "jd") && !(c.content.screens || []).some((s) => s.kind === "specs"))
    warnings.push("淘宝/京东商详通常需参数表：建议加 screens 项 {kind:\"specs\"}");

  fs.mkdirSync(outDir, { recursive: true });
  const cfgPath = path.join(outDir, `config-${platform}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
  return { cfgPath, warnings };
}

// ---- CLI ----
function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error('用法: node scripts/project.js <contract.json> [--all | --platform taobao|jd|xhs|douyin] [--validate] [--slice13] [--out-dir DIR]');
    process.exit(1);
  }
  const flag = (n) => args.includes("--" + n);
  const val = (n) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : null; };
  const { c, dir } = readContract(file);

  const errs = validate(c, dir);
  if (flag("validate")) {
    if (errs.length) { console.error("✘ 契约校验未通过:\n  - " + errs.join("\n  - ")); process.exit(1); }
    console.log("✔ 契约校验通过"); process.exit(0);
  }
  if (errs.length) { console.error("✘ 契约校验未通过:\n  - " + errs.join("\n  - ")); process.exit(1); }

  const plats = flag("all") ? c.meta.platforms : [val("platform") || c.meta.platforms[0]];
  const outDir = val("out-dir") || path.join(dir, "pipeline");
  for (const p of plats) {
    if (!PLATFORMS[p]) { console.error(`✘ 未知平台: ${p}`); process.exit(1); }
    const { cfgPath, warnings } = project(c, dir, p, { slice13: flag("slice13"), outDir });
    console.log(`✔ ${p} → ${cfgPath}`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }
  console.log(`\n屏序: ${(c.content.screens || []).map((s, i) => s.id || `${s.kind}-${i}`).join(" → ")}`);
  if ((c.openQuestions || []).length) console.log("未决项(交付时必须上报):\n  - " + c.openQuestions.join("\n  - "));
}

main();
