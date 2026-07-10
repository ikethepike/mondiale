<template>
  <main>
    <article class="intro pane tr tl decorator-bottom">
      <form :action="`/room/${roomName}`" @submit.prevent="onSubmit">
        <header class="pane-content">
          <a class="logo" />
          <p>A world of facts and figures.</p>
        </header>

        <VariantPicker />

        <nav class="pane-content">
          <ButtonFilled class="start-button">
            <div class="button-content">
              <span>Create Game</span>
              <img src="~/assets/icons/arrow-right.svg" />
            </div>
          </ButtonFilled>
        </nav>
      </form>
    </article>

    <footer class="site-footer">
      <NuxtLink to="/sources">Sources</NuxtLink>
      <span class="divider" aria-hidden="true">·</span>
      <NuxtLink to="/privacy">Privacy</NuxtLink>
      <span class="divider" aria-hidden="true">·</span>
      <span class="copyright">© {{ currentYear }} Mondiale</span>
    </footer>
  </main>
</template>
<script lang="ts" setup>
import { generate } from 'random-words'
const roomName = ref(generate({ exactly: 3, join: '-' }))
const router = useRouter()
const currentYear = new Date().getFullYear()

definePageMeta({
  pageTransition: {
    name: 'start',
  },
})

const onSubmit = (event: Event) => {
  const target = event.target as HTMLFormElement

  const url = new URL(target.action)
  const data = new FormData(target)
  for (const [key, value] of data.entries()) {
    url.searchParams.append(key, value.toString())
  }

  router.push(url.pathname + url.search)
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

main {
  --footer-height: calc(4.8rem + var(--safe-bottom));

  width: 100%;
  display: flex;
  flex-flow: column nowrap;
  min-height: var(--viewport-height);
  position: relative;
  background: transparent;
}
.start-leave-active {
  transition: all 1s;
}
.start-leave-to {
  opacity: 0;
  transform: translateY(-100vh);
}

header {
  text-align: center;
}
.intro {
  width: 40rem;
  max-width: 100%;
  margin: auto;
}

// Phones: the card stretches toward the viewport and its sections spread
// out — logo up top, regions in the middle, the start button anchoring the
// bottom — instead of huddling at content height.
@media screen and (max-width: $tablet) {
  .intro {
    display: flex;
    min-height: calc(var(--viewport-height) - 3rem - var(--footer-height));

    form {
      flex: 1;
      display: flex;
      flex-flow: column nowrap;
      justify-content: space-between;
    }
  }
}
.logo {
  width: 100%;
  height: 4rem;
  display: block;
  background: black;
  margin-bottom: 1rem;
  mask: url(~/assets/logos/mondiale.svg) no-repeat center/contain;
}

nav {
  gap: 2rem;
  display: flex;
}
.start-button {
  width: 100%;
}
.start-button .button-content {
  width: 100%;
  display: flex;
  justify-content: space-between;
}
.start-button img {
  filter: invert(1);
}

.site-footer {
  height: var(--footer-height);
  gap: 1.6rem;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  padding-bottom: var(--safe-bottom);
  font-size: 1.3rem;

  a {
    color: var(--text-color);
    opacity: 0.65;
    text-decoration: underline;
    text-underline-offset: 0.3em;
    transition: opacity var(--motion-quick);

    &:hover {
      opacity: 1;
    }
  }

  .copyright {
    opacity: 0.65;
  }

  .divider {
    opacity: 0.4;
  }
}
</style>
