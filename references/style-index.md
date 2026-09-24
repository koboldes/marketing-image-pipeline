# 风格索引（电商/营销长图适用子集）

来源：design-engine 风格库 192 风格中，与产品营销长图气质相通的 18 个，按品类分组。
第 2 步定 `style` 时从这里选气质 → 落成 `palette` 三色 + `style` 引擎风格 + `fontMood`。
**本表只取气质与配色方向，不依赖 design-engine 在场**；完整 CSS 实现在它的 styles/ 库（装有该技能时可去开对应风格卡看细节）。

| 风格 | 气质 | palette 方向 | 引擎 style/fontMood | 适合品类 |
|---|---|---|---|---|
| Swiss Grid | 理性、网格、克制 | 白/浅灰底 + 黑字 + 单红或单蓝 accent | minimal + modern | 数码、工具、课程 |
| Japanese Minimal | 留白、侘寂、贵 | 米白 #F5F1E8 底 + 墨字 + 低饱和单点色 | minimal | 护肤、茶器、家居 |
| Warm Earth Editorial | 奶油底暖土色，耐心手作感 | #FFF8F3 底 + terracotta/金/鼠尾草 | xiaohongshu + serif | 食品、烘焙、母婴 |
| Apothecary Label | 配方感、复古药房标签 | 米黄纸底 + 深棕字 + 金线 | magazine + serif | 成分党护肤、保健、香薰 |
| Recipe Card | 配料表即卖点 | 浅底 + 手写感 + 单一暖 accent | magazine | 食品、调料、预制菜 |
| Botanical | 标本插画、生长叙事 | 纸白 + 墨绿 + 植物金 | magazine + serif | 天然成分、花草茶、有机 |
| Packaging Product | 开箱即仪式 | 大面积纯色底 + 产品居中 + 硬光 | xiaohongshu + modern | 新品首发、礼盒 |
| Fashion Editorial | 杂志大片、冷感 | 冷灰白 + 大字距黑体 + 极少 accent | magazine + modern | 服饰、美妆、配饰 |
| Art Deco / Neo Deco Keyline | 金线几何、庆典感 | 深墨绿/黑底 + 鎏金 #C9A15E | magazine + serif | 珠宝、酒水、周年活动 |
| Obsidian Luxury | 黑曜石、静奢 | 近黑 #0A0A0A + 暖白字 + 金 accent | minimal（暗底） | 高端电子、腕表、皮具 |
| After-Dark Luxury | 暗夜琥珀光 | 哑光黑 + 暖金 #C9A15E | minimal（暗底）+ serif | 威士忌、香氛、夜系产品 |
| Type Hero | 字即一切 | 纯色底 + 巨型标题 + 极小正文 | minimal + modern | 促销主张、发布会 |
| Minimaximalist | 一个数字荒谬地大 | 单色底 + 420px 数字 + 其余全小 | minimal + modern | 性价比、销量证明 |
| Bento Grid | 格子收纳信息 | 浅底 + 白卡 + 单 accent 边线 | xiaohongshu + modern | 参数多、功能清单型 |
| Data Journalism | 证据图表、权威 | 白底 + 黑字 + 红蓝数据色 | minimal + modern | 检测报告、功效证明 |
| Risograph / Zine | 双色套印、独立手作 | 米纸 + 荧光粉/孔蓝双色 | xiaohongshu + modern | 文创、潮玩、独立品牌 |
| Memphis Pop | 80s 波普、跳脱 | 亮底 + 多几何色块（accent 仍唯一） | xiaohongshu + modern | 零食、年轻化快消 |
| Vertical Stack Filmstrip | 竖排胶片分格 | 深底 + 白格 + 单 accent | magazine + modern | 步骤教程、使用流程 |

## 用法三条

1. **参考图优先**：用户给了参考图/包装图，直接从图提色定 palette，本表只作气质命名用。
2. **暗底组合已实测**：bg #0C0B0E / ink #EAE5DB / accent #C9A15E（Obsidian/After-Dark 同款）；浅色产品图默认 bg #FFF7F2 / ink #3B2B2B / accent 取产品主色。
3. **一页一风格**：选定后写进契约 `style`，三平台共用——换风格=改契约 style 区重投影，不动内容区。
