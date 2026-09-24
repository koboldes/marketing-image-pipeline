---
name: marketing-image-pipeline
description: >
  产品信息 → 营销长图全流水线：内容契约(contract.json)为唯一事实源，一次冻结、多平台投影
  （淘宝商详 750px / 小红书 1080px / 抖音 1242px），体内引擎 HTML 排版 + 无头 Edge 整页截图直出。
  当用户说"做详情页""电商详情页""详情页文案/策划/线框""逐屏设计""商品长图""种草长图""产品卡片"
  "把产品介绍做成一张图""新品上线/活动宣传/品牌服务展示长图""这个产品出个淘宝/小红书/抖音的图"
  "改文案重新出图"时必须使用——即使没说"长图"，只要目标是产品信息→营销图成品，都走这条流水线。
  纯素材拼图、快速排版（无产品策划需求）用 longimage 技能，本技能管全链路。
version: 1.3.0
last_updated: 2026-09-22
changelog: |
  v1.6.0: 应户要求新增第 6 步·项目复盘沉淀（教训入规则/能力入引擎/项目入案例/版本入账），交付后强制执行，技能随项目自生长。
  v1.5.3: 收编真实交付案例 assets/case-photography/（摄影服务详情页：契约+36 作品图+成品+README），服务类/多图编排单照此抄骨架；迁移后复跑回归通过。
  v1.5.2: 图墙类目头改版——"编号(01/02…)+宋体大字"栏目头（鎏金小字+发丝线被否）；wallrows 通栏行支持 pos 焦点裁切；品类卡与图墙类目必须同名同集合（契约层纪律，写进 content-methods）。
  v1.5.1: 图墙三修——①双列行宽含缝等分（(inner-gap)/2），列线与通栏行右缘严格对齐（此前 654>650 溢出 4px）；②wallrows 支持 {cat} 类目标签行（accent 字+发丝线）；③image 块支持 h 定高 cover 裁切（卖点屏统一高度节奏）。
  v1.5.0: gallery 新增规划图墙 layout:"wall"——rows 双列等高配对（同类目同比例）+ 通栏横幅透气行，4px 发丝缝；引擎加 wallrows 块。
  v1.4.0: 摄影服务页 v2 实测反哺（用户反馈"图太少/黑底碎块/流程要2×2/文字设计"）——①sellingpoint 新增 copy.overlay 图上压字模式（image overlay+底部遮罩 scrim，卖点图无缝连流）；②新增 gallery 作品流屏型（第 12 种，多图 fullbleed+seamless 连续排）；③steps 支持 cols:2 宫格（金底自动深字徽章）；④scene 的 copy.title 不再被忽略。
  v1.3.0: 摄影服务详情页实测反哺——①新增 `process` 服务流程屏型（kind 十种）；②band 色带亮 accent（金/黄）自动转深字（亮度检测，白字压金底=对比不合格）；③display 大标题 `title_px` 字号开关（6+ 字行长）；④lede/section/cta/cover 标题支持 `\n` 手动断行（此前换行被吞成空格）。
  v1.2.1: cards 奇数末卡洞修复——末项为奇数位时通栏展示（grid-column:1/-1）且图幅转 16:9；纯 CSS 规则，任何 3/5/7 张卡片自动生效。
  v1.2.0: 视觉质量修复（用户实测反馈"没素材时排版和色块不好看"）——①"generate"/缺素材不再套彩色测试图，投影为主题色中性占位块（引擎新增 placeholder 块 + cards 占位卡）；②lede 导语带底色由 palette 派生（mixHex），不再默认暖米色与冷主题打架；③收口 cta 包进 band 强调色带（三明治结构），色带内分隔线/文字转白；④jd 平台档加入（750px 复用 taobao 引擎）；⑤实测教训入文案红线：正文/大标题按行设计，长句主动 \n 断均衡行，孤字尾巴即伤。
  v1.1.0: 吸收 design-engine 设计体系——references/design-rules.md（字体/色彩/布局/层级四律+自审评分制，目检升级为 ≥4 分门槛）+ references/style-index.md（18 个电商适用风格）。
  v1.0.0: 首版——契约投影 + 体内引擎 + 三平台直出。
---

# marketing-image-pipeline · 营销长图流水线

一个自包含的工作流：六层内容方法论（脑）+ 设计规则（审美）+ 契约投影（脊柱）+ 体内渲染引擎（手）。
**核心机制：所有内容住在 contract.json 里；产物（config、长图）全是生成物。改图=改契约→重投影→重渲染，30 秒一版。绝不手改 config、绝不手 P 成品图。**

**本机无 Python，勿写 Python 方案**；引擎是 Node + playwright-core，驱动系统 Edge（channel:msedge，免下载）。

## 第 0 步 · 环境自检（每次首用）

1. `node --version` 可用。
2. `scripts/engine/` 下无 `node_modules` → 在该目录 `npm install --no-fund --no-audit`（只装 playwright-core）。
3. 冒烟（可选）：`node scripts/project.js assets/example/contract.json --platform taobao --out-dir out-test/` 再 `node scripts/engine/render.js out-test/config-taobao.json` 应出图。

## 第 1 步 · 需求采集（一轮问全，不逐层设卡）

要一张采集表：产品名/定位/人群/场景/卖点 + 目标平台 + 素材（产品图/包装图目录，有就 `dir` 清点报每张内容与比例）+ 风格参考。
缺卖点/人群先补齐再动笔；缺图不阻塞——素材标 `"generate"`，投影成主题色中性占位块先出构图校对（换真图重投影即替换）。
用户已有旧详情页文案/线框稿：直接读，按第 2 步映射进契约，不重走采集。

## 第 2 步 · 契约草案 → 冻结（读 references/content-methods.md 执行）

按六层方法论**一次性填满 contract.json 草案**：valuePromise/painLine 各 10 备选标推荐位、
每卖点主/副标题、Top4 场景、收口 3-5 组、屏序（kind 十二选 N 排列，见 contract-schema）。
展示给用户 → 用户指哪改哪 → `node scripts/project.js <契约> --validate` 过闸 → **冻结**。
红线：不虚构参数/功效/认证/联系方式，缺的进 `facts` 空位 + `openQuestions`。
定风格：用户有参考图/包装图→提色定 `style.palette`；没有→读 references/style-index.md 按品类选气质给 2-3 案；配色与层级纪律对照 references/design-rules.md。

## 第 3 步 · 投影 + 渲染

```bash
node scripts/project.js <契约> --all                      # 每平台一份 pipeline/config-*.json
node scripts/engine/render.js pipeline/config-taobao.json  # 逐平台出图
```
- 平台规则/映射表见 references/projection-rules.md（douyin hook 前置、xhs 1:3 需 `--slice13`、taobao 建议 specs 屏）。
- 文字路由：短艺术字/封面可 `bakedText`（AI 烧字，prompt 留档 assets[].prompt）；正文/参数/清单一律 HTML。
- 编排手法（实测定型）：卖点屏 `copy.overlay:true` 图上压字连图成流（配 `h` 统一裁高）；作品墙 `gallery layout:"wall"` 类目行 `{cat}` + 双列等高配对 + 通栏透气行，**类目名必须与品类卡同一套**；服务类加 `process cols:2` 宫格。
- 封面合成用 `scripts/engine/composite.js`（AI 背景层+透明字层）；用户要自后期摆字则 `text-png.js` 出透明底 PNG。

## 第 4 步 · 目检 + 自审评分（不可跳过）

1. **结构清单**（projection-rules.md 第 5 节）：屏序完整/无缝/浮层不压主体/文案逐条与契约一致/specs 无编造/高度合规。
2. **设计自审**（design-rules.md 第六节评分制）：跑失败表 + 层级三板斧（灰度/遮罩/缩屏），给整图打分——**≥4 分才交付，3 分改契约重渲后重评，1-2 分回炉**。
3. 投影警告（hook 未前置等）如实转达用户并给改法。报告里附评分与扣分理由，不许"还行因为…"式自我说服。

## 第 5 步 · 交付

报告：各平台整图尺寸与路径、文案清单（逐条可指认）、**openQuestions 原样上报**、素材瑕疵提醒（水印/低清/占位图未换）。
迭代口令：用户说"第 N 屏改 X" → 落到契约字段 → 重投影重渲染。契约文件随产物一起留档。

## 第 6 步 · 项目复盘沉淀（交付后必做，不可跳过）

每个项目交付后立即回写技能，四件事按需做全：

1. **教训入规则**：本次被用户打回的设计（比例/对齐/断行/分类口径…），提炼成一句可执行纪律写进对应 reference（content-methods/projection-rules/design-rules），不写故事写规则；
2. **能力入引擎**：新长出的编排手法补进 project.js/engine 成为屏型或开关，别让它停留在某份 config 里；
3. **项目入案例**：整树收进 `assets/case-<品类名>/`（契约+config+成品+README 写清演示了什么、换产品抄哪段），下次同类单照抄骨架。素材包超 100M 时只保留契约引用的图；
4. **版本入账**：SKILL.md changelog 记一行（改了什么、为什么），version 递增；
5. **推送远程**：本技能目录即 git 仓库（origin = https://github.com/koboldes/marketing-image-pipeline，main 分支）。`git add -A && git commit -m "<类型>: <摘要>" && git push`。直连 github.com 超时的机器上，push 前设代理：`export HTTPS_PROXY=http://127.0.0.1:7897`（Clash 端口，以实际为准）。案例客户图与 node_modules 已被 .gitignore 排除，勿 force 加回。

## 契约硬规则（project.js 机器执法，见 references/contract-schema.md）

1. 一个核心卖点恰好一屏（ref 1:1，缺/合都拒绝投影）；
2. 事实区只进用户给的真实信息，缺则"待核查"占位，不编造；
3. 投影纯翻译不改写——config 每个字可指认回契约；
4. openQuestions 必须透传上报。

## 文件地图

- `scripts/project.js` — 契约校验 + 平台投影
- `scripts/engine/render.js` — 体内引擎（longimage v1.5.1 血统 + specs/compare 块 + taobao 平台）
- `scripts/engine/text-png.js` / `composite.js` — 透明字 PNG / 双层封面合成
- `references/contract-schema.md` — 契约全字段速查
- `references/content-methods.md` — 六层方法论（C 节奏：全量草案+指哪改哪）
- `references/projection-rules.md` — 屏型→块映射、平台规则、目检清单、坑位
- `references/design-rules.md` — 字体/色彩/布局/层级四律 + 自审评分制（≥4 分门槛）
- `references/style-index.md` — 18 个电商适用风格（气质→palette→引擎参数）
- `assets/example/contract.json` — 全 12 屏型示例契约（冒烟测试用）
- `assets/case-photography/` — 真实交付案例（摄影服务详情页：契约+36 作品图+成品长图+README），服务类/多图编排单照此抄骨架
