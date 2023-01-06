<template>
  <ul
    :class="['board-row', ...modifierClasses, { reverse }]"
    :style="{ gridTemplateColumns: `repeat(${columns}, 15vw)` }"
    v-if="game"
  >
    <li
      :class="['tile', tile.type, `position-${tile.position}`]"
      v-for="tile in tiles"
      :key="tile.position"
    >
      <span class="position" v-show="tile.type === 'normal'">{{ tile.position }}</span>
      <div
        class="orb special-tile"
        :class="[tile.type.replace('.', '-')]"
        v-if="tile.type !== 'normal'"
      />
      <div class="players">
        <template v-for="player in Object.values(game.players)" :key="player.id">
          <PlayerPawn
            class="pawn"
            :player="player"
            v-if="game.position[player.id].currentPosition === tile.position"
          />
        </template>
      </div>
    </li>
  </ul>
</template>
<script lang="ts" setup>
import { PropType } from 'vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { Tile } from '~~/types/game.types'

const { game } = useClientEvents()

const props = defineProps({
  row: {
    type: Array as PropType<Tile[]>,
    required: true,
  },
  columns: {
    type: Number,
    required: true,
  },
  reverse: {
    type: Boolean,
    required: true,
  },
})

const tiles = computed<Tile[]>(() => {
  return props.reverse ? props.row.reverse() : props.row
})

type ModifierClasses = Array<'with-start' | 'with-end'>
const modifierClasses = computed<ModifierClasses>(() => {
  const output: ModifierClasses = []
  for (const tile of props.row) {
    if (tile.type === 'start') output.push('with-start')
    if (tile.type === 'final') output.push('with-end')
  }

  return output
})
</script>
<style lang="scss" scoped>
.board-row {
  gap: 2rem;
  width: 100%;
  display: grid;
  height: 15vw;
  justify-content: center;
  scroll-snap-align: center;
}

.tile {
  display: flex;
  flex-shrink: 0;
  position: relative;
  align-items: center;
  justify-content: center;
  border-top: 0.1rem solid currentColor;
  border-bottom: 0.1rem solid currentColor;
  .players {
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    gap: 1rem;
    display: flex;
    position: absolute;
    align-items: center;
    justify-content: center;
  }
  .pawn {
    max-height: 5rem;
  }
}

.tile:not(.start):not(.final) {
  .special-tile {
    // top: -1.25rem;
    // left: -1.25rem;
    flex-shrink: 0;
    position: absolute;
    width: calc(100% + 1.5rem);
    height: calc(100% + 1.5rem);
    border-radius: 50%;
    transform-origin: center;
    background: var(--soft-mint);
    border: 0.2rem solid currentColor;
  }
  .special-tile::before {
    content: '';
    display: block;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: #fff;
  }
  .special-tile.flag::before {
    mask: url('~/assets/icons/flag.svg') no-repeat center/5rem;
  }

  .special-tile.capital-name::before {
    mask: url('~/assets/icons/capital.svg') no-repeat center/5rem;
  }
  .special-tile.isoCode::before {
    mask: url('~/assets/icons/isoCode.svg') no-repeat center/5rem;
  }
}

.board-row:not(.reverse) .tile:last-child {
  border-left: none;
  border-bottom: none;
  border-radius: 0% 50% 0% 0%;
  border-right: 0.1rem solid #fff;
  &::before {
    left: 0;
    top: calc(100% - 0.1rem);
    bottom: 100%;
    content: '';
    position: absolute;
    display: inline-block;
    height: 3.2rem;
    width: calc(100% - 0.1rem);
    border-left: 0.1rem solid currentColor;
    border-right: 0.1rem solid currentColor;
  }
}

.board-row:not(.reverse):not(.with-start) .tile:first-child {
  border-top: none;
  border-left: 0.1rem solid currentColor;
  border-radius: 0 0 0 50%;
  &::before {
    content: '';
    display: block;
    left: 100%;
    width: 3rem;
    position: absolute;
    height: calc(100% - 0.1rem);
    border-top: 0.1rem solid currentColor;
    border-bottom: 0.1rem solid currentColor;
  }
}

.board-row.with-end {
  li.tile.final {
    border-radius: 50%;
    border: 0.1rem solid currentColor;
    &::before,
    &::after {
      content: none;
    }
  }
  .tile.final + .tile {
    border-radius: 50% 0 0 50%;
    border-left: 0.1rem solid currentColor;
  }
}

.board-row.reverse {
  .tile:first-child {
    border-bottom: none;
    border-radius: 50% 0 0 0;
    border-left: 0.1rem solid currentColor;
    &::before,
    &::after {
      content: '';
      display: block;
      position: absolute;
    }
    &::before {
      top: -0.1rem;
      left: 100%;
      width: 3rem;
      height: calc(100% - 0.1rem);
      border-top: 0.1rem solid currentColor;
      border-bottom: 0.1rem solid currentColor;
    }
    &::after {
      top: 100%;
      height: 3rem;
      left: -0.1rem;
      width: 100%;
      border-left: 0.1rem solid currentColor;
      border-right: 0.1rem solid currentColor;
    }
  }
  .tile:last-child {
    border-left: none;
    border-top: none;
    border-radius: 0% 0 50% 0%;
    border-right: 0.1rem solid #fff;
  }
}

.tile:not(:nth-child(1)):not(:last-child) {
  &::before,
  &::after {
    content: '';
    width: 2rem;
    height: 0.1rem;
    position: absolute;
    display: inline-block;
    background: currentColor;
  }
  &::before {
    top: -0.1rem;
    left: 100%;
  }
  &::after {
    bottom: -0.1rem;
    left: 100%;
  }
}

.tile.start {
  border-radius: 50%;
  border: 0.1rem solid currentColor;

  &::before {
    color: #fff;
    content: '➼';
    top: -999rem;
    bottom: -999rem;
    left: -999rem;
    right: -999rem;
    margin: auto;
    position: absolute;
    width: 100%;
    height: 100%;
    font-size: 5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}
.tile.start + .tile {
  border-radius: 50% 0 0 50%;
  border-left: 0.1rem solid currentColor;
}
</style>
