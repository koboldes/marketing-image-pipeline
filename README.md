# marketing-image-pipeline · 营销长图流水线

一个 Agent 技能：产品信息 → 营销长图全流水线。核心机制是**内容契约（contract.json）为唯一事实源**——一次冻结、多平台投影（淘宝/京东商详 750px、小红书 1080px、抖音 1242px），体内引擎 HTML 排版 + 无头 Edge 整页截图直出。改图 = 改契约 → 重投影 → 重渲染，30 秒一版。

## 能力

- **12 种语义屏型**：hero / pain / sellingpoint（支持图上压字+等高裁切）/ scene 品类卡 / gallery 规划图墙（类目标题行+双列等高配对+通栏透气行+焦点裁切）/ compare / review / specs 参数表 / certs / process 服务流程 / close 收口色带
- **防虚构执法**：参数、认证、价格、联系方式只认用户输入，缺失自动渲染"待核查/待补充"占位并如实上报；投影层机器校验（一个卖点恰好一屏等四条硬规则）
- **设计自审**：字体/色彩/布局/层级四律 + ≥4 分交付门槛（源自 Claude Design Engine 体系，按长图语境浓缩）
- **零下载依赖**：Node + playwright-core 直接驱动系统 Edge

## 用法

面向 Claude Code / ZCode 等 Agent：把本目录放进 `~/.agents/skills/`（或同类技能目录），对 Agent 说"给 XX 产品做详情页/种草长图"即可。首次使用引擎目录 `npm install`（约 10 秒）。

流程五步：需求采集 → 契约草案冻结 → 投影渲染 → 目检自审评分 → 交付；**第 6 步项目复盘沉淀为强制收尾**（教训入规则/能力入引擎/项目入案例/版本入账），技能随真实项目自生长。

## 目录

```
SKILL.md              流程与硬规则（Agent 读这个）
references/           契约 schema / 六层内容方法论 / 设计规则 / 风格索引 / 投影规则
scripts/project.js    契约校验 + 平台投影
scripts/engine/       体内渲染引擎（longimage 血统 + specs/compare/图墙/宫格扩展）
assets/example/       全 12 屏型示例契约
assets/case-*/        真实交付案例（契约+README；客户作品图不入库）
```

## 案例

`assets/case-photography/` — 摄影服务详情页真实交付：36 张客户作品图的全量编排、卖点图上压字流、六类目规划图墙、防虚构占位，README 写明演示点与复用骨架。

---

Version 见 [SKILL.md](SKILL.md) frontmatter 与 changelog。
