import type { ChallengeConfiguration } from '~~/types/challenge.type'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import type { IndividualChallengeAccessorId } from '~~/types/challenges/individual-challenge.type'

const CHALLENGE_DETAILS: {
  [key in IndividualChallengeAccessorId | GroupChallengeAccessorId]: ChallengeConfiguration
} = {
  'economics.gdpPerCapita': {
    topic: 'economics',
    phrasing: 'Rank these countries by GDP per capita',
    definition:
      'The value of everything a country produces in a year, divided by its population — measured at purchasing power parity, so the figure reflects what money actually buys locally rather than exchange rates.',
    markers: {
      most: 'highest GDP',
      least: 'lowest GDP',
    },
  },
  'economics.militarySpending': {
    topic: 'economics',
    phrasing: 'Rank these countries by military spending as a percentage of their economy',
    definition:
      'Military spending as a share of the country’s whole economy (GDP) — not the absolute budget, which is why the biggest spenders in dollars don’t automatically top the list.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'economics.populationBelowPovertyLine': {
    topic: 'economics',
    phrasing: 'Rank these countries by the percentage of people living below the poverty line',
    definition:
      'The share of people living on less than $3 a day, the international extreme-poverty line. Not a national poverty line — a rich country can have real hardship and still read near zero here.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'economics.equality': {
    topic: 'economics',
    phrasing: 'Rank these countries by the level of economic inequality',
    definition:
      'The Gini index of family income distribution, on a 0–100 scale. Higher means more unequal — a country where everyone earned the same would score 0.',
    markers: {
      most: 'unequal',
      least: 'equal',
    },
    // Gini is theoretically 0–100 but real countries cluster ~24–59; a
    // 20–70 band keeps the plotted marker legible instead of bunched mid-track.
    scale: { min: 20, max: 70 },
  },
  'geography.area.land': {
    topic: 'geography',
    phrasing: 'Rank these countries by land area',
    definition: 'Land area inside each country’s borders, excluding lakes and rivers.',
    markers: {
      most: 'largest area',
      least: 'smallest area',
    },
  },
  'geography.area.water': {
    topic: 'geography',
    phrasing: 'Rank these countries by amount of surface water',
    definition:
      'The area of inland water — lakes, rivers and reservoirs — inside each country’s borders. Territorial seas don’t count.',
    markers: {
      most: 'largest area',
      least: 'smallest area',
    },
  },
  'geography.area.total': {
    topic: 'geography',
    phrasing: 'Rank these countries by total area',
    definition:
      'Total area inside each country’s borders: land plus inland water such as lakes and rivers.',
    markers: {
      most: 'largest area',
      least: 'smallest area',
    },
  },
  'geography.area.arable': {
    topic: 'geography',
    phrasing: 'Rank these countries by the percentage of their land that is arable',
    definition:
      'The share of each country’s land used for growing crops. Orchards, vineyards and grazing pasture don’t count as arable.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'geography.area.forested': {
    topic: 'geography',
    phrasing: 'Rank these countries by the percentage of their land that is forested',
    definition:
      'The share of each country’s land area covered by forest. A share, not an extent — Russia and Brazil hold the most forest but rank mid-table.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'geography.highestPeak': {
    topic: 'geography',
    phrasing: 'Rank these countries by their highest mountain',
    definition:
      'The elevation of each country’s highest point above sea level — which in flat countries may not be a mountain at all.',
    markers: {
      most: 'highest mountain',
      least: 'lowest mountain',
    },
  },
  'unemployment.youth': {
    topic: 'unemployment',
    phrasing: 'Rank these countries by the youth unemployment rate',
    definition:
      'The share of 15–24-year-olds in the labour force who are out of work and looking for it. Students not seeking work don’t count, which is why youth rates run far above the overall rate.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'unemployment.total': {
    topic: 'unemployment',
    phrasing: 'Rank these countries by the unemployment rate',
    definition:
      'The share of each country’s labour force out of work and looking for it. People not seeking work — students, retirees, discouraged workers — aren’t counted on either side of the ratio.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'infrastructure.rail': {
    topic: 'infrastructure',
    phrasing: 'Rank these countries by length of railway network',
    definition:
      'The total length of each country’s railway network in kilometres of route — an absolute figure, so large countries dominate.',
    markers: {
      most: 'most kilometers',
      least: 'fewest kilometers',
    },
  },
  'gender.womenInParliament': {
    topic: 'gender',
    phrasing: 'Rank these countries by the percentage of parliament seats held by women',
    definition:
      'The share of seats in each country’s national parliament (single or lower chamber) held by women.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'gender.motherMeanAgeAtBirth': {
    topic: 'gender',
    phrasing: 'Rank these countries by the average age of mothers at childbirth',
    definition:
      'The mean age of mothers at childbirth, across all births rather than first births — UN WPP’s measure, which covers 233 countries where the Factbook’s first-birth figure covered 130.',
    markers: {
      most: 'oldest',
      least: 'youngest',
    },
  },
  'health.obesity': {
    topic: 'health',
    phrasing: 'Rank these countries by the percentage of adults who are obese',
    definition:
      'The share of adults (18 and over) with a body-mass index of 30 or higher. Overweight but not obese (BMI 25–30) doesn’t count.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'people.lifeExpectancy': {
    topic: 'people',
    phrasing: 'Rank these countries by average life expectancy at birth',
    definition:
      'How long a newborn would live on average if the country’s current death rates at every age held for their whole life. High infant mortality drags it down sharply.',
    markers: {
      most: 'oldest',
      least: 'youngest',
    },
  },
  'people.medianAge': {
    topic: 'people',
    phrasing: 'Rank these countries by median age',
    definition: 'The age that splits each country’s population in half — half older, half younger.',
    markers: {
      most: 'oldest',
      least: 'youngest',
    },
  },
  'people.childrenPerWoman': {
    topic: 'people',
    phrasing: 'Rank these countries by the average number of children per woman',
    definition:
      'The number of children a woman would have on average if today’s birth rates at every age held through her life. Roughly 2.1 keeps a population steady.',
    markers: {
      most: 'most children',
      least: 'fewest children',
    },
  },
  'education.literacy': {
    topic: 'education',
    phrasing: 'Rank these countries by the percentage of people who are literate',
    definition:
      'The share of people aged 15 and over who can read and write — usually self-reported in national data, not tested.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'education.averageYearsOfStudy': {
    topic: 'education',
    phrasing: 'Rank these countries by the average number of years spent in school',
    definition:
      'The years of schooling — primary through university — a child starting school today can expect to complete at current enrolment rates. A forecast about today’s children, not the schooling adults actually received.',
    markers: {
      most: 'most years',
      least: 'fewest years',
    },
  },
  'health.doctors': {
    topic: 'health',
    phrasing: 'Rank these countries by number of doctors per capita',
    definition: 'Practising physicians per 1,000 people.',
    markers: {
      most: 'most doctors',
      least: 'fewest doctors',
    },
  },
  'health.hospitalBeds': {
    topic: 'health',
    phrasing: 'Rank these countries by number of hospital beds per capita',
    definition:
      'Hospital beds per 1,000 people — all inpatient beds, including long-term care, not just acute or intensive care.',
    markers: {
      most: 'most beds',
      least: 'fewest beds',
    },
  },
  'health.accessToContraceptives': {
    topic: 'health',
    phrasing: 'Rank these countries by the percentage of people with access to contraceptives',
    definition:
      'The share of married or in-union women aged 15–49 currently using any contraceptive method — a measure of use, not availability.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'religion.atheism': {
    topic: 'religion',
    phrasing: 'Rank these countries by the percentage of people who are atheist',
    definition:
      'The share of people declaring no religious affiliation in each country’s census data — the “nones”, which lumps together atheists, agnostics and the unaffiliated.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'religion.believers': {
    topic: 'religion',
    phrasing: 'Rank these countries by the percentage of people who follow a religion',
    definition:
      'The share of people claiming a religious affiliation in census data — identity, not attendance or practice.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'environment.CO2Emissions': {
    topic: 'environment',
    phrasing: 'Rank these countries by total CO2 emissions',
    definition:
      'Each country’s total CO2 output in megatons per year — absolute, not per person, so populous industrial countries top the list. Counted where goods are produced, not where they’re consumed.',
    markers: {
      most: 'highest CO2 emissions',
      least: 'lowest CO2 emissions',
    },
  },
  'environment.renewables': {
    topic: 'environment',
    phrasing: 'Rank these countries by the share of electricity from renewables',
    definition:
      'The share of each country’s electricity generation that comes from renewables — hydro, wind, solar, geothermal and biomass. Electricity only: fuel burned for transport and heating doesn’t count, and neither does nuclear power.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'humanRights.gayMarriageLegalized': {
    topic: 'human rights',
    phrasing: 'Rank these countries by the year gay marriage was legalized',
    definition:
      'The year same-sex marriage became legal nationwide. Countries where it isn’t legal don’t appear in the round.',
    markers: {
      most: 'latest',
      least: 'earliest',
    },
  },
  // Individual challenges
  'capital.name': {
    topic: 'general knowledge',
    phrasing: 'What country has {capital} as its capital?',
  },
  flag: {
    topic: 'general knowledge',
    phrasing: 'Which country does this flag represent?',
  },
  isoCode: {
    topic: 'general knowledge',
    phrasing: 'Where on the map is {countryName}?',
  },
  'government.leader': {
    topic: 'general knowledge',
    phrasing: 'Which country is led by {leader}?',
  },
  // Its tenants (Rulers, Logo Politics) each phrase their own question; this
  // is the fallback the find gate uses when the tile deals a plain map hunt.
  'government.parties': {
    topic: 'general knowledge',
    phrasing: 'Where on the map is {countryName}?',
  },
  currency: {
    topic: 'economics',
    phrasing: 'Which country spends the {currency}?',
  },
  landmarks: {
    topic: 'geography',
    phrasing: 'Where on the map is {countryName}?',
  },
  // The two mode-named gates. Their phrasing is only ever read by the `find`
  // fallback (and the atlas), since the modes themselves write their own
  // prompts — so it asks the fallback's question, not the mode's.
  errata: {
    topic: 'geography',
    phrasing: 'Where on the map is {countryName}?',
  },
  lexicon: {
    topic: 'general knowledge',
    phrasing: 'Where on the map is {countryName}?',
  },
  history: {
    topic: 'history',
    phrasing: 'Where on the map is {countryName}?',
  },
  'infrastructure.internetAccess': {
    topic: 'infrastructure',
    phrasing: 'Rank these countries by the percentage of people with internet access',
    definition: 'The share of people who used the internet in the last few months, on any device.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'people.population': {
    topic: 'people',
    phrasing: 'Rank these countries by population',
    definition:
      'Everyone living in the country — the UN’s mid-year estimate, which can differ from national censuses.',
    markers: {
      most: 'largest population',
      least: 'smallest population',
    },
  },
  'people.populationGrowthRate': {
    topic: 'people',
    phrasing: 'Rank these countries by population growth rate',
    definition:
      'How fast each country’s population grew over the year, in percent — births minus deaths plus net migration, so a country can shrink even with more births than deaths.',
    markers: {
      most: 'fastest growing',
      least: 'slowest growing',
    },
  },
  'health.tobaccoUse': {
    topic: 'health',
    phrasing: 'Rank these countries by the percentage of adults who use tobacco',
    definition:
      'The share of adults who smoke or use any tobacco, including chewed and smokeless kinds — not just cigarettes.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'health.alcoholConsumption': {
    topic: 'health',
    phrasing: 'Rank these countries by litres of pure alcohol consumed per adult each year',
    definition:
      'Litres of pure alcohol per person aged 15 and over per year, non-drinkers included — one litre is roughly eleven bottles of wine.',
    markers: {
      most: 'most litres',
      least: 'fewest litres',
    },
  },
  'humanRights.refugees': {
    topic: 'human rights',
    phrasing: 'Rank these countries by the number of refugees they host',
    definition: 'The number of refugees each country hosts — people who fled to it, not from it.',
    markers: {
      most: 'most refugees',
      least: 'fewest refugees',
    },
  },
  'economics.inflation': {
    topic: 'economics',
    phrasing: 'Rank these countries by their annual inflation rate',
    definition:
      'The annual rise in consumer prices — what households pay for goods and services. Negative means prices fell.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  // Legacy — no longer dealt; kept so in-flight games keep rendering.
  'government.amountOfMilitaryConflicts': {
    topic: 'general knowledge',
    phrasing: 'Rank these countries by the number of armed conflicts they are involved in',
    markers: {
      most: 'most conflicts',
      least: 'fewest conflicts',
    },
  },
  'government.conflictsFought': {
    topic: 'general knowledge',
    phrasing: 'Rank these countries by armed conflicts fought since 1946',
    definition:
      'The number of distinct armed conflicts the country has fought as a primary party since 1946, per UCDP data. A conflict counts once however long it lasted; 25 battle deaths in a year puts it on the books.',
    markers: {
      most: 'most conflicts',
      least: 'fewest conflicts',
    },
  },
  'government.yearsAtWar': {
    topic: 'general knowledge',
    phrasing: 'Rank these countries by years spent at war since 1946',
    definition:
      'How many calendar years since 1946 the country spent in at least one full-scale war — a conflict with 1,000 or more battle deaths that year, per UCDP. Several wars in one year still count as one year.',
    markers: {
      most: 'most years at war',
      least: 'fewest years at war',
    },
    // Bounded: 1946 through the current UCDP vintage (2024).
    scale: { min: 0, max: 79 },
  },
  'government.recentConflicts': {
    topic: 'general knowledge',
    phrasing: 'Rank these countries by armed conflicts fought in the last five years',
    definition:
      'The number of armed conflicts the country has been a primary party to that were active within the last five years of UCDP data.',
    markers: {
      most: 'most recent conflicts',
      least: 'fewest recent conflicts',
    },
  },
  'government.democracyIndex': {
    topic: 'general knowledge',
    phrasing: 'Rank these countries by their democracy index',
    definition:
      'V-Dem’s electoral democracy index, 0–1: how free and fair elections are, with real suffrage and freedom of speech and association. Expert-scored — not the Economist’s 0–10 index of the same name.',
    markers: {
      most: 'most democratic',
      least: 'least democratic',
    },
    scale: { min: 0, max: 1 },
  },
  'government.corruptionIndex': {
    topic: 'general knowledge',
    // CPI is scored 0–100 where higher = cleaner; the ranking sorts on the
    // raw score, so the top pole is the least corrupt.
    phrasing: 'Rank these countries by their Corruption Perceptions Index score',
    definition:
      'Transparency International’s Corruption Perceptions Index, 0–100, scoring perceived public-sector corruption. Higher means cleaner.',
    markers: {
      most: 'least corrupt',
      least: 'most corrupt',
    },
    // The markers already run in score order (left = low score = most
    // corrupt, right = high score = least corrupt), so a plain 0–100 plot
    // of the raw CPI lands correctly — no inversion needed.
    scale: { min: 0, max: 100 },
  },
  'government.humanDevelopmentIndex': {
    topic: 'general knowledge',
    phrasing: 'Rank these countries by their Human Development Index',
    definition:
      'The UN’s composite of life expectancy, schooling and income per person, on a 0–1 scale. Higher means more developed.',
    markers: {
      most: 'most developed',
      least: 'least developed',
    },
    scale: { min: 0, max: 1 },
  },
  'government.happiness': {
    topic: 'general knowledge',
    phrasing: 'Rank these countries by their World Happiness score',
    definition:
      'The average answer when people rate their own life from 0 (worst possible) to 10 (best possible) — the Gallup World Poll’s ladder question, self-reported.',
    markers: {
      most: 'happiest',
      least: 'least happy',
    },
    // Cantril-ladder scores run roughly 1–8 in practice; a 0–10 band keeps the
    // plotted marker legible against the ladder's full theoretical range.
    scale: { min: 0, max: 10 },
  },
  'economics.gdpTotal': {
    topic: 'economics',
    phrasing: 'Rank these countries by total GDP (purchasing power parity)',
    definition:
      'The total value of everything each country produces in a year, at purchasing power parity — the whole economy, not per person.',
    markers: {
      most: 'largest economy',
      least: 'smallest economy',
    },
  },
  'economics.gdpGrowth': {
    topic: 'economics',
    phrasing: 'Rank these countries by their GDP growth rate',
    definition:
      'How fast each country’s economy grew over the year, adjusted for inflation. A rate, not a size — small economies can outrank giants.',
    markers: {
      most: 'fastest growing',
      least: 'slowest growing',
    },
  },
  'economics.publicDebt': {
    topic: 'economics',
    phrasing: 'Rank these countries by public debt as a percentage of GDP',
    definition:
      'General government gross debt as a share of the country’s yearly economic output (GDP) — not the absolute amount owed. "General government" folds in sub-national and social-security borrowing, so it runs a little above a central-government figure.',
    markers: {
      most: 'highest debt',
      least: 'lowest debt',
    },
  },
  'economics.budgetBalance': {
    topic: 'economics',
    phrasing: 'Rank these countries by government budget balance',
    definition:
      'What a government took in minus what it spent, as a share of GDP. Positive is a surplus, negative a deficit — the fastest-moving number in a country’s public finances, where debt only shows the accumulated total.',
    markers: {
      most: 'biggest surplus',
      least: 'biggest deficit',
    },
  },
  'infrastructure.mobileSubscriptions': {
    topic: 'infrastructure',
    phrasing: 'Rank these countries by mobile phone subscriptions per 100 people',
    definition:
      'Active mobile subscriptions per 100 people. SIM cards, not owners — dual-SIM phones and data-only plans push many countries past 100.',
    markers: {
      most: 'most subscriptions',
      least: 'fewest subscriptions',
    },
  },
  'energy.electricityAccess': {
    topic: 'energy',
    phrasing: 'Rank these countries by the percentage of people with electricity access',
    definition:
      'The share of the population connected to electricity. Connection only — it says nothing about how reliable or affordable the power is.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'energy.fossilFuels': {
    topic: 'energy',
    phrasing: 'Rank these countries by the share of electricity from fossil fuels',
    definition:
      'The share of each country’s electricity generation that comes from burning coal, oil and gas. Electricity only: fuel burned for transport and heating doesn’t count.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'people.netMigration': {
    topic: 'people',
    phrasing: 'Rank these countries by net migration rate per 1,000 people',
    definition:
      'Net migration per 1,000 residents per year: people moving in minus people moving out. Negative means more leave than arrive.',
    markers: {
      most: 'most inward migration',
      least: 'most outward migration',
    },
  },
  'people.birthRate': {
    topic: 'people',
    phrasing: 'Rank these countries by birth rate per 1,000 people',
    definition:
      'Births per 1,000 people per year. A crude rate — an older population pulls it down even when families aren’t smaller.',
    markers: {
      most: 'highest birth rate',
      least: 'lowest birth rate',
    },
  },
  'people.urbanization': {
    topic: 'people',
    phrasing: 'Rank these countries by the percentage of people living in urban areas',
    definition:
      'The share of people living in urban areas — by each country’s own definition of “urban”, which varies widely.',
    markers: {
      most: 'most urban',
      least: 'most rural',
    },
  },
  'environment.methaneEmissions': {
    topic: 'environment',
    phrasing: 'Rank these countries by total methane emissions',
    definition:
      'Each country’s methane output in megatons per year, summed across energy, farming and waste. Absolute totals, not converted to CO2-equivalents.',
    markers: {
      most: 'highest emissions',
      least: 'lowest emissions',
    },
  },
  'economics.touristArrivals': {
    topic: 'economics',
    phrasing: 'Rank these countries by yearly international tourist arrivals',
    definition:
      'International tourist arrivals per year — overnight visits, counted per entry, so one traveller entering three times counts three times.',
    markers: {
      most: 'most visited',
      least: 'least visited',
    },
  },
  'economics.workingHours': {
    topic: 'economics',
    phrasing: 'Rank these countries by annual working hours per worker',
    definition:
      'Average hours actually worked per year per employed person. Widespread part-time work pulls the average down.',
    markers: {
      most: 'longest hours',
      least: 'shortest hours',
    },
  },
  'energy.consumptionPerCapita': {
    topic: 'energy',
    phrasing: 'Rank these countries by energy use per person',
    definition:
      'All primary energy each country uses per person per year — electricity, transport, heating and industry together — in kilowatt-hours.',
    markers: {
      most: 'highest use',
      least: 'lowest use',
    },
  },
  'health.meatConsumption': {
    topic: 'health',
    phrasing: 'Rank these countries by meat consumption per person',
    definition:
      'Kilograms of meat available per person per year at retail, from food-supply accounts — includes what gets wasted, so real intake is lower.',
    markers: {
      most: 'most meat',
      least: 'least meat',
    },
  },
  'health.maleHeight': {
    topic: 'health',
    phrasing: 'Rank these countries by average male height',
    definition:
      'The average height of adult men born around 1996 — the latest cohort measured — not today’s whole adult population.',
    markers: {
      most: 'tallest',
      least: 'shortest',
    },
    // Adult male means span ~160–184 cm; a full 0-based track would bury
    // every country at the top and make the decisiveness gap unreachable.
    scale: { min: 155, max: 190 },
  },
  'health.roadDeaths': {
    topic: 'health',
    phrasing: 'Rank these countries by road-traffic deaths per 100,000 people',
    definition:
      'Road-traffic deaths per 100,000 people per year — per resident, not per car or kilometre driven.',
    markers: {
      most: 'most deaths',
      least: 'fewest deaths',
    },
  },
  'environment.airPollution': {
    topic: 'environment',
    phrasing: 'Rank these countries by outdoor air pollution',
    definition:
      'The fine-particle (PM2.5) concentration the average resident breathes outdoors over a year — population-weighted, so clean wilderness doesn’t offset smoggy cities. The WHO guideline is 5 µg/m³.',
    markers: {
      most: 'most polluted',
      least: 'cleanest air',
    },
  },
  'environment.redListIndex': {
    topic: 'environment',
    phrasing: 'Rank these countries by the survival outlook of their wildlife',
    definition:
      'The IUCN Red List Index, 0–1, tracking extinction risk across a country’s species. Higher is better: 1 means no species at risk.',
    markers: {
      most: 'safest wildlife',
      least: 'most at risk',
    },
    // The Red List Index is 0–1 but real countries sit ~0.4–1.
    scale: { min: 0.4, max: 1 },
  },
  'environment.threatenedMammals': {
    topic: 'environment',
    phrasing: 'Rank these countries by their number of threatened mammal species',
    definition:
      'How many mammal species found in the country are threatened with extinction. A raw count, so large biodiverse countries rank high almost automatically.',
    markers: {
      most: 'most species',
      least: 'fewest species',
    },
  },
  'environment.protectedLand': {
    topic: 'environment',
    phrasing: 'Rank these countries by the share of their land that is protected',
    definition:
      'The share of each country’s land under legal protection — designation on paper, not how well it’s enforced. Marine reserves don’t count.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'environment.freshwaterPerCapita': {
    topic: 'environment',
    phrasing: 'Rank these countries by renewable freshwater per person',
    definition:
      'The renewable freshwater generated inside each country per person per year. Rivers flowing in from neighbours don’t count — downstream countries like Egypt score low.',
    markers: {
      most: 'most water',
      least: 'least water',
    },
  },
  'environment.evSalesShare': {
    topic: 'environment',
    phrasing: 'Rank these countries by the share of new cars sold that are electric',
    definition:
      'The share of new cars sold in a year that are electric, plug-in hybrids included — new sales, not the cars already on the road.',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'people.deathRate': {
    topic: 'people',
    phrasing: 'Rank these countries by yearly deaths per 1,000 people',
    definition:
      'Deaths per 1,000 people per year. A crude rate driven by age structure — healthy but old countries rank above young ones with worse healthcare.',
    markers: {
      most: 'highest rate',
      least: 'lowest rate',
    },
  },
  'people.density': {
    topic: 'people',
    phrasing: 'Rank these countries by population density',
    definition: 'People per square kilometre of territory.',
    markers: {
      most: 'most dense',
      least: 'most sparse',
    },
  },
  'people.share65Plus': {
    topic: 'people',
    phrasing: 'Rank these countries by the share of people aged 65 and over',
    definition: 'The share of the population aged 65 or older.',
    markers: {
      most: 'oldest',
      least: 'youngest',
    },
    // Shares run ~1–30%; a 0–100 track would bunch everyone at the bottom.
    scale: { min: 0, max: 35 },
  },
  'people.sexRatio': {
    topic: 'people',
    phrasing: 'Rank these countries by the number of men per 100 women',
    definition:
      'Males per 100 females across the whole population. The extremes are migration stories — Gulf states’ male labour migration pushes far past parity — not birth ratios.',
    markers: {
      most: 'most men',
      least: 'most women',
    },
  },
}

export const getChallengeDetails = (
  accessorID: IndividualChallengeAccessorId | GroupChallengeAccessorId
): ChallengeConfiguration => CHALLENGE_DETAILS[accessorID]
