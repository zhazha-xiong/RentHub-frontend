-- =============================================================================
-- RentHub · 索引与并发约束建议（PostgreSQL 16）
--
-- 《RentHub 技术文档》第 4 章只给了建表语句，未给索引。这里按「第 5 章接口
-- 实际会怎么查」补齐，命名统一 idx_ / uq_。
--
-- 说明：
--   1. 所有业务表都有 deleted_at 软删除，列表类索引一律加 where deleted_at is null，
--      让索引只覆盖活跃数据（体积更小、更易常驻内存）。
--   2. 金额是整数分，租金筛选/排序直接建在 rent 上即可。
--   3. 需要迁移时按 Alembic 的 revision 顺序执行；新增索引在 PG 16 里可直接
--      create index concurrently（避免长时间锁表），脚本里用注释标出。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users（账号域）
-- -----------------------------------------------------------------------------
-- 登录按 account 查询已有唯一约束；管理端按角色 + 状态筛选
create index idx_users_role_status on users (role, status) where deleted_at is null;
-- 「最近活跃」排序 / 沉睡账号清理
create index idx_users_last_active on users (last_active_at desc);

-- -----------------------------------------------------------------------------
-- merchant_qualifications / qualification_files / qualification_reviews（资质域）
-- -----------------------------------------------------------------------------
-- 管理端默认只看待审核
create index idx_qual_status on merchant_qualifications (status, submitted_at desc);
create index idx_qual_reviewer on merchant_qualifications (reviewer_id, reviewed_at desc);

-- 资质材料按展示顺序取
create index idx_qfiles_qual on qualification_files (qualification_id, sort);

-- 审核记录时间线
create index idx_qreviews_qual on qualification_reviews (qualification_id, created_at desc);

-- -----------------------------------------------------------------------------
-- listings（房源与检索）
-- -----------------------------------------------------------------------------
-- 首页列表：status + 区域 + 租金（最常用组合）
create index idx_listings_status_region_rent on listings (status, region_code, rent)
  where deleted_at is null;
-- 商家端：我的房源
create index idx_listings_merchant on listings (merchant_id, status, updated_at desc)
  where deleted_at is null;
-- latest 排序
create index idx_listings_published on listings (published_at desc)
  where status = 'online' and deleted_at is null;
-- 地铁筛选（metro_line 与 region 互斥，单独一条）
create index idx_listings_metro on listings (metro_line, walk_minutes)
  where status = 'online' and deleted_at is null and metro_line is not null;
-- 设施筛选（facilities jsonb 里是 {"bed":[],"public":[]}）
create index idx_listings_facilities_gin on listings using gin (facilities jsonb_path_ops);

-- composite 排序 = favorite_count*3 + view_count，表达式索引无法直接用于游标分页，
-- 建议加一个生成列，再对它建索引（排序与游标都稳定）：
-- alter table listings
--   add column rank_score integer generated always as (favorite_count * 3 + view_count) stored;
-- create index idx_listings_rank on listings (rank_score desc, id desc)
--   where status = 'online' and deleted_at is null;

-- 房源图片：按顺序取，且「第一张为封面」需要唯一
create index idx_limages_listing on listing_images (listing_id, sort);
create unique index uq_limages_cover on listing_images (listing_id) where is_cover;

-- -----------------------------------------------------------------------------
-- favorites（收藏：多对多）
-- -----------------------------------------------------------------------------
-- 主键 (user_id, listing_id) 已覆盖「我的收藏」；补反向统计「某房源被收藏数」
create index idx_favorites_listing on favorites (listing_id);

-- -----------------------------------------------------------------------------
-- orders（订单：五态状态机）
-- -----------------------------------------------------------------------------
-- ★ 关键并发约束：同一房源同时只允许一个未结束的订单。
--   下单时先 select ... for update 锁房源行，再插入订单；这条部分唯一索引是最后一道防线，
--   并发重复下单会以 23505 失败，服务层转成 409 LISTING_LOCKED。
create unique index uq_orders_active_listing on orders (listing_id)
  where status in ('pending', 'confirmed');

-- 租客端列表 / 商家端列表（按状态页签 + 时间倒序）
create index idx_orders_tenant on orders (tenant_id, status, created_at desc);
create index idx_orders_merchant on orders (merchant_id, status, created_at desc);
-- 超期未接单清理任务：只扫 pending
create index idx_orders_pending_created on orders (created_at)
  where status = 'pending';

-- 订单状态流水 / 支付流水
create index idx_oslogs_order on order_status_logs (order_id, created_at);
create index idx_payments_order on payments (order_id, created_at desc);
create unique index uq_payments_trade_no on payments (trade_no);

-- -----------------------------------------------------------------------------
-- notifications（通知）
-- -----------------------------------------------------------------------------
-- 通知中心：未读优先
create index idx_notices_user_unread on notifications (user_id, is_read, created_at desc);
-- 90 天归档任务扫描
create index idx_notices_cleanup on notifications (created_at) where is_read = true;

-- -----------------------------------------------------------------------------
-- ai_sessions / ai_messages（AI 会话）
-- -----------------------------------------------------------------------------
create index idx_aisess_user on ai_sessions (user_id, scene, updated_at desc);
create index idx_aimsgs_session on ai_messages (session_id, created_at);

-- -----------------------------------------------------------------------------
-- price_stats（价格统计：夜间物化）
-- -----------------------------------------------------------------------------
-- unique (region_code, rooms, area_bucket) 已能支撑精确口径查询；
-- 补「按区域取最新一批」用于降级口径（region → city）
create index idx_pricestats_region_rooms on price_stats (region_code, rooms, computed_at desc);
create index idx_pricestats_computed on price_stats (computed_at desc);

-- =============================================================================
-- 附：并发下单的推荐写法（服务层）
--
--   begin;
--     select id, status, rent, deposit from listings
--      where id = :listing_id and deleted_at is null
--        for update;                                  -- 拿行锁，避免双锁
--     -- 校验 status = 'online'，否则 409 LISTING_LOCKED
--     insert into orders (...) values (...);           -- 触发 uq_orders_active_listing
--     update listings set status = 'locked' where id = :listing_id;
--     insert into order_status_logs (...);
--   commit;
--
-- 若 insert 命中 uq_orders_active_listing 的唯一冲突 → 回滚并返回 409。
-- =============================================================================
