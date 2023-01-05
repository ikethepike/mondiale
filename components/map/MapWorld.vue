<template>
  <svg
    id="world-map"
    width="600"
    height="600"
    ref="map"
    viewBox="0 0 600 600"
    fill="transparent"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="600" height="600" />
    <circle cx="300" cy="300" r="274.5" stroke="currentColor" />
    <path
      d="M100.709 233.71C71.0581 225.683 5.5462 165.478 30.5889 128.352L100.709 53.0956L185.854 25H271L222.918 213.642L150.795 296.925L132.764 319C134.433 293.915 130.359 241.737 100.709 233.71Z"
      stroke="currentColor"
    />
    <path
      d="M193.241 319L77.5103 348.812L62 432.286L109.724 573H149.097L235 432.286L193.241 319Z"
      stroke="currentColor"
    />
    <path
      d="M394 346L460.5 320.5L564.5 379L514.5 463.5L486 524L469.5 566.5L445.5 558.5L422.5 480.5L409 448.5L383.5 439.5L358 408L370 379L394 346Z"
      stroke="currentColor"
    />
    <path
      d="M406 248L430 223.5V181.5L448.5 180L466.5 190.5L502.5 181.5L548 171L534.5 153L502.5 130V153L487.5 171L478.5 153V118L487.5 83.5L513 100L548 139L573.5 199.5L584 248L593 328L584 314L573.5 328L563 314L573.5 291.5L548 242H519.5L502.5 248L478.5 266L456 291.5L416.5 284L406 248Z"
      stroke="currentColor"
    />
    <path d="M281 91L311 73H355L367 140.5L342.5 183L296 140.5L281 91Z" stroke="currentColor" />
    <path
      d="M416.5 113.5L430 104.5L442 119.5L437.5 128.5L440.5 143.5L448 154L442 168.5L437.5 164H427L409 168.5V158.5L416.5 145V131.5V113.5Z"
      stroke="currentColor"
    />
    <path
      d="M398.5 164V151.5L385.5 157L375.5 172.5L378.5 186L395 179.5L398.5 164Z"
      stroke="currentColor"
    />
  </svg>
</template>
<script lang="ts" setup>
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
    const movement = Math.random() < 0.5 ? Math.random() * 0.1 : Math.random() * -0.1

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
</script>
<style scoped>
svg {
  width: 100%;
  display: block;
  max-height: 100%;
}
svg > * {
  pointer-events: none;
}
</style>
