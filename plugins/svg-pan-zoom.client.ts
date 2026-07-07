import { zoom, pan, getScale, setScale, resetScale } from 'svg-pan-zoom-container'

export default defineNuxtPlugin(() => {
  return {
    provide: {
      pan,
      zoom,
      getScale,
      setScale,
      resetScale,
    },
  }
})
