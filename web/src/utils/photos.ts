/**
 * 前端用到的「装饰图」地址
 *
 * 房源图片一律由假后端返回（/mock-files/...，见 web/mock/data/photos.mjs），
 * 前端不硬编码任何房源图。这里只放不依赖后端的 UI 装饰图（登录页左栏那张）。
 * 接真后端或做生产构建时，把这里换成 CDN / public 下的静态资源即可，页面不用改。
 */
export const AUTH_ART = '/mock-files/assets/modern-living-room-with-stylish-furniture-and.jpg'
