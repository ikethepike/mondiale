<template>
  <StaticPage>
    <h1>Sources</h1>
    <p class="lead">
      Mondiale is built on open data. The facts, maps and imagery in the game
      come from these sources.
    </p>

    <ul class="sources">
      <li v-for="source in sources" :key="source.name" class="source">
        <a class="logo-cell" :href="source.url" target="_blank" rel="noopener">
          <img :src="source.logo" :class="{ dim: source.dim }" :alt="`${source.name} logo`" />
        </a>
        <div class="details">
          <a :href="source.url" target="_blank" rel="noopener">{{ source.name }}</a>
          <p>{{ source.description }}</p>
        </div>
      </li>
    </ul>

    <p class="aside">
      Country flags come from the open-source
      <a href="https://github.com/lipis/flag-icons" target="_blank" rel="noopener">flag-icons</a>
      project.
    </p>
  </StaticPage>
</template>
<script lang="ts" setup>
import logoCia from '~/assets/logos/sources/cia.svg'
import logoNaturalEarth from '~/assets/logos/sources/naturalearth.png'
import logoWikidata from '~/assets/logos/sources/wikidata.svg'
import logoCommons from '~/assets/logos/sources/commons.svg'
import logoWikipedia from '~/assets/logos/sources/wikipedia.svg'
import logoWorldBank from '~/assets/logos/sources/worldbank.svg'
import logoOwid from '~/assets/logos/sources/owid.png'
import logoUppsala from '~/assets/logos/sources/uppsala.svg'
import logoUnsplash from '~/assets/logos/sources/unsplash.svg'

const sources: Array<{
  name: string
  url: string
  logo: string
  description: string
  dim?: boolean
}> = [
  {
    name: 'CIA World Factbook',
    url: 'https://www.cia.gov/the-world-factbook/',
    logo: logoCia,
    description:
      'Country profiles and world leaders: geography, people, government and economy.',
  },
  {
    name: 'Natural Earth',
    url: 'https://www.naturalearthdata.com',
    logo: logoNaturalEarth,
    dim: true,
    description:
      'Public-domain map data: country shapes, seas, lakes and rivers.',
  },
  {
    name: 'Wikidata',
    url: 'https://www.wikidata.org',
    logo: logoWikidata,
    description:
      'Structured data on leaders, capitals, currencies and landmarks.',
  },
  {
    name: 'Wikimedia Commons',
    url: 'https://commons.wikimedia.org',
    logo: logoCommons,
    description:
      'Photography of leaders, capitals, banknotes, landmarks and flags.',
  },
  {
    name: 'Wikipedia',
    url: 'https://www.wikipedia.org',
    logo: logoWikipedia,
    description: 'Supplementary facts and figures.',
  },
  {
    name: 'World Bank Open Data',
    url: 'https://data.worldbank.org',
    logo: logoWorldBank,
    description: 'Development indicators.',
  },
  {
    name: 'Our World in Data',
    url: 'https://ourworldindata.org',
    logo: logoOwid,
    description:
      'Indices on democracy, corruption, human development and happiness — aggregating V-Dem, Transparency International, UNDP and the World Happiness Report.',
  },
  {
    name: 'Uppsala Conflict Data Program',
    url: 'https://ucdp.uu.se',
    logo: logoUppsala,
    description: 'Armed-conflict data from Uppsala University.',
  },
  {
    name: 'Unsplash',
    url: 'https://unsplash.com',
    logo: logoUnsplash,
    description: 'Selected landmark photography.',
  },
]
</script>
<style lang="scss" scoped>
.lead {
  margin-bottom: 2.4rem;
}

.sources {
  margin: 0;
  padding: 0;
  list-style: none;
}

.source {
  gap: 2rem;
  display: flex;
  align-items: center;
  padding: 1.6rem 0;
  border-top: 0.1rem solid color-mix(in srgb, var(--text-color) 15%, transparent);

  &:last-child {
    border-bottom: 0.1rem solid color-mix(in srgb, var(--text-color) 15%, transparent);
  }
}

.logo-cell {
  flex: none;
  width: 8rem;
  height: 4rem;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    filter: grayscale(1);
    opacity: 0.8;
    transition: filter var(--motion-quick), opacity var(--motion-quick);

    // Pale logos vanish under plain grayscale — pull them toward mid-gray
    &.dim {
      filter: grayscale(1) brightness(0.45) contrast(1.6);
    }
  }
}

.source:hover .logo-cell img {
  filter: none;
  opacity: 1;
}

.details {
  a {
    color: var(--text-color);
    font-size: 1.6rem;
    text-underline-offset: 0.25em;
  }

  p {
    margin: 0.4rem 0 0;
    font-size: 1.35rem;
    opacity: 0.7;
  }
}

.aside {
  margin-top: 2.4rem;
  font-size: 1.35rem;
  opacity: 0.7;

  a {
    color: var(--text-color);
  }
}
</style>
