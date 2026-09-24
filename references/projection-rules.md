# 投影规则（contract → config → 渲染）

## 1. 屏型 → 引擎块映射（project.js 内置，此处备查/手改投影逻辑用）

| kind | 生成的 config 块 |
|---|---|
| hero | 有图：`cover{bg,t,d,place}`（bakedText 时不叠 t）；无图：顶层 `title/subtitle/badge + display_title` |
| pain | `lede{t,d}` |
| sellingpoint | 普通：`section{kicker:"卖点 0N",title,sub}` +（有图）`image{fullbleed,seamless}` +（有证据）`features{cols:1,noidx}`；`copy.overlay:true`：`image{fullbleed,seamless,overlay{pos,line,meta,scrim}}` 图上压字连图成流 |
| gallery | `section{kicker,title}` + 单列：N×`image{fullbleed,seamless}`；`layout:"wall"`：`wallrows{rows}`（[a,b] 双列等高对 / {src,h} 通栏行，4px 发丝缝） |
| scene | `cards{items:[src,title,tag]}`；无图退化为 `features{noidx}` |
| compare | `compare{title,head,rows,win}` |
| review | `section` + N×`quote` |
| specs | `specs{title,rows,note}`——rows 取 `facts.specs`，空则"待核查"占位 |
| certs | `section` + `features{noidx}`（取 `facts.certs`，空则"待补充"文本块） |
| process | `section{title}` + `steps{items[]}`（服务流程编号步骤） |
| close | `cta{title,lines}` |

引擎其余通用块（text/band/steps/wall/tile…）契约不直接生成，特殊需求在冻结契约后于 config 顶层 `knobs` 或手动追加块解决——但**文案仍须先入契约**，保持单一事实源。

## 2. 平台投影

| | taobao / jd | xhs | douyin |
|---|---|---|---|
| 宽度 | 750 | 1080 | 1242 |
| 上传约束 | 高宽容 | **1:3 高，超限必切**（`--slice13`） | 1:3 建议 |
| 版式倾向 | 顺排 fullbleed+seamless 为主；specs/certs 屏常有 | 允许图墙感，封面标题可 bakedText | **hook 前置**：最强卖点/痛点排第一屏 |
| 收口 | 决策收口 cta | 种草钩子（关注/收藏引导） | 短促行动语 |

- 屏序只写一份（`content.screens`）；平台差异靠投影参数，不复制三份 screens。
- `jd`（京东商详）与 taobao 同为 750px 规格，复用 taobao 引擎档；如需京东专属差异再拆独立档。
- project.js 自动警告：douyin 首屏是 hero → 提示前置 hook；taobao/jd 无 specs 屏 → 提示补参数表。

## 3. 渲染命令序列

```bash
cd <技能根>            # scripts/engine 下有 node_modules（首用先 npm install）
node scripts/project.js <契约> --all                # → 契约目录/pipeline/config-<平台>.json
node scripts/engine/render.js pipeline/config-taobao.json
# 产物: pipeline/img-taobao.png；改内容 = 改契约 → 重投影 → 重渲染（30 秒/版）
```

素材 `"generate"` 屏投影为**中性占位块**（`placeholder` 块/占位卡，颜色全从 theme 派生，不引入外来色），整版构图校对接近成品；定稿换真图重投影即替换。生图提示词留在 `assets[id].prompt`。
透明底文案 PNG / 双层封面合成：`node scripts/engine/text-png.js <spec.json>`、`composite.js <bg> <txt> <out> [宽x高] [缩放]`。

## 4. 引擎 config 通用词汇（本项目引擎支持的全部块）

顶层：`platform|width` · `style`(xiaohongshu/magazine/minimal) · `theme{bg,ink,accent,card}` · `layout:"wall"`(图墙) ·
`title/subtitle/badge/footer` · `display_title/hero_sans/hero_center/hero_bg/hero_bg_scrim/hero_lede` ·
`maxSliceHeight`(交付默认 99999 单张) · `head_sans/lede_flank/feat_borders/lede_from` · `output`。

块：`cover`(bg,h,pos,place,t,d,scrim) · `lede`(t,d) · `section`(kicker,title,sub) · `features`(items[{t,d}],cols,center,noidx) ·
`cards`(items[{src,title,tag}]) · `image`(src,caption,square,fullbleed,seamless,overlay{pos,title,en,line,meta}) ·
`text`(text,center) · `quote` · `list` · `steps` · `band`(容器:tone,blocks[];或{text}) · `cta`(title,lines[]) ·
`specs`(title,rows[[k,v]],note)【本项目新增】 · `compare`(title,head,rows,win)【本项目新增】 ·
`spacer` · `divider` · `heading`；wall 布局专属：`wall`/`wall-row`/`tile`。

## 5. 目检清单（每次渲染后 Read 出图核对，全过才交付）

- [ ] 屏序、漏屏、重复、宽度统一
- [ ] 图与图无缝（seamless 生效无黑缝）；浮层/文字不压主体、亮底无看不清的字
- [ ] 文案与契约逐条一致、无尴尬换行；compare 高亮列正确、specs 表无编造
- [ ] 高度符合用途（xhs 按 1:3 则检查 part 数）

## 6. 坑位（实测，勿重走）

0. 页高 >16384px：Chromium fullPage 截图会瓦片复用产生假内容——render.js 已自动分块截图+PNG 缝合；验证超长图用 canvas 分段裁，别拿 fullPage 再截图自骗。
1. CSS 背景图 url() 必须 `file:///` 前缀；style 属性里 CSS 引号用单引号。
2. 本地图片必须写临时 HTML 后 `goto file:///`，`setContent()` 禁载 file:// 子资源。
3. 浮层文字列限宽 560px，元数据 ≤22 字。
4. 图墙 `.wcol` 必须显式定宽，否则文字格漏黑缝；整页高度量 `document.body` 不要量 `.page`。
