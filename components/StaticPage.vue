<template>
  <main>
    <article class="page pane tr tl decorator-bottom">
      <div class="pane-content">
        <slot />

        <nav>
          <ButtonLine element="NuxtLink" to="/" class="back-button">
            <div class="button-content">
              <img src="~/assets/icons/arrow-left.svg" alt="" />
              <span>Back to start</span>
            </div>
          </ButtonLine>
        </nav>
      </div>
    </article>
  </main>
</template>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

main {
  width: 100%;
  display: flex;
  flex-flow: column nowrap;
  min-height: var(--viewport-height);
  position: relative;
  background: transparent;
}

.page {
  width: 46rem;
  max-width: 100%;
  margin: auto;

  @media screen and (min-width: $tablet) {
    margin: 6rem auto;
  }
}

nav {
  margin-top: 3rem;
}

.back-button {
  width: 100%;
}
.back-button .button-content {
  width: 100%;
  gap: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
