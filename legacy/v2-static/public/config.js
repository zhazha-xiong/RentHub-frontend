/* ==========================================================================
 * 前端配置 —— 请填写你自己的高德 Key，保存后刷新页面即可
 * 高德控制台：https://console.amap.com/dev/key/app
 *   1) JS API Key：应用类型必须选「Web端(JS API)」，并配置域名白名单（本地可加 127.0.0.1 / localhost）
 *   2) 安全密钥 securityJsCode：同一应用的安全密钥（jscode）
 * 注意：JS API Key ≠ Web 服务 Key。后端需要另一个「Web服务」类型 Key（见 config.server.json）
 * ========================================================================== */
window.APP_CONFIG = {
  /* ---------- 高德 JS API（详情页可交互地图） ---------- */
  AMAP_JS_KEY: '57e607aafb23aeabfa3d7ca6c04da50d',          // 例：'a1b2c3d4e5f6...'（Web端 JS API 类型）
  AMAP_SECURITY_CODE: 'c3700c9ba2b2a0bed4addb4da47529ab',   // 例：'d1e2f3a4b5c6...'（安全密钥 jscode）

  /* ---------- 房源封面图片（开放图片库，可自由替换） ----------
   * 默认 Lorem Picsum：https://picsum.photos
   * 占位符：{seed} 稳定随机种子 · {w} 宽度 · {h} 高度
   * 可换成任意开放图床，例如：
   *   'https://placehold.co/{w}x{h}/0f766e/ffffff?text={seed}'
   */
  IMAGE_TEMPLATE: 'https://picsum.photos/seed/{seed}/600/{h}',
  IMAGE_SEED_PREFIX: 'dalian-house-',

  /* ---------- 详情页地图 ---------- */
  MAP_ZOOM: 16,
};
