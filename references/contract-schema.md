# contract.json 契约速查（唯一事实源）

一切产物（三平台 config、长图、文案清单）都从这份 JSON 投影。**要改图，先改契约；config 是生成物，不手改。**
校验+投影：`node scripts/project.js <contract.json> --validate` / `--all`。

## 顶层字段

```jsonc
{
  "meta": {
    "name": "极光电解质水",              // 必填，产品名
    "platforms": ["jd", "xhs", "douyin"]  // 必填子集：taobao | jd | xhs | douyin（京东商详同 750px 规格）
  },

  "product": {
    "positioning": "城市运动人群的轻补给",   // 采集表五字段，来自用户，可"待定"
    "audience": "25-40 岁跑步/健身人群",
    "coreScenes": ["晨跑", "健身房", "通勤"],
    "sellingPoints": [                     // 每个卖点一条，id 必填且唯一
      { "id": "sp1", "feature": "4-1-1 黄金电解质比",
        "benefit": "出汗后一口就喝到位", "evidence": ["SGS 检测报告编号××"] }  // evidence 可空，不可编造
    ]
  },

  "content": {
    "valuePromise": "出汗的事，交给极光",    // 核心价值承诺（选定的一句）
    "painLine": "运动水难喝，好喝的水不管用",  // 痛点/详情页表达（选定的一句）
    "screens": [                            // 屏序——契约的心脏，一份逻辑屏序投所有平台
      { "kind": "hero", "id": "hero",
        "copy": { "title": "出汗的事，交给极光", "sub": "4-1-1 黄金电解质比", "badge": "AURORA SPORTS" } },
      { "kind": "pain", "copy": { "title": "…", "body": "…" } },
      { "kind": "sellingpoint", "ref": "sp1",
        "copy": { "title": "…", "sub": "…", "points": [{ "t": "…" }] } },   // ref 必须对上 product.sellingPoints[].id
      { "kind": "scene", "copy": { "items": [{ "name": "晨跑", "note": "…" }] } },
      { "kind": "compare", "copy": { "title": "…", "head": ["极光", "普通运动饮料"], "rows": [["电解质比","4-1-1 精准","随意添加"]], "win": "left" } },
      { "kind": "review", "copy": { "title": "跑友们说", "quotes": ["…", "…"] } },
      { "kind": "specs" },   // 数据自动取 facts.specs
      { "kind": "certs" },   // 数据自动取 facts.certs
      { "kind": "close", "copy": { "title": "…", "sub": "…", "action": "…待定…" } }
    ]
  },

  "facts": {                               // 事实区：只能来自用户输入，与 copy 隔离
    "specs": { "净含量": "500ml", "保质期": "12 个月" },   // 键值对，投影成 specs 块
    "certs": [{ "name": "SC 生产许可", "desc": "编号××" }],
    "note": "参数以研发数据为准"
  },

  "style": {
    "style": "xiaohongshu",                // 引擎风格: xiaohongshu | magazine | minimal
    "palette": { "bg": "#FFF8F3", "ink": "#33292A", "accent": "#E8505B", "card": "#FFFFFF" },
    "fontMood": "serif",                   // serif(默认编辑感) | modern(黑体大字，电商现代)
    "knobs": { "hero_bg_scrim": 0.35 }     // 透传引擎顶层开关（head_sans/lede_flank/feat_borders…）
  },

  "assets": {                              // 素材区，键 = screen 的 id（缺省 id 为 "kind-序号"）
    "hero": { "src": "shots/hero.png", "bakedText": true },   // bakedText: 图上已烧字，投影不再叠 HTML 标题
    "scene": { "src": ["s1.png", "s2.png", "s3.png"] },        // 数组=多素材轮灌 cards
    "sp1":   { "src": "generate", "prompt": "跑者夕阳剪影喝水…" } // "generate"=待 AI 生图，渲染先用占位图，prompt 留档
  },

  "openQuestions": ["价格未定", "联系方式待用户提供"]   // 占位项，交付时必须原样上报
}
```

## 十二种屏型 kind

`hero`（封面/主张）· `pain`（痛点导语带）· `sellingpoint`（一卖点一屏，ref 1:1；copy 加 `"overlay":true` 转图上压字模式：图 fullbleed+seamless 与前后图相连，标题走浮层+底部遮罩，`pos` 选暗部区）·
`scene`（场景卡，copy.title 出节标题）· `gallery`（作品流：copy{kicker,title,items:[{src}]} 单列无缝；或 `"layout":"wall"` + `rows:[["a.jpg","b.jpg"] 双列等高对（行高取左图比例，右图 cover 裁齐）, {"src":"c.jpg","h":380} 通栏行（h 定高裁切）]` 规划图墙——**同类目图成对、比例统一，横图做通栏透气行**）·
`compare`（双列对垒）· `review`（评价/晒单）· `specs`（参数表）· `certs`（资质背书）·
`process`（服务流程：copy{title, items[], cols:2 转宫格}，服务类详情页主力屏）· `close`（收口 CTA）。

不是每屏都必须有——按产品需要排；但校验器有硬规则（见下）。

## 校验硬规则（`project.js` 违反即拒绝投影）

1. **卖点 1:1**：每个 sellingPoints[].id 恰好一屏 sellingpoint；缺屏/合屏都报错。
2. **事实隔离**：specs/certs 屏的数据只从 `facts.*` 来；facts 为空自动渲染"待核查"占位并在交付报告上报——AI 填一个编造参数即违约。
3. **文案可指认**：投影不增删改写字段内容；config 里每个字都能在契约里找到出处。
4. **openQuestions 透传**：交付报告必须原样列出。
5. 平台子集合法、素材路径存在（`"generate"` 豁免）、id 不重复、hero/close 各最多一个。

## 逐屏文字路由（textMode）

- 短艺术字大标题、封面字 → 可走 `assets[id].bakedText: true`（AI 直出/透明字层合成进图，`scripts/engine/composite.js`）。
- 正文、参数、多条清单、收口 → 一律 HTML 排版（契约 copy 原样渲染）。
- 路由理由是**改字成本**：HTML 改字重跑 30 秒；baked 改字要重新生图。不是模型写不了字。
