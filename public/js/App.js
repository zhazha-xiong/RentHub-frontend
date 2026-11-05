import { computed, useRoute, watch, nextTick } from './lib.js';
import AppShell from './components/AppShell.js';
import AuthLayout from './components/AuthLayout.js';
import ToastHost from './components/ToastHost.js';

export default {
  name: 'App',
  components: { AppShell, AuthLayout, ToastHost },
  setup() {
    const route = useRoute();
    const isAuth = computed(() => route.meta.layout === 'auth');
    return { isAuth };
  },
  template: `
    <AppShell v-if="!isAuth">
      <RouterView />
    </AppShell>
    <AuthLayout v-else>
      <RouterView />
    </AuthLayout>
    <ToastHost />
  `,
};
