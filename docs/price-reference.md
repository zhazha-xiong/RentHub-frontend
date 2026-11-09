# 参考价（price-reference）：口径降级、样本不足的默认行为与 Redis 缓存

对应接口：`POST /api/v1/ai/price-reference`
对应表：`price_stats`（`region_code, rooms, area_bucket, sample_count, p25, p50, p75, computed_at`）

## 1. 为什么要这份文档

技术文档写了「价格统计夜间物化，接口只读」，但没定义：

- 某区域/户型样本太少时返回什么（接口只有一个 `relaxed: boolean`）；
- 口径怎么逐级放宽；
- 物化结果放哪、怎么失效。

这三条不定义，前端就没法决定「要不要显示参考价」，后端也容易返回一个统计学上无意义的区间。下面把默认行为定死。

## 2. 口径与降级顺序

从精确到宽泛，命中第一个 `sample_count >= min_sample`（默认 **3**）的口径：

| 级别 | 口径 `scope` | 取数条件 | `relaxed` |
| --- | --- | --- | --- |
| L1 | `region+rooms+area` | `region_code` + `rooms` + `area_bucket` | `false` |
| L2 | `region+rooms` | `region_code` + `rooms` | `true` |
| L3 | `region` | `region_code` | `true` |
| L4 | `city` | 全市在架 | `true` |

`area_bucket` 分档：`<50`、`50–70`、`70–90`、`90–120`、`>=120`（㎡）。

样本池口径：`status != 'offline'`、未软删、**排除查询目标房源自身**。

## 3. 样本不足的默认行为（重点）

四级都不到阈值时：

- `insufficient = true`
- `range = null` —— **不给假区间**（这是默认行为，避免前端把噪声当结论）
- `relaxed = true`
- `sample_count` 如实返回实际样本数
- `note` 明确写「样本不足（当前口径「…」仅 N 条，少于 3 条），暂不给出参考价」
- `peers = []`

前端约定（`web/src/views/ListingDetailView.vue` 已实现）：

- `insufficient || range === null` → 显示提示条 + 「样本不足」标签，**不显示分位数**
- 否则显示 P25 / 中位 / P75，并在标签上标明实际口径（例如「已放宽：区域 + 户型」）

响应示例（样本不足）：

```json
{
  "range": null,
  "sample_count": 2,
  "relaxed": true,
  "scope": "city",
  "scope_label": "全市",
  "insufficient": true,
  "min_sample": 3,
  "peers": [],
  "note": "样本不足（当前口径「全市」仅 2 条，少于 3 条），暂不给出参考价。"
}
```

## 4. Redis 存中位数（允许使用）

物化结果与分位数**允许放 Redis**，DB 只作为真源：

```
key   price:v1:{scope}:{region_code or -}:{rooms or -}:{area_bucket or -}:{min_sample}
value {"range":{"p25":..,"median":..,"p75":..,"min":..,"max":..},"sample_count":N,"computed_at":"..."}
ttl   6h（夜间任务每天刷新，白天的读都命中缓存）
```

读写约定：

1. **夜间任务**（APScheduler）算完写 DB `price_stats`，再按口径批量 `SET` 到 Redis（带 TTL）。
2. **接口读取**：先 Redis → 命中直接返回；未命中查 `price_stats` 并回填 Redis。
3. **失效**：房源上下架/租金变更不逐条清缓存，依赖 6h TTL + 夜间重算；房源量大的城市可对 `region` 维度打短 TTL（如 1h）。
4. **Redis 不可用**：直接查 DB，接口不报错（缓存是加速，不是依赖）。
5. **空值缓存**：`insufficient` 的结果同样缓存，但 TTL 缩短到 60s，避免缓存穿透又不过度阻碍新样本生效。
6. **键版本**：`price:v1:` 前缀，算法或分档口径变更时升版本，避免旧值污染。

> 假后端（`web/mock/server.mjs`）用进程内 `Map + TTL` 扮演 Redis，并按同一套 key 规则缓存，
> 响应头 `X-Price-Cache: hit|miss` 可以直接观察缓存是否命中。

## 5. 补充样本

样本不够时不必改代码，现成两条路：

```bash
# 1) 假后端：批量造在架样本（用于演示/测试「补样本后参考价从无到有」）
curl -X POST http://127.0.0.1:8787/__mock__/listings/bulk \
  -H 'Content-Type: application/json' \
  -d '{"count":6,"region_code":"shahekou","rooms":2,"area":86,"rent":300000}'

# 2) 契约测试里已经覆盖：bulk 之后 L1 口径命中，range 从 null 变成正常分位数
npx vitest run -t "补充样本"
```

真实环境补充样本 = 让房源数据变多：商家上架、导入历史成交/挂牌数据，夜间任务重算即可；
新区域冷启动期会稳定返回 `insufficient: true`，直到样本达到阈值。

## 6. 分位数算法

`nearest-rank`（简单、可解释）：排序后取第 `ceil(p * n) - 1` 个值。
样本量够大（≥ 30）时可换成线性插值，并把算法版本写进 `price_stats` 便于回溯。
