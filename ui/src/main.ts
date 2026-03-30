import { createApp, defineComponent, h } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import TicketDetail from './views/TicketDetail.vue'
import Projects from './views/Projects.vue'
import Containers from './views/Containers.vue'
import './style.css'

const EmptyState = defineComponent({
  render: () => h('div', { class: 'flex-1 flex items-center justify-center text-gray-400 text-base h-full' }, 'Select a ticket or create a new one')
})

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: EmptyState },
    { path: '/new', component: EmptyState },
    { path: '/projects', component: Projects },
    { path: '/containers', component: Containers },
    { path: '/tickets/:id', component: TicketDetail, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

createApp(App).use(router).mount('#app')
