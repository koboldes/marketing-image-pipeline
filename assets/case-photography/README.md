# 案例参考 · 摄影服务详情页（真实交付）

2026-09-23 为真实摄影服务业务交付的京东/淘宝商详长图（750×12152），从采集到五轮迭代的全程留档，作为技能的**编排示范**。

## 这个案例演示了什么

- **12 屏型用了 10 种**：hero（断行大字）→ pain → sellingpoint×4（全部 `overlay` 图上压字 + `h:480` 等高裁切 + `focus` 焦点位）→ scene（6 张品类卡）→ gallery（`layout:"wall"` 规划图墙：6 个 `{cat}` 类目头、双列等高配对、通栏透气行、`pos` 焦点裁切）→ process（`cols:2` 宫格）→ close（金带收口，亮 accent 自动深字）。
- **分类口径统一**：品类卡 6 类目 = 图墙 6 类目，同名同集合。
- **真实素材编排**：36 张客户作品图全部用上（卖点 4 + 卡 6 + 墙 28，其中 2 张卡图与墙复用），同类目图成对、比例统一。
- **防虚构执法**：品牌名/联系方式/价格未提供 → 收口"待补充（勿虚构）"占位 + openQuestions 7 条如实上报；代写文案（卖点副题、类目命名）全部标注待确认。
- **用户反馈驱动的迭代**：碎块感→overlay连流、图太少→全量编排、类目头鎏金小字被否→编号+宋体大字、列线 4px 溢出→含缝等分。

## 复跑

```bash
cd <技能根>
node scripts/project.js assets/case-photography/contract.json --platform jd
node scripts/engine/render.js assets/case-photography/pipeline/config-jd.json
```

`contract.json` 为唯一事实源；`works/` 为素材原图；`pipeline/img-jd.png` 为最终交付图。

## 换产品时抄什么

改 `meta/product/content.copy/facts/assets` 即可，屏序骨架（hero→pain→卖点流→品类索引→作品墙→流程→收口）适合大多数**服务类/多 SKU 展示类**详情页；实物单品可砍 gallery 墙、加 specs 参数屏。
