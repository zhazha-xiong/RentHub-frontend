/**
 * 全局提示（新增元素，不属于 v2 排版）
 */
import { state } from '../store.js';

export default {
  name: 'ToastHost',
  setup() { return { state }; },
  template: `
    <div class="toast-host" aria-live="polite">
      <div v-if="state.toast" class="toast" :class="state.toast.kind">{{ state.toast.message }}</div>
    </div>
  `,
};
