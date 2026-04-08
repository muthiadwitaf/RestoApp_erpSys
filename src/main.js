import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './assets/main.css'

import { permissionDirective } from './directives/permission'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.directive('permission', permissionDirective)
app.mount('#app')
