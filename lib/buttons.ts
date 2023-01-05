import { PropType } from 'vue'

export const useButtonProps = () => {
  return defineProps({
    element: {
      type: String as PropType<'a' | 'button' | 'nuxt-link'>,
      default: 'button',
    },
  })
}
