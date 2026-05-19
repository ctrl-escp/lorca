import {createApp} from 'vue';
import {createPinia} from 'pinia';
import App from './App.vue';

const app = createApp(App);
app.config.errorHandler = (err, _vm, info) => {
  console.error('[Vue error]', info, err);
};
app.use(createPinia());
app.mount('#app');
