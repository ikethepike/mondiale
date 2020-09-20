import { Plugin } from '@nuxt/types'
import axios, { AxiosInstance } from 'axios'

declare module 'vuex/types/index' {
  interface Store<S> {
    $api: AxiosInstance
  }
}

declare module 'vue/types/vue' {
  interface Vue {
    $api: AxiosInstance
  }
}

declare module '@nuxt/types' {
  interface Context {
    $api: AxiosInstance
  }
}

const api: Plugin = (context, inject) => {
  const api = axios.create({
    baseURL: context.route.path,
  })

  inject('api', api)
}

export default api
