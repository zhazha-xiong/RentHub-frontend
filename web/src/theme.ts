import type { ConfigProviderProps } from 'ant-design-vue'

/**
 * 主题：延续旧版静态站的设计令牌（frontend-vue/public/style.css :root）
 *
 *   --primary #0958d9  --text #1f1f1f/#595959/#737373  --border #d9d9d9
 *   --r-card 8px  --r-ctl 4px  --price #d4380d  --bg #f5f5f5
 *
 * 旧版「细边框 + 大留白 + 价格橙红」的气质保留，控件换成 Ant Design Vue 4。
 */
export const theme: NonNullable<ConfigProviderProps['theme']> = {
  token: {
    colorPrimary: '#0958d9',
    colorLink: '#0958d9',
    colorText: '#1f1f1f',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#737373',
    colorBorder: '#d9d9d9',
    colorBorderSecondary: '#f0f0f0',
    colorBgLayout: '#f5f5f5',
    colorFillQuaternary: '#fafafa',
    colorError: '#e5484d',
    colorWarning: '#ad6800',
    colorSuccess: '#3f8600',
    borderRadius: 8,
    borderRadiusLG: 8,
    borderRadiusSM: 4,
    fontSize: 14,
    fontFamily:
      "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    wireframe: false,
  },
  components: {
    Button: { borderRadius: 4, controlHeight: 34 },
    Input: { borderRadius: 4 },
    InputNumber: { borderRadius: 4 },
    Select: { borderRadius: 4 },
    Card: { borderRadiusLG: 8, paddingLG: 18 },
    Table: { borderRadius: 8 },
  },
}

/** 价格用的强调色（旧版 --price: #d4380d） */
export const PRICE_COLOR = '#d4380d'
