export const useAnimatedGameMap = (maximumMovement = 0.1) => {
  const map = ref<SVGElement>()

  onMounted(() => {
    if (!map.value) {
      console.error('Could not find map')
      return
    }

    const paths = map.value.querySelectorAll('*')

    const countries: {
      movement: number
      element: Element
    }[] = []
    paths.forEach(path => {
      const flipMovement = Math.random() < 0.5
      let movement = Math.random() * maximumMovement
      if (flipMovement) {
        movement = movement * -1
      }

      countries.push({
        movement,
        element: path,
      })
    })

    map.value.addEventListener('mousemove', event => {
      countries.forEach(country => {
        ;(country.element as HTMLElement).style.transform = `translate(${
          (event as MouseEvent).offsetX * country.movement
        }px, 
          ${(event as MouseEvent).offsetY * country.movement}px
          )`
      })
    })
  })

  return {
    map,
  }
}
