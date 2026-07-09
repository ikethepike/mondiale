<template>
  <div class="currency-review">
    <nav class="controls">
      <button type="button" @click="randomize">🎲 Randomize currency</button>
      <label class="toggle">
        <input v-model="onlyWithImage" type="checkbox" @change="randomize" />
        Only currencies with a banknote image
      </label>
      <span class="meter">{{ withImageCount }} / {{ totalCount }} currencies have an image</span>
    </nav>

    <!-- Mirrors the money-match block in ViewIndividualChallenge.vue. -->
    <div v-if="challenge" class="stage">
      <h1 class="map-caption">Which country uses this currency?</h1>
      <div v-if="challenge.image" class="money-hero money-hero-photo">
        <img class="money-note" :src="challenge.image" alt="A banknote" />
        <span class="money-code">{{ getCountry(challenge.country).currency }}</span>
      </div>
      <div v-else class="money-hero">
        <span class="money-symbol">{{
          currencySymbol(getCountry(challenge.country).currency)
        }}</span>
        <span class="money-code">{{ getCountry(challenge.country).currency }}</span>
      </div>

      <div class="options card-options">
        <button
          v-for="option in challenge.options"
          :key="option"
          class="option card-option"
          type="button"
          @click="reveal(option)"
        >
          <CountryTileFlag class="option-flag" :country="getCountry(option)" />
          <span>{{ countryName(option) }}</span>
        </button>
      </div>

      <p class="answer">
        Answer: <strong>{{ countryName(challenge.country) }}</strong> ({{
          getCountry(challenge.country).currency
        }}
        — {{ currencyName }})
        <span v-if="picked"
          >· you picked {{ countryName(picked) }} —
          <strong
            :class="{ right: picked === challenge.country, wrong: picked !== challenge.country }"
          >
            {{ picked === challenge.country ? 'correct' : 'wrong' }}
          </strong>
        </span>
      </p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { COUNTRIES } from '~~/data/countries.gen'
import { CURRENCIES } from '~~/data/currencies.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { countryName, getCountry } from '~~/lib/country'
import { currencySymbol } from '~~/lib/currency'
import { shuffleArray } from '~~/lib/arrays'
import type { ISOCountryCode } from '~~/types/geography.types'

// Dev harness for the Money Match challenge, mirroring dealMoneyMatch.
interface MoneyChallenge {
  country: ISOCountryCode
  options: ISOCountryCode[]
  image?: string
}

const withCurrency = ISOCountryCodes.filter(iso => !!COUNTRIES[iso].currency)
const totalCount = new Set(withCurrency.map(iso => COUNTRIES[iso].currency)).size
const withImageCount = Object.values(CURRENCIES).filter(entry => entry.image).length

const onlyWithImage = ref(true)
const challenge = ref<MoneyChallenge | null>(null)
const picked = ref<ISOCountryCode | null>(null)

const currencyName = computed(() => {
  const code = challenge.value && getCountry(challenge.value.country).currency
  return (code && CURRENCIES[code]?.name) || code || '—'
})

const deal = (): MoneyChallenge | null => {
  const eligible = onlyWithImage.value
    ? withCurrency.filter(iso => !!CURRENCIES[COUNTRIES[iso].currency!]?.image)
    : withCurrency
  const subject = shuffleArray([...eligible])[0]
  if (!subject) return null

  const currency = COUNTRIES[subject].currency
  const decoys = shuffleArray(
    withCurrency.filter(iso => COUNTRIES[iso].currency !== currency)
  ).slice(0, 3)
  const image = currency ? CURRENCIES[currency]?.image : undefined

  return { country: subject, options: shuffleArray([subject, ...decoys]), image }
}

const randomize = () => {
  picked.value = null
  challenge.value = deal()
}

const reveal = (option: ISOCountryCode) => {
  picked.value = option
}

onMounted(randomize)
</script>

<style lang="scss" scoped>
.currency-review {
  min-height: 100vh;
  padding: 2rem 1rem 4rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.6rem;
  background: var(--background-color);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.2rem;

  button {
    cursor: pointer;
    padding: 0.7rem 1.4rem;
    border-radius: 0.8rem;
    font-size: 1rem;
    color: var(--background-color);
    background: var(--dark-blue);
    border: none;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    color: var(--dark-blue);
  }

  .meter {
    color: var(--soft-blue);
    font-size: 0.9rem;
  }
}

.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(94vw, 60rem);
  max-height: 100vh;
  overflow-y: auto;
}

.answer {
  margin-top: 1.6rem;
  color: var(--soft-blue);

  .right {
    color: #2e7d32;
  }
  .wrong {
    color: #c62828;
  }
}

// Copied from ViewIndividualChallenge.vue so the preview matches.
.money-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  margin: 1.6rem 0 0.4rem;

  .money-symbol {
    font-size: 8rem;
    line-height: 1;
    font-weight: 700;
    color: var(--dark-blue);
    font-family: 'Lusitana', serif;
  }
  .money-code {
    font-size: 1.6rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--soft-blue);
  }
}

.money-hero-photo {
  gap: 0.8rem;

  .money-note {
    width: auto;
    height: auto;
    max-width: min(40rem, 90vw);
    max-height: 42vh;
    object-fit: contain;
    border-radius: 0.6rem;
    box-shadow: 0 0.6rem 1.8rem hsla(215.7, 76.4%, 21.6%, 0.28);
  }
}

@media (max-width: 640px) {
  .money-hero-photo .money-note {
    max-height: 34vh;
  }
}

.card-options {
  gap: 1.4rem;
  display: grid;
  margin-top: 1.4rem;
  grid-template-columns: repeat(2, minmax(16rem, 24rem));
}

.card-option {
  cursor: pointer;
  padding: 1.2rem;
  gap: 1rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
  border-radius: 1.2rem;
  color: var(--dark-blue);
  background: hsla(36, 100%, 98%, 0.88);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);

  &:hover {
    border-color: var(--dark-blue);
  }

  .option-flag {
    width: 100%;
    height: 8rem;
    border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  }
}

@media (max-width: 640px) {
  .card-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .money-hero .money-symbol {
    font-size: 6rem;
  }
}
</style>
