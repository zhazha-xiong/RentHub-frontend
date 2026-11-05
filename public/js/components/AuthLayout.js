/**
 * 登录 / 注册页布局（与 v2 的 authShell() 一致）
 */
export default {
  name: 'AuthLayout',
  data() {
    return { art: '/assets/modern-living-room-with-stylish-furniture-and.jpg' };
  },
  template: `
  <div class="auth">
    <aside class="auth-art">
      <img :src="art" alt="房源实拍，演示图片">
      <div class="auth-art-in">
        <RouterLink class="brand" to="/login">栖居<span class="brand-en">RentHub</span></RouterLink>
        <p class="tagline">在大连，找到下一年住的地方</p>
      </div>
    </aside>
    <main class="auth-main">
      <div class="auth-box">
        <slot></slot>
      </div>
      <p class="auth-foot">栖居 RentHub · 软件工程综合实训 · 全部数据为教学演示</p>
    </main>
  </div>
  `,
};
