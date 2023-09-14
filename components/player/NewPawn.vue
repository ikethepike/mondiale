<template>
  <figure class="pawn">
    <div class="pawn-wrapper">
      <ShapeRectangle width="8rem" height="2rem" color="tomato" class="lower-base" />
      <ShapeRectangle width="5rem" height="2rem" color="tomato" class="upper-base" />
      <ShapeRectangle width="3rem" height="3rem" color="tomato" class="stem-1" />
      <ShapeRectangle width="3rem" height="3rem" color="tomato" class="stem-2" />
      <ShapeRectangle width="5rem" height="4rem" color="tomato" class="head" />
    </div>
  </figure>
</template>
<style lang="scss">
.pawn {
  display: flex;
  width: 11.5rem;
  height: 16.7rem;
  transform-origin: left top;
  transform: scale(0.3);
  flex-flow: column nowrap;
}
.pawn-wrapper {
  display: flex;
  padding: 2rem 0;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  flex-flow: column-reverse nowrap;

  // Magic to scale the pawn
  padding-top: 6.5rem;
  // animation: step 1s infinite;
  > * {
    flex-shrink: 0;
  }
}
.lower-base {
  top: -6.5rem;
}

.stem-1 {
  top: 2.5rem;
}

.stem-2 {
  top: 4.5rem;
}
.head {
  top: 7.5rem;
}

@keyframes step {
  50% {
    transform: rotate(5deg) translate3D(4rem, 4rem, 2rem);
  }
}
</style>
