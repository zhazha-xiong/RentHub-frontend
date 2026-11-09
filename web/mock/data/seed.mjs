/**
 * 假后端的种子数据 —— 与《RentHub 技术文档》第 4 章库表字段一一对应
 *
 * 约定：
 *  - 金额一律整数分（320000 = 3200.00 元）
 *  - 时间一律 ISO 字符串（带 +08:00），由 mock 固定「当前时间」保证断言稳定
 *  - 房源图用 v2 同一批真实照片（见 ./photos.mjs）；只有非实拍图（资质证件、
 *    用户新上传）才回退到 /mock-files/:key 生成的 SVG 占位图
 */

import { galleryFor } from './photos.mjs'

export const REGIONS = [
  { code: 'zhongshan', name: '中山区' },
  { code: 'xigang', name: '西岗区' },
  { code: 'shahekou', name: '沙河口区' },
  { code: 'ganjingzi', name: '甘井子区' },
  { code: 'gaoxin', name: '高新园区' },
  { code: 'jinpu', name: '金普新区' },
  { code: 'jinzhou', name: '金州区' },
  { code: 'kaifaqu', name: '开发区' },
  { code: 'lvshun', name: '旅顺口区' },
  { code: 'pulandian', name: '普兰店区' },
  { code: 'wafangdian', name: '瓦房店市' },
  { code: 'zhuanghe', name: '庄河市' },
  { code: 'changhai', name: '长海县' },
]

export const METRO_LINES = [
  { code: '1', name: '1 号线' },
  { code: '2', name: '2 号线' },
  { code: '3', name: '3 号线' },
  { code: '5', name: '5 号线' },
  { code: '12', name: '12 号线' },
  { code: '13', name: '13 号线' },
]

export const HOUSE_TYPES = [
  { code: 'apartment', name: '普通住宅' },
  { code: 'flat', name: '公寓' },
  { code: 'villa', name: '别墅' },
  { code: 'mixed', name: '商住两用' },
]

export const ORIENTATIONS = [
  { code: 'south', name: '朝南' },
  { code: 'north', name: '朝北' },
  { code: 'east', name: '朝东' },
  { code: 'west', name: '朝西' },
  { code: 'south_north', name: '南北' },
  { code: 'southeast', name: '东南' },
  { code: 'southwest', name: '西南' },
]

export const DECORATIONS = [
  { code: 'fine', name: '精装' },
  { code: 'simple', name: '简装' },
  { code: 'rough', name: '毛坯' },
]

export const RENT_BUCKETS = [
  { min: 0, max: 150000 },
  { min: 150000, max: 250000 },
  { min: 250000, max: 350000 },
  { min: 350000, max: 500000 },
  { min: 500000, max: 800000 },
  { min: 800000, max: null },
]

export const FACILITIES = {
  bed: [
    { code: 'bed', name: '床' },
    { code: 'wardrobe', name: '衣柜' },
    { code: 'desk', name: '书桌' },
    { code: 'ac', name: '空调' },
    { code: 'washer', name: '洗衣机' },
    { code: 'fridge', name: '冰箱' },
  ],
  public: [
    { code: 'elevator', name: '电梯' },
    { code: 'wifi', name: '宽带' },
    { code: 'heating', name: '暖气' },
    { code: 'gas', name: '燃气' },
    { code: 'parking', name: '车位' },
    { code: 'balcony', name: '阳台' },
  ],
}

export const FILTERS = {
  regions: REGIONS,
  metro_lines: METRO_LINES,
  house_types: HOUSE_TYPES,
  orientations: ORIENTATIONS,
  decorations: DECORATIONS,
  rent_buckets: RENT_BUCKETS,
  facilities: FACILITIES,
}

const iso = (s) => new Date(s).toISOString()

/** 演示账号：密码统一 renthub123（mock 里明文即可，真后端用 argon2） */
export const USERS = [
  { id: 1, account: 'xiaofs', password: 'renthub123', role: 'tenant', nickname: '肖福晟', phone: '13800006621', status: 'active', createdAt: iso('2026-09-12T10:00:00+08:00') },
  { id: 2, account: 'xingchen', password: 'renthub123', role: 'merchant', nickname: '星辰公寓', phone: '0411-88886621', status: 'active', createdAt: iso('2026-03-02T10:00:00+08:00') },
  { id: 3, account: 'guanli', password: 'renthub123', role: 'admin', nickname: '管理员', phone: null, status: 'active', createdAt: iso('2026-01-01T10:00:00+08:00') },
  { id: 4, account: 'haibin', password: 'renthub123', role: 'merchant', nickname: '海滨小屋', phone: '0411-88880001', status: 'active', createdAt: iso('2026-10-20T10:00:00+08:00') },
  { id: 5, account: 'wangjx', password: 'renthub123', role: 'tenant', nickname: '王俊锡', phone: '13900002180', status: 'active', createdAt: iso('2026-10-28T10:00:00+08:00') },
]

export const QUALIFICATIONS = [
  {
    id: 1, userId: 2, legalName: '星辰公寓管理（大连）有限公司', status: 'approved',
    submittedAt: iso('2026-10-26T09:40:00+08:00'), reviewedAt: iso('2026-10-28T14:02:00+08:00'),
    reviewerId: 3, rejectReason: null,
    files: [
      { id: 1, objectKey: 'qual/license-1.png', fileName: '营业执照.png' },
      { id: 2, objectKey: 'qual/idcard-1.png', fileName: '法人身份证.png' },
    ],
  },
  {
    id: 2, userId: 4, legalName: '海滨小屋房屋租赁服务部', status: 'pending',
    submittedAt: iso('2026-11-05T09:40:00+08:00'), reviewedAt: null, reviewerId: null, rejectReason: null,
    files: [{ id: 3, objectKey: 'qual/license-2.png', fileName: '营业执照.png' }],
  },
]

/**
 * v2 detail.html 的两组设施：卧室 8 项 + 公共 8 项。
 * 这是「演示数据的默认值」，不是前端硬编码——前端只按后端返回的 code 渲染，
 * 真后端返回多少项、什么顺序，页面就照着显示（见 utils/facilities.ts 的兜底）。
 */
const BED_FULL = ['tv', 'ac', 'wardrobe', 'bed', 'bath', 'lock', 'balcony', 'heater']
const PUBLIC_FULL = ['fridge', 'washer', 'water', 'wifi', 'sofa', 'hood', 'stove', 'cook']

const house = (o) => ({
  halls: 1, baths: 1, floor: 8, totalFloor: 26, orientation: 'south_north', decoration: 'fine',
  houseType: 'apartment', rentType: 'whole', hasElevator: true, minLeaseMonths: 6,
  paymentMethod: '押一付三', viewingMethod: '随时可看', parking: null, status: 'online',
  viewCount: 120, favoriteCount: 6, serviceFeeRate: 0.05,
  facilities: { bed: BED_FULL, public: PUBLIC_FULL },
  images: [],
  ...o,
})

export const LISTINGS = [
  house({
    id: 101, merchantId: 2, title: '星海广场 · 2室1厅', regionCode: 'shahekou', community: '星海广场',
    address: '大连市沙河口区星海广场东路 6 号 3 单元 1402',
    description: '房子在星海广场东侧，步行到地铁 1 号线约 320 米。南北通透，主卧朝南，客厅带 3.6 米宽阳台。房东自住装修，家电齐全，可拎包入住。楼下有便利店与菜市场，小区 24 小时门禁。',
    metroLine: '1', walkMinutes: 5, walkMeters: 320, rooms: 2, area: 86, floor: 14, totalFloor: 26,
    rent: 320000, deposit: 320000, availableDate: '2026-12-01', publishedAt: iso('2026-11-01T10:00:00+08:00'),
    createdAt: iso('2026-10-28T10:00:00+08:00'),
    /* 与旧版 detail.html 的「卧室设施 / 公共设施」完全对齐 */
    facilities: {
      bed: ['tv', 'ac', 'wardrobe', 'bed', 'bath', 'lock', 'balcony', 'heater'],
      public: ['fridge', 'washer', 'water', 'wifi', 'sofa', 'hood', 'stove', 'cook'],
    },
    parking: '小区地下车库，另计',
    images: galleryFor(101),
  }),
  house({
    id: 102, merchantId: 2, title: '和平广场 · 1室1厅', regionCode: 'shahekou', community: '和平广场',
    address: '大连市沙河口区中山路 550 号', description: '步行到地铁 1 号线和平广场站约 640 米，楼下就是和平广场商圈，超市、餐饮、影院都在 500 米之内。一室一厅朝南，客厅带 2.4 米窗台，冬天日照能到下午三点。简装但家电齐全，独立厨房可以做饭。小区 24 小时门禁、双梯入户，物业费由房东承担。',
    metroLine: '1', walkMinutes: 8, rooms: 1, halls: 1, area: 52, floor: 6, totalFloor: 18,
    orientation: 'south', decoration: 'simple', rent: 185000, deposit: 185000,
    availableDate: '2026-11-20', publishedAt: iso('2026-10-30T10:00:00+08:00'),
    createdAt: iso('2026-10-29T10:00:00+08:00'),
    facilities: { bed: ['tv', 'ac', 'wardrobe', 'bed', 'bath', 'lock', 'balcony', 'heater'], public: ['fridge', 'washer', 'water', 'wifi', 'sofa', 'hood', 'stove', 'cook'] },
    parking: '路边可停车，无固定车位',

    images: galleryFor(102),
  }),
  house({
    id: 103, merchantId: 2, title: '软件园 · 2室2厅', regionCode: 'gaoxin', community: '软件园',
    address: '大连市高新园区软件园路 80 号', description: '在软件园二期北门对面，步行到公司 10 分钟以内，通勤几乎不用挤地铁。两室两厅双卫，东南向，客厅与主卧都朝小区内景，安静不吵。精装带全套家电，主卧 1.8 米床，次卧现做书房可随时换成床。楼下有便利店、健身房与三家咖啡，24 小时安保，外卖可直送到门口。',
    metroLine: '1', walkMinutes: 10, rooms: 2, halls: 2, area: 98, floor: 11, totalFloor: 24,
    orientation: 'southeast', rent: 410000, deposit: 410000, availableDate: '2026-12-05',
    publishedAt: iso('2026-10-25T10:00:00+08:00'), createdAt: iso('2026-10-24T10:00:00+08:00'),
    parking: '小区地下车库，300 元/月',

    images: galleryFor(103),
  }),
  house({
    id: 104, merchantId: 2, title: '青泥洼桥 · 单间', regionCode: 'zhongshan', community: '青泥洼桥',
    address: '大连市中山区人民路 12 号', description: '市中心合租单间，步行到地铁 2 号线青泥洼桥站 3 分钟，去火车站只要一站地。房间朝东，早上采光好，配 1.5 米床、独立衣柜与书桌。公共区域三人合用，厨房、洗衣机、热水器齐全，另两位室友都是上班族，作息规律。水电网费三人均摊，物业费已含在租金里。',
    metroLine: '2', walkMinutes: 3, rooms: 1, halls: 0, baths: 0, area: 22, floor: 5, totalFloor: 12,
    orientation: 'east', decoration: 'simple', rentType: 'shared', rent: 120000, deposit: 120000,
    status: 'offline', availableDate: '2026-11-15', publishedAt: iso('2026-10-10T10:00:00+08:00'),
    createdAt: iso('2026-10-09T10:00:00+08:00'),
    facilities: { bed: ['tv', 'ac', 'wardrobe', 'bed', 'desk', 'lock', 'heater'], public: ['fridge', 'washer', 'water', 'wifi', 'hood', 'stove', 'cook'] },
    parking: '楼下路边可停，无固定车位',
    paymentMethod: '押一付一',

    images: galleryFor(104),
  }),
  house({
    id: 105, merchantId: 2, title: '西安路 · 2室1厅', regionCode: 'shahekou', community: '西安路',
    address: '大连市沙河口区黄河路 700 号', description: '西安路商圈，地铁 1、2 号线换乘站步行 480 米，楼下就是罗斯福与锦辉商场。两室一厅朝南，客厅开间 3.3 米，采光通透不遮。精装带家具家电，拎包即可入住。小区有电梯与 24 小时门禁，周边菜市场、药店、银行齐全，晚上十点后街面也很安静。',
    metroLine: '2', walkMinutes: 6, rooms: 2, area: 78, floor: 9, totalFloor: 20, orientation: 'south',
    rent: 265000, deposit: 265000, status: 'rented', availableDate: '2026-09-01',
    publishedAt: iso('2026-08-20T10:00:00+08:00'), createdAt: iso('2026-08-19T10:00:00+08:00'),
    parking: '小区地面车位，先到先得',

    images: galleryFor(105),
  }),
  house({
    id: 106, merchantId: 4, title: '高新区合租 · 主卧', regionCode: 'gaoxin', community: '华录小区',
    address: '大连市高新园区黄浦路 18 号', description: '华录小区主卧带独立卫生间，步行到地铁 1 号线河口站约 960 米，楼下有公交直达软件园。房间朝南，独立空间加独立卫浴，配 1.5 米床与书桌。另外两位室友都是程序员，作息规律、很少在家做饭。公共厨房可做饭，热水器与洗衣机共用。老小区共 6 层，三楼步行不吃力。',
    metroLine: '1', walkMinutes: 12, rooms: 3, halls: 1, baths: 2, area: 30, floor: 3, totalFloor: 6,
    orientation: 'south', decoration: 'simple', rentType: 'shared', rent: 135000, deposit: 135000,
    status: 'offline', availableDate: '2026-12-10', publishedAt: null,
    createdAt: iso('2026-11-02T10:00:00+08:00'),
    facilities: { bed: ['bed', 'wardrobe', 'desk', 'ac', 'bath', 'lock', 'heater'], public: ['fridge', 'washer', 'water', 'wifi', 'sofa', 'hood', 'stove', 'cook'] },
    parking: '小区内免费停车',
    paymentMethod: '押一付一',

    images: galleryFor(106),
  }),
  house({
    id: 107, merchantId: 2, title: '中山广场 · 3室2厅', regionCode: 'zhongshan', community: '中山广场',
    address: '大连市中山区中山广场 3 号', description: '中山广场老牌高档小区，18 层，南北通透，三室两厅双卫，主卧带独立衣帽间。客厅开间 4.2 米，视线能看到广场绿地，晚上灯光很好。豪装带中央空调与全套德系家电，家具可按需保留或清空。小区有会所、地下车库与 24 小时管家，步行到地铁 2 号线约 320 米。',
    metroLine: '2', walkMinutes: 4, rooms: 3, halls: 2, baths: 2, area: 128, floor: 18, totalFloor: 30,
    orientation: 'south_north', rent: 760000, deposit: 760000, availableDate: '2027-01-01',
    publishedAt: iso('2026-10-18T10:00:00+08:00'), createdAt: iso('2026-10-17T10:00:00+08:00'),
    parking: '地下车库两个车位，含在租金内',
    paymentMethod: '押一付六',
    viewingMethod: '预约看房',
    minLeaseMonths: 12,

    images: galleryFor(107),
  }),
  house({
    id: 108, merchantId: 2, title: '甘井子 · 2室1厅', regionCode: 'ganjingzi', community: '泡崖小区',
    address: '大连市甘井子区泡崖街 45 号', description: '泡崖小区性价比两居，南北通透，4 层共 6 层，没有电梯。步行到地铁 1 号线约 1.2 公里，楼下 3 路、19 路公交直达西安路。简装，基础家电齐全，软装可以自己添置。楼下就是菜市场与小学，接送方便，适合小家庭或两人合租。物业费每月 40 元，由租客承担。',
    metroLine: '1', walkMinutes: 15, rooms: 2, area: 72, floor: 4, totalFloor: 6, hasElevator: false,
    orientation: 'south_north', decoration: 'simple', rent: 168000, deposit: 168000,
    availableDate: '2026-11-25', publishedAt: iso('2026-10-22T10:00:00+08:00'),
    createdAt: iso('2026-10-21T10:00:00+08:00'),
    parking: '楼下免费停车',

    images: galleryFor(108),
  }),
  house({
    id: 109, merchantId: 2, title: '旅顺 · 1室1厅', regionCode: 'lvshun', community: '太阳沟',
    address: '大连市旅顺口区太阳沟路 9 号', description: '太阳沟老街区，很安静，窗外是梧桐与老房子，适合学习与远程办公。一室一厅朝西，下午光线好，48 ㎡ 实用不浪费。简装带床、书桌、衣柜与空调，厨房可以做饭。步行 8 分钟到公交总站，坐 3 站到轻轨 12 号线。周边有菜市场与两家开了十几年的咖啡馆。',
    metroLine: null, walkMinutes: null, rooms: 1, halls: 1, area: 48, floor: 2, totalFloor: 5,
    orientation: 'west', hasElevator: false, decoration: 'simple', rent: 98000, deposit: 98000,
    availableDate: '2026-12-15', publishedAt: iso('2026-10-15T10:00:00+08:00'),
    createdAt: iso('2026-10-14T10:00:00+08:00'),
    parking: '楼下可免费停车',

    images: galleryFor(109),
  }),
  house({
    id: 110, merchantId: 2, title: '甘井子 · 4室2厅', regionCode: 'ganjingzi', community: '泉水小区',
    address: '大连市甘井子区泉水街 88 号', description: '泉水小区大四居，156 ㎡，四室两厅双卫，适合多人合住或三代同住。东南向，客厅带 4 米景观阳台，餐厅独立，动线清楚。精装带全套家电，两间次卧可做书房或客房。地下一层 B 区含一个固定车位。步行到地铁 3 号线约 720 米，小区内有人工湖与健身区，晚上散步的人不少。',
    metroLine: '3', walkMinutes: 9, rooms: 4, halls: 2, baths: 2, area: 156, floor: 6, totalFloor: 11,
    orientation: 'southeast', rent: 560000, deposit: 560000, availableDate: '2027-01-10',
    publishedAt: iso('2026-10-28T10:00:00+08:00'), createdAt: iso('2026-10-27T10:00:00+08:00'),
    parking: '地下一层 B 区', images: galleryFor(110),
  }),
  /* 以下两套是为了让首页瀑布流像 v2 一样「3 列 × 3 行」铺满，
     每套的封面都是 9 张实拍图里不同的一张，不重复 */
  house({
    id: 111, merchantId: 2, title: '金州 · 1室1厅', regionCode: 'jinzhou', community: '光明街小区',
    address: '大连市金州区光明街 22 号', description: '光明街小户型公寓，一室一厅 38 ㎡，朝南，独立厨卫，适合一个人住。楼下就是菜市场与便利店，步行 560 米到轻轨 3 号线光明街站，到开发区通勤约 25 分钟。简装但家电齐全，含空调、洗衣机与冰箱，物业费已含在租金内。有电梯，24 小时门禁，快递柜在一楼大堂。',
    metroLine: '3', walkMinutes: 7, rooms: 1, halls: 1, area: 38, floor: 5, totalFloor: 12,
    orientation: 'south', decoration: 'simple', houseType: 'flat', rent: 150000, deposit: 150000,
    availableDate: '2026-11-20', publishedAt: iso('2026-11-05T08:10:00+08:00'),
    createdAt: iso('2026-11-04T10:00:00+08:00'),
    facilities: { bed: ['tv', 'ac', 'wardrobe', 'bed', 'bath', 'lock', 'balcony', 'heater'], public: ['fridge', 'washer', 'water', 'wifi', 'sofa', 'hood', 'stove', 'cook'] },
    parking: '楼下路边可停',
    paymentMethod: '押一付一',

    images: galleryFor(111),
  }),
  house({
    id: 112, merchantId: 2, title: '西岗 · 2室1厅', regionCode: 'xigang', community: '人民广场',
    address: '大连市西岗区北京街 7 号', description: '人民广场附近的老小区，刚整体翻新过，水电管线全部换新，南北通透。两室一厅 68 ㎡，主卧 1.5 米床，次卧可做书房或儿童房。精装带新家电，厨房有燃气灶与油烟机。步行 400 米到地铁 2 号线人民广场站，楼下有早市与两家面馆。共 6 层，三楼不高，没有电梯。',
    metroLine: '2', walkMinutes: 5, rooms: 2, area: 68, floor: 3, totalFloor: 6,
    orientation: 'south_north', hasElevator: false, rent: 230000, deposit: 230000,
    availableDate: '2026-12-01', publishedAt: iso('2026-11-03T09:20:00+08:00'),
    createdAt: iso('2026-11-02T10:00:00+08:00'),
    parking: '小区内可停，50 元/月',
    images: galleryFor(112),
  }),
]

export const ORDERS = [
  {
    id: 1001, orderNo: '20261105-000123', tenantId: 1, merchantId: 2, listingId: 103,
    rent: 410000, months: 6, deposit: 410000, serviceFee: 123000, totalAmount: 2893000,
    checkInDate: '2026-11-20', status: 'confirmed',
    snapshot: { version: 1, title: '软件园 · 2室2厅', layout: '2室2厅', regionName: '高新园区', cover: galleryFor(103)[0].key },
    createdAt: iso('2026-10-28T19:40:00+08:00'), confirmedAt: iso('2026-10-28T20:10:00+08:00'),
    completedAt: null, closedAt: null, reason: null,
  },
  {
    id: 1002, orderNo: '20261105-000124', tenantId: 1, merchantId: 2, listingId: 101,
    rent: 320000, months: 12, deposit: 320000, serviceFee: 192000, totalAmount: 4192000,
    checkInDate: '2026-12-01', status: 'pending',
    snapshot: { version: 1, title: '星海广场 · 2室1厅', layout: '2室1厅', regionName: '沙河口区', cover: galleryFor(101)[0].key },
    createdAt: iso('2026-11-04T10:22:00+08:00'), confirmedAt: null,
    completedAt: null, closedAt: null, reason: null,
  },
]

export const ORDER_LOGS = [
  { id: 1, orderId: 1001, fromStatus: null, toStatus: 'pending', operatorId: 1, reason: null, createdAt: iso('2026-10-28T19:40:00+08:00') },
  { id: 2, orderId: 1001, fromStatus: 'pending', toStatus: 'confirmed', operatorId: 2, reason: null, createdAt: iso('2026-10-28T20:10:00+08:00') },
  { id: 3, orderId: 1002, fromStatus: null, toStatus: 'pending', operatorId: 1, reason: null, createdAt: iso('2026-11-04T10:22:00+08:00') },
]

export const PAYMENTS = [
  { id: 1, orderId: 1001, type: 'pay', amount: 2893000, status: 'success', tradeNo: 'MOCK20261028201000001', createdAt: iso('2026-10-28T20:12:00+08:00') },
]

export const NOTIFICATIONS = [
  { id: 1, userId: 1, type: 'order', title: '商家已接单', body: '星辰公寓已确认你的订单 20261105-000123，房源已为你锁定。', targetType: 'order', targetId: 1001, isRead: false, createdAt: iso('2026-10-28T20:10:00+08:00') },
  { id: 2, userId: 1, type: 'listing', title: '你收藏的房源已下架', body: '「青泥洼桥 · 单间」已被商家下架，你可以看看相似房源。', targetType: 'listing', targetId: 104, isRead: false, createdAt: iso('2026-11-04T09:12:00+08:00') },
  { id: 3, userId: 1, type: 'system', title: '欢迎使用栖居 RentHub', body: '当前为演示环境，数据均为教学演示数据。', targetType: null, targetId: null, isRead: true, createdAt: iso('2026-09-12T10:05:00+08:00') },
]

export const FAVORITES = [
  { userId: 1, listingId: 101, createdAt: iso('2026-10-30T10:00:00+08:00') },
  { userId: 1, listingId: 102, createdAt: iso('2026-10-31T10:00:00+08:00') },
  { userId: 1, listingId: 103, createdAt: iso('2026-11-01T10:00:00+08:00') },
]

/** 初始 AI 会话（演示历史记录用） */
export const AI_SESSIONS = [
  { id: 1, userId: 1, scene: 'find_house', context: { rentMax: 320000, rooms: 2 }, createdAt: iso('2026-11-03T10:00:00+08:00'), updatedAt: iso('2026-11-03T10:02:00+08:00') },
]

export const AI_MESSAGES = [
  { id: 1, sessionId: 1, role: 'user', content: '沙河口 两室 3000 以内', payload: {}, createdAt: iso('2026-11-03T10:00:00+08:00') },
  { id: 2, sessionId: 1, role: 'assistant', content: '按「沙河口区 · 二室 · ≤3000 · 有电梯」为你找到 2 套。', payload: { conditions: { region: 'shahekou', rooms: 2, rentMax: 300000, hasElevator: true } }, createdAt: iso('2026-11-03T10:00:05+08:00') },
]
