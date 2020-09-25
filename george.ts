/* eslint-disable camelcase */
/* eslint-disable no-console */
import * as fs from 'fs'
import {
  AdministrativeDivision,
  Adult,
  AgeStructure,
  ArakGroundhog,
  Citizenship,
  ExchangeRates,
  FluffyCapital,
  FluffyLandUse,
  FluffyPorts,
  FluffyReligions,
  GeographicCoordinates,
  HilariousHivAids,
  HilariousLanguages,
  Independence,
  IndigoEthnicGroups,
  IrrigatedLand,
  LiteracyClass,
  MerchantMarineClass,
  MothersMeanAgeAtFirstBirth,
  NaturalHazard,
  NaturalResources,
  PhysiciansDensity,
  PurpleAgricultureProducts,
  PurpleArea,
  PurpleBirthRate,
  PurpleBudget,
  PurpleBudgetSurplusOrDeficit,
  PurpleConstitution,
  PurpleCountryName,
  PurpleDeathRate,
  PurpleDependencyRatios,
  PurpleDiplomaticRepresentation,
  PurpleDrinkingWaterSource,
  PurpleElevation,
  PurpleEnvironment,
  PurpleExecutiveBranch,
  PurpleFiscalYear,
  PurpleFlagDescription,
  PurpleHospitalBedDensity,
  PurpleHouseholdIncomeByPercentageShare,
  PurpleIndustrialProductionGrowthRate,
  PurpleIndustries,
  PurpleInternationalOrganizationParticipation,
  PurpleJudicialBranch,
  PurpleLaborForce,
  PurpleLandBoundaries,
  PurpleLegislativeBranch,
  PurpleMajorUrbanAreas,
  PurpleMaritimeClaims,
  PurpleMaternalMortalityRate,
  PurpleNationalAnthem,
  PurpleNationalHoliday,
  PurpleNationality,
  PurpleNationalSymbol,
  PurpleNetMigrationRate,
  PurplePoliticalPartiesAndLeaders,
  PurplePopulationGrowthRate,
  PurpleSuffrage,
  PurpleTotalFertilityRate,
  PurpleUrbanization,
  ReservesOfForeignExchangeAndGoldClass,
  SexRatio,
  TentacledGdp,
  TentacledPorts,
  UnemploymentRate,
  World,
} from './types/imports'

let unparsed
try {
  unparsed = fs.readFileSync('./world.json')
} catch (e) {
  console.error('failed to read world.json', e)
}
const world: World = JSON.parse(unparsed)

interface AgeDistribution {
  male: number
  total: number
  female: number
}

interface LifeExpectancy {
  male: number
  female: number
}

type Units = 'kg' | 'km' | 'm' | 'c' | '%' | "sq km" | "nm" | "deaths_per_1000_live_births" | "males/female" | "percent of population" | "m m" | "sq" | "years" | "USD"

interface Value {
  value: number
  units: Units
  note?: string 
}

interface RankValue {
  rank: number
  value: number
}

export interface Country {
  name: string
  statistics: {
    economics: {
      gdp?: number
      gdpPerCapita?: number
      militarySpending: RankValue
      populationBelowPovertyLine: number
    }
    geography: {
      landArea: Value
      waterArea: Value
      totalArea: Value
      lowestPoint: Value
      highestPoint: Value
      forestedLand: Value
      arableLand: Value
    }
    unemployment: {
      youthPercentage: number
      totalPercentage: number
    }
    infrastructure: {
      roadLength: Value
      railLength: Value
      electricity: {
        populationWithoutAccess: number
      }
    }
    religion: {
      atheism: number
      believers: number
      agnosticism: number
    }
    population: {
      total: number
      minorityPercentage: number
      refugeesAndStatelessPercentage: number
    }
    environment: {
      emissions: {
        rank: number
        megatons: number
      }
      crudeOilConsumption: {
        rank: number
        barrelsPerDay: number
      }
      energySources: {
        fossilFuels: number
        nuclearFuels: number
        renewableSources: number
      }
    }
    education: {
      literacy: {
        male: number
        female: number
        average: number
      }
    }
    health: {
      obesity: number
      medicalAccess: {
        doctorsPer1000: number
        hospitalBedsPer1000: number
      }
      lifeExpectancy: number
      childrenPerWoman: number
      underweightChildren: number
      contraceptivePrevalence: number
      meanAgeOfBirth: number
      ageDistribution: {
        '0-14': AgeDistribution
        '15-24': AgeDistribution
        '25-54': AgeDistribution
        '55-64': AgeDistribution
        '65-120': AgeDistribution
      }
      sexRatio: {
        male: number
        female: number
      }
    }
  }
}

const coteDivoire = world.countries["cote_d'_ivoire"]
// world.countries.

const {
  afghanistan,
  albania,
  algeria,
  andorra,
  angola,
  antigua_and_barbuda,
  argentina,
  armenia,
  australia,
  austria,
  azerbaijan,
  bahamas_the,
  bahrain,
  bangladesh,
  barbados,
  belarus,
  belgium,
  belize,
  benin,
  bhutan,
  bolivia,
  bosnia_and_herzegovina,
  botswana,
  brazil,
  brunei,
  bulgaria,
  burkina_faso,
  burundi,
  cabo_verde,
  cambodia,
  cameroon,
  canada,
  central_african_republic,
  chad,
  chile,
  china,
  colombia,
  comoros,
  congo_democratic_republic_of_the,
  costa_rica,
  croatia,
  cuba,
  cyprus,
  czechia,
  denmark,
  djibouti,
  dominica,
  dominican_republic,
  ecuador,
  egypt,
  el_salvador,
  equatorial_guinea,
  eritrea,
  estonia,
  eswatini,
  ethiopia,
  fiji,
  finland,
  france,
  gabon,
  gambia_the,
  georgia,
  germany,
  ghana,
  greece,
  grenada,
  guatemala,
  guinea,
  guinea_bissau,
  guyana,
  haiti,
  holy_see_vatican_city,
  honduras,
  hungary,
  iceland,
  india,
  indonesia,
  iran,
  iraq,
  ireland,
  israel,
  italy,
  jamaica,
  japan,
  jordan,
  kazakhstan,
  kenya,
  kiribati,
  kuwait,
  kyrgyzstan,
  laos,
  latvia,
  lebanon,
  lesotho,
  liberia,
  libya,
  liechtenstein,
  lithuania,
  luxembourg,
  madagascar,
  malawi,
  malaysia,
  maldives,
  mali,
  malta,
  marshall_islands,
  mauritania,
  mauritius,
  mexico,
  micronesia_federated_states_of,
  moldova,
  monaco,
  mongolia,
  montenegro,
  morocco,
  mozambique,
  burma,
  namibia,
  nauru,
  nepal,
  netherlands,
  new_zealand,
  nicaragua,
  niger,
  nigeria,
  korea_north,
  korea_south,
  north_macedonia,
  norway,
  oman,
  pakistan,
  palau,
  panama,
  papua_new_guinea,
  paraguay,
  peru,
  philippines,
  poland,
  portugal,
  qatar,
  romania,
  russia,
  rwanda,
  saint_kitts_and_nevis,
  saint_lucia,
  saint_vincent_and_the_grenadines,
  samoa,
  san_marino,
  sao_tome_and_principe,
  saudi_arabia,
  senegal,
  serbia,
  seychelles,
  sierra_leone,
  singapore,
  slovakia,
  slovenia,
  solomon_islands,
  somalia,
  south_africa,
  south_sudan,
  spain,
  sri_lanka,
  sudan,
  suriname,
  sweden,
  switzerland,
  syria,
  tajikistan,
  tanzania,
  thailand,
  timor_leste,
  togo,
  tonga,
  trinidad_and_tobago,
  tunisia,
  turkey,
  turkmenistan,
  tuvalu,
  uganda,
  ukraine,
  united_arab_emirates,
  united_kingdom,
  united_states,
  uruguay,
  uzbekistan,
  vanuatu,
  venezuela,
  vietnam,
  yemen,
  zambia,
  zimbabwe,
} = world.countries

;[
  afghanistan,
  albania,
  algeria,
  andorra,
  angola,
  antigua_and_barbuda,
  argentina,
  armenia,
  australia,
  austria,
  azerbaijan,
  bahamas_the,
  bahrain,
  bangladesh,
  barbados,
  belarus,
  belgium,
  belize,
  benin,
  bhutan,
  bolivia,
  bosnia_and_herzegovina,
  botswana,
  brazil,
  brunei,
  bulgaria,
  burkina_faso,
  burundi,
  cabo_verde,
  cambodia,
  cameroon,
  canada,
  central_african_republic,
  chad,
  chile,
  china,
  colombia,
  comoros,
  congo_democratic_republic_of_the,
  costa_rica,
  croatia,
  cuba,
  cyprus,
  czechia,
  denmark,
  djibouti,
  dominica,
  dominican_republic,
  ecuador,
  egypt,
  el_salvador,
  equatorial_guinea,
  eritrea,
  estonia,
  eswatini,
  ethiopia,
  fiji,
  finland,
  france,
  gabon,
  gambia_the,
  georgia,
  germany,
  ghana,
  greece,
  grenada,
  guatemala,
  guinea,
  guinea_bissau,
  guyana,
  haiti,
  holy_see_vatican_city,
  honduras,
  hungary,
  iceland,
  india,
  indonesia,
  iran,
  iraq,
  ireland,
  israel,
  italy,
  jamaica,
  japan,
  jordan,
  kazakhstan,
  kenya,
  kiribati,
  kuwait,
  kyrgyzstan,
  laos,
  latvia,
  lebanon,
  lesotho,
  liberia,
  libya,
  liechtenstein,
  lithuania,
  luxembourg,
  madagascar,
  malawi,
  malaysia,
  maldives,
  mali,
  malta,
  marshall_islands,
  mauritania,
  mauritius,
  mexico,
  micronesia_federated_states_of,
  moldova,
  monaco,
  mongolia,
  montenegro,
  morocco,
  mozambique,
  burma,
  namibia,
  nauru,
  nepal,
  netherlands,
  new_zealand,
  nicaragua,
  niger,
  nigeria,
  korea_north,
  korea_south,
  north_macedonia,
  norway,
  oman,
  pakistan,
  palau,
  panama,
  papua_new_guinea,
  paraguay,
  peru,
  philippines,
  poland,
  portugal,
  qatar,
  romania,
  russia,
  rwanda,
  saint_kitts_and_nevis,
  saint_lucia,
  saint_vincent_and_the_grenadines,
  samoa,
  san_marino,
  sao_tome_and_principe,
  saudi_arabia,
  senegal,
  serbia,
  seychelles,
  sierra_leone,
  singapore,
  slovakia,
  slovenia,
  solomon_islands,
  somalia,
  south_africa,
  south_sudan,
  spain,
  sri_lanka,
  sudan,
  suriname,
  sweden,
  switzerland,
  syria,
  tajikistan,
  tanzania,
  thailand,
  timor_leste,
  togo,
  tonga,
  trinidad_and_tobago,
  tunisia,
  turkey,
  turkmenistan,
  tuvalu,
  uganda,
  ukraine,
  united_arab_emirates,
  united_kingdom,
  united_states,
  uruguay,
  uzbekistan,
  vanuatu,
  venezuela,
  vietnam,
  yemen,
  zambia,
  zimbabwe,
  coteDivoire,
].map(
  (country): Country => {
    const { data } = country

    data.economy.gdp.purchasing_power_parity
    data.economy.gdp.
    
    return {
      name: data.name,
      statistics: {
        economics: {
          // gdp: data.economy.gdp.gdp,
          // gdpPerCapita: data.economy.gdp.
          militarySpending: {
            value: data.military_and_securty.expenditures.annual_values.shift(),
            rank: data.military_and_securty.expenditures.global_rank,
          },
          populationBelowPovertyLine:
            data.economy.population_below_poverty_line,
        },
        education: {
          literacy: {
            male: data.people.literacy.male.value,
            female: data.people.literacy.female.value,
            total: data.people.literacy.total.value,
          },
        },
        geography: {
          landArea: data.geography.area.land.value,
          waterArea: data.geography.area.water.value,
          totalArea: data.geography.area.total,
          lowestPoint: data.geography.elevation.lowest_point.elevation,
          highestPoint: data.geography.elevation.highest_point,
        },
        people: {},
        unemployment: {
          youthPercentage: data.people.youth_unemployment.total,
          totalPercentage: data.economy.unemployment_rate.annual_rate.pop()
            .value,
        },
        religion: {},
        infrastructure: {},
        environment: {},
        health: {},
      },
    }
  }
)

// const countries = []

interface GenericCountry {
  name: string
  introduction: {
    background: string
  }
  geography: {
    location: string
    geographic_coordinates: GeographicCoordinates
    map_references: string
    area: PurpleArea
    land_boundaries: PurpleLandBoundaries
    coastline: ArakGroundhog
    maritime_claims?: PurpleMaritimeClaims
    climate: string
    terrain: string
    elevation: PurpleElevation
    natural_resources?: NaturalResources
    land_use: FluffyLandUse
    irrigated_land?: IrrigatedLand
    population_distribution?: string
    natural_hazards?: NaturalHazard[] | null
    environment: PurpleEnvironment
  }
  people: {
    population: MerchantMarineClass
    nationality: PurpleNationality
    ethnic_groups: IndigoEthnicGroups
    languages: HilariousLanguages
    religions: FluffyReligions
    age_structure?: AgeStructure
    dependency_ratios?: PurpleDependencyRatios
    median_age?: LiteracyClass
    population_growth_rate: PurplePopulationGrowthRate
    birth_rate?: PurpleBirthRate
    death_rate?: PurpleDeathRate
    net_migration_rate?: PurpleNetMigrationRate
    population_distribution?: string
    urbanization: PurpleUrbanization
    major_urban_areas?: PurpleMajorUrbanAreas
    sex_ratio?: SexRatio
    mothers_mean_age_at_first_birth?: MothersMeanAgeAtFirstBirth
    maternal_mortality_rate?: PurpleMaternalMortalityRate
    infant_mortality_rate?: LiteracyClass
    life_expectancy_at_birth?: LiteracyClass
    total_fertility_rate?: PurpleTotalFertilityRate
    physicians_density?: PhysiciansDensity
    hospital_bed_density?: PurpleHospitalBedDensity
    drinking_water_source?: PurpleDrinkingWaterSource
    sanitation_facility_access?: PurpleDrinkingWaterSource
    hiv_aids?: HilariousHivAids
    adult_obesity?: Adult
    education_expenditures?: PurpleBudgetSurplusOrDeficit
    school_life_expectancy?: LiteracyClass
    youth_unemployment?: LiteracyClass
  }
  government: {
    country_name: PurpleCountryName
    government_type: string
    capital: FluffyCapital
    administrative_divisions?: AdministrativeDivision[]
    independence?: Independence
    national_holidays?: PurpleNationalHoliday[]
    constitution: PurpleConstitution
    legal_system?: string
    international_law_organization_participation: string[]
    citizenship?: Citizenship
    suffrage: PurpleSuffrage
    executive_branch: PurpleExecutiveBranch
    legislative_branch: PurpleLegislativeBranch
    judicial_branch?: PurpleJudicialBranch
    political_parties_and_leaders: PurplePoliticalPartiesAndLeaders
    international_organization_participation: PurpleInternationalOrganizationParticipation[]
    diplomatic_representation?: PurpleDiplomaticRepresentation
    flag_description: PurpleFlagDescription
    national_symbol: PurpleNationalSymbol
    national_anthem: PurpleNationalAnthem
  }
  economy: {
    overview: string
    gdp: {
      purchasing_power_parity: {
        annual_values: any[] 
        global_rank: number
        note?: string
      },
      composition: {
        by_end_use: any
      }

    }
    gross_national_saving: ReservesOfForeignExchangeAndGoldClass
    agriculture_products: PurpleAgricultureProducts
    industries: PurpleIndustries
    industrial_production_growth_rate: PurpleIndustrialProductionGrowthRate
    labor_force: PurpleLaborForce
    unemployment_rate: ReservesOfForeignExchangeAndGoldClass
    population_below_poverty_line: IrrigatedLand
    household_income_by_percentage_share: PurpleHouseholdIncomeByPercentageShare
    budget: PurpleBudget
    taxes_and_other_revenues: PurpleBudgetSurplusOrDeficit
    budget_surplus_or_deficit: PurpleBudgetSurplusOrDeficit
    public_debt: UnemploymentRate
    fiscal_year: PurpleFiscalYear
    inflation_rate: ReservesOfForeignExchangeAndGoldClass
    current_account_balance: ReservesOfForeignExchangeAndGoldClass
    exports: TentacledPorts
    imports: FluffyPorts
    reserves_of_foreign_exchange_and_gold: ReservesOfForeignExchangeAndGoldClass
    external_debt: ReservesOfForeignExchangeAndGoldClass
    exchange_rates: ExchangeRates
  }
}

type Direction = "N" | "S" | "W" | "E"

interface Coordinates { 
  degrees: number 
  minutes: number
  hemisphere: Direction 
}
interface ComeOn { 
  name: string 
  introduction: {
    background: string
  } 
  geography :{
    location: string
    geographic_coordinates: {
      latitude: Coordinates 
      longitude: Coordinates
    }, 
    map_references: string 
    area: {
      land: Value
      water: Value 
      total : Value
      note: string
      global_rank: number
      comparative: string 
    },
    land_boundaries: {
      total: Value
      border_countries: BorderCountry[]
      note: string
    }, 
    coastline: Value
    maritime_claims: {
      territorial_sea: Value
      exclusive_economic_zone: Value
      contiguous_zone: Value
      continental_shelf: string
    }
    climate: string
    terrain: string
    elevation: {
      mean_elevation: Value 
      lowest_point: ElevationPoint 
      highest_point: ElevationPoint
      note: string 
    }
    note: string
    natural_resources: {
      resources: string[]
    }
    land_use: {
      by_sector: {
        agricultural_land_total: Value
        arable_land: Value
        permanent_crops: Value
        permanent_pasture: Value
        forest: Value
        other: Value
      }
      note?: string
    }
    irrigated_land : {
      value: number
      units: "sq km"
      date: string
    },
    population_distribution: string
    natural_hazards: Hazard[]
    environment: {
      current_issues: string[]
      international_agreements: {
        party_to: string[] 
        signed_but_not_ratified: string[] 
      }, 
    },
  },
  people : {
    population:  { 
      total: number 
      global_rank: number
      date: string
    }, 
    nationality: {
      noun: string
      adjective: string 
    }, 
    ethnic_groups: {
      ethnicity: Ethnicity[]
      note?: string
      date: string 
    }
    languages: {
      language: PeopleValue[]
      note: string 
      date: string 
    }, 
    religions: {
      religion: PeopleValue[],
      note?: string
      date: string 
    },
    age_structure: {
      "0_to_14" : AgeBreakdown
      "15_to_24" : AgeBreakdown
      "25_to_54" : AgeBreakdown
      "55_to_64" : AgeBreakdown
      "65_and_over" : AgeBreakdown
      date: string
    }
    dependency_ratios: {
      ratios: {
        total_dependency_ratio : Value
        youth_depdency_ratio : Value
        elderly_depdency_ratio : Value
        potential_support_ratio : Value
      }, 
      date: string
    }
    median_age: {
      total: Value 
      male: Value 
      female: Value 
      global_rank: number 
      date: string 
    }, 
    population_growth_rate : {
      growth_rate: number
      global_rank: number 
      date: string 
    }
    birth_rate: {
      births_per_1000_population: number 
      global_rank: number 
      date: string 
    }
    death_rate: {
      deaths_per_1000_population: number 
      global_rank: number 
      date: string 
    }, 
    net_migration_rate: {
      migrations_per_1000_population: number
      global_rank: number 
      date: string
    }
    population_distribution?: string
    urbanization: {
      urban_population: Value 
      rate_of_urbanization: Value 
    } 
    major_urban_areas : {
      places: {
        place: string 
        population: number 
        is_capital?: boolean
      }[]
      date: string 
    }
    sex_ratio : {
      by_age: {
        at_birth: Value 
        "0_to_14_years": Value 
        "15_to_24_years": Value 
        "25_to_54_years": Value 
        "55_to_64_years": Value 
        "65_years_and_over": Value 
      }
      total_population: Value 
      date: string 
    }
    mothers_mean_age_at_first_birth: {
      age: number
      date: string 
    }
    maternal_mortality_rate: {
      deaths_per_100k_live_births: number 
      global_rank: number 
      date: string 
    }
    infant_mortality_rate : {
      total: Value 
      male: Value 
      female: Value 
      global_rank: number 
      date: string 
    }
    life_expectancy_at_birth: {
      total_population: Value 
      male: Value 
      female: Value 
      global_rank: number 
      date: string 
    }
    total_fertility_rate : {
      children_born_per_woman: number 
      global_rank: number 
      date: string 
    }
    contraceptive_prevalence_rate : Value 
    physicians_density: {
      physicians_per_1000_population: number 
      date: string 
    },
    hospital_bed_density: {
      beds_per_1000_population: number 
      date: string 
    }
    drinking_water_source: {
      improved: {
        urban: Value
        rural: Value 
        total: Value 
      } 
      unimproved: {
        urban: Value
        rural: Value 
        total: Value 
      }
      date: string 
    }
    sanitation_facility_access: {
      improved: {
        urban: Value 
        rural: Value 
        total: Value 
      },
      unimproved: {
        urban: Value 
        rural: Value 
        total: Value 
      }
      date: string 
    }
    adult_obesity : {
      percent_of_adults: number 
      global_rank: number 
      date: string 
    }
    underweight_children: {
      percent_of_children_under_the_age_of_five: number 
      global_rank: number 
      date: string 
    }
    education_expenditures: {
      percent_of_gdp: number 
      global_rank: number 
      date: string
    }
    school_life_expectancy: {
      total: Value 
      male: Value 
      female: Value 
      date: string 
    }
    youth_unemployment: {
      total: Value 
      male: Value 
      female: Value 
      global_rank: number 
      date: string
    }
  }
  government: {
    country_name: {
      conventional_long_form: string 
      conventional_short_form: string 
      abbreviation: string 
      etymology?: string 
    }
    government_type: GovernmentType
    capital: {
      name: string 
      geographic_coordinates: {
        latitude: Coordinates
        longitude: Coordinates 
      }
      time_difference: {
        timezone: number 
        note: string 
      }
      daylight_saving_time: string 
      note?: string
      etymology?: string 
    }
    administrative_divisions: { 
      name: string
      type: string 
    }[]
    dependent_areas : {
      areas: string[]
      note?: string 
    }
    independence?: {
      date: string 
      note?: string 
    }
    national_holidays: {name: string, day: string; original_year?: string}[] 
    constitution?: {
      history: string 
      amendments?: string 
    }
    legal_system?: string 
    international_law_organization_participation?: string[]
    citizenship?: {
      citizenship_by_birth?: string
      citizenship_by_descent_only?: string 
      dual_citizenship_recognized?: string 
      residency_requirement_for_naturalization?: string 
    }
    executive_branch: {
      chief_of_state: string 
      head_of_government: string 
      cabinet: string 
      elections_appointments: string
      election_results: string 
    }
    legislative_branch: {
      description: string 
      elections: string 
      election_results: string 
    }
    judicial_branch?: {
      highest_courts?: string 
      judge_selection_and_term_of_office?: string 
      subordinate_courts?: string 
      note?: string 
    }
    political_parties_and_leaders: {
      parties: {name: string, leaders: string[]}
      international_organization_participation: {organization: string, note?: string}[] 
      flag_description: {
        description: string 
        note?: string 
      }
      national_anthem: {
        name: string 
        lyrics_music: string 
        note?: string 
        audio_url: string 
      }
    }
  }
  economy: {
    overview: string 
    gdp : {
      purchasing_power_parity : {
        annual_values: Value[] 
        global_rank: number 
        note?: string 
      }
      official_exchange_rate: {
        USD: number 
        date: string
      }
      real_growth_rate: {
        annual_values: Value[]
        global_rank: number 
        note?: string 
      }
      per_capita_purchasing_power_parity: {
        annual_values: Value[]
        global_rank: number 
        note?: string 
      }
      composition: {
        by_end_use: {
          end_uses: {
            household_consumption: Value
            government_consumption: Value 
            investment_in_inventories: Value 
            investment_in_fixed_capital: Value 
            exports_of_goods_and_services: Value 
            imports_of_goods_and_services: Value 
          }
          date: string 
        }
        by_sector_of_origin: {
          sectors: {
            industry: Value 
            services: Value 
            agriculture: Value 
          }
          date: string
        }
      }
    }
    gross_national_saving: {
      annual_values: Value[]
      global_rank: number 
    }
    agriculture_products: {
      products: string[] 
    }
    industries: {
      industries: String[]
      note?: string 
    }
    industrial_production_growth_rate: {
      annual_percentage_increase: number
      global_rank: number 
      date: string 
    }
    labor_force: {
      total_size: {
        total_people: number 
        global_rank: number 
        date: string
      }
      by_occupation: {
        occupation: {
          agriculture: Value 
          industry: Value
          services: Value 
          industry_and_services: Value 
          manufacturing: Value 
          farming_forestry_and_fishing: Value 
          manufacturing_extraction_transportation_and_crafts: Value 
          managerial_professional_and_technical: Value 
          sales_and_office: Value 
          other_services: Value 
        }
        note?: string 
        date: string 
      }
    }
    unemployment_rate: {
      annual_values: Value[] 
      global_rank: number 
    }
    population_below_poverty_line: Value 
    household_income_by_percentage_share: {
      lowest_ten_percent: Value 
      highest_ten_percent: Value 
      date: string 
    }
    budget: {
      revenues: Value 
      expenditures: Value 
      note?: string 
      date: string
    }
    taxes_and_other_revenues: {
      percent_of_gdp: number 
      global_rank: number 
      date: string 
    }
    budget_surplus_or_deficit: {
      percent_of_gdp: number 
      global_rank: number 
      date: string
    }
    public_debt: {
      annual_values: Value[] 
      global_rank: number 
      note?: string 
    }
    fiscal_year: {
      start: string
      end: string 
    }
    inflation_rate: {
      annual_values: Value[]
      global_rank: number 
      note?: string 
    }
    current_account_balance: {
      annual_values: Value[]
      global_rank: number 
    }
    exports: {
      total_value: {
        annual_values: Value[] 
        global_rank: number 
      }
      commodities: {
        by_commodity: string[]
        date: string  
      }
      partners: {
        by_country: {
          name: string 
          percent: number
        }[]
      }
      imports: {
        total_value: {
          annual_values: Value[]
          global_rank: string 
        }
        commodities: {
          by_commodity: string[]
          date: string 
        }
        partners: {
          by_country: {name: string, percent: number}[] 
          date: string 
        }
        reserves_of_foreign_exchange_and_gold: {
          annual_values: Value[] 
          global_rank: number 
        }
        external_debt: {
          annual_values: Value[]
          global_rank: number 
          note?: string 
        }
        exchange_rates?: {
          note?: string 
        }
      }
    }
  }
  energy: {
    electricity: {
      access: {
        total_electrification: Value 
        date: string 
      }
      production: EnergyValue 
      consumption: EnergyValue
      exports: EnergyValue
      imports: EnergyValue
      installed_generating_capacity: EnergyValue
      by_source: {
        fossil_fuels: FuelValue
        nuclear_fuels: FuelValue 
        hydroelectric_plants: FuelValue 
        other_renewable_sources: FuelValue 
      }
    }
    crude_oil: {
      production: OilValue
      exports: OilValue
      imports: OilValue
    }
    refined_petroleum_products: {
      production: OilValue
      consumption: OilValue
      exports: OilValue
      imports: OilValue
      proved_reserves: OilValue 
    }
    natural_gas: {
      production: {
        cubic_metres: number 
        global_rank: number 
        date: string 
      }
      consumption: {
        cubic_metres: number 
        global_rank: number 
        date: string 
      }
      exports: {
        cubic_metres: number 
        global_rank: number 
        date: string 
      }
      imports: {
        cubic_metres: number 
        global_rank: number 
        date: string 
      }
      proved_reserves: {
        cubic_metres: number 
        global_rank: number 
        date: string 
      }
    }
    carbon_dioxide_emissions_from_consumption_of_energy: {
      megatonnes: number 
      global_rank: number 
      date: string 
    }
  }
  communications: {
    telephones: {
      fixed_lines: SubscriptionValue
      mobile_cellular: SubscriptionValue
      system: {
        general_assessment: string 
        domestic: string 
        international: string 
      }
    }
    broadcast_media: string 
    internet: {
      country_code: string 
      users: {
        total: number 
        percent_of_population: number 
        global_rank: number 
        date: string 
      }
    }
    note?: string 
  }
  transportation: {
    air_transport: {
      national_system: {
        number_of_registered_air_carriers: number 
        inventory_of_registered_aircraft_operated_by_air_carriers: number 
        annual_passenger_traffic_on_registered_air_carriers: number 
        annual_freight_traffic_on_registered_air_carriers: number 
      }
      civil_aircraft_registration_country_code_prefix: {
        prefix: string 
        date: string 
      }
      airports: {
        total: {
          airports: number 
          global_rank: number 
          date: string 
        }
        paved: {
          total: number
          over_3047_metres: number
          "2438_to_3047_metres": number
          "1524_to_2437_metres": number
          "914_to_1523_metres": number,
          under_914_metres: number,
          date: string
        }
        unpaved: {
          total: number
          over_3047_metres: number
          "2438_to_3047_metres": number
          "1524_to_2437_metres": number
          "914_to_1523_metres": number,
          under_914_metres: number,
          date: string
        }
        heliports: {
          total: number 
          date: string 
        }
      }
      pipelines: {
        by_type: {
          type: string
          length: number 
          units: 'km'
        }[]
        date: string 
      }
      railways: {
        total: {
          length: number 
          units: 'km'
        }
        standard_gauge: {
          length: number 
          units: string 
        }
        global_rank: number 
        date: string 
      }
      roadways: {
        total: Value 
        paved: Value 
        unpaved: Value 
        global_rank: number 
        date: string 
      }
      waterways: {
        value: number 
        units: 'km' | 'm'
        note?: string 
        global_rank: number 
        date: string 
      }
      merchant_marine: {
        total: number 
        by_type: {
          type: string 
          count: number
        }[]
        global_rank: number 
        date: string 
      }
      ports_and_terminals: {
        oil_terminals: string[]
        container_ports: {
          place: string
          twenty_foot_equivalent_units: number 
        }[] 
      }
      liquid_natural_gas_terminals_export: string[] 
      liquid_natural_gas_terminals_import: string[]
      cargo_ports: string 
      cruise_departure_ports_passengers: string 
      date: string 
    }
  }
  military_and_security: {
    expenditures: {
      annual_values: Value[] 
      global_rank: number 
    }
    services_age_and_obligation: {
      years_of_age: number 
      note?: string 
      date: string 
    }
  }
  transnational_issues: {
    disputes: string[]
    refugees_and_iternally_displaces_persons: {
      refugees: {
        by_country: {
          people: number
          country_of_origin: string
        }[]
      }
      note?: string 
    }
    illicit_drugs?: {
      note?: string 
    }
  }
}

interface PeopleValue {
  name: string
  percent: number 
}

interface SubscriptionValue {
  total_subscriptions: number 
  subscriptions_per_one_hundred_inhabitants: number 
  global_rank: number 
  date: string 
}

interface OilValue  {
 bbl_per_day: number 
        global_rank: number 
        date: string 
}

interface AgeBreakdown {
  percent: number 
  males: number 
  females: number
}

interface FuelValue {
  percent: number 
  global_rank: number 
  date: string
}


interface EnergyValue {
  kWh: number 
  global_rank: number 
  date: string 
}


interface BorderCountry {
  country: string
  border_length: Value
  note?: string
}

type Ethnicities = 
| "white" 
| "black" 
| "Asian" 
| "Amerindian and Alaska native" 
| "native Hawaiian and other pacific islander" 
| "other" 
| "two or more races" 


interface Ethnicity {
  name: string
  percent: number
}

interface Hazard {
  description: string
  type: "hazard" | "volcanism" | string
}


interface ElevationPoint {
  name: string
  elevation: Value
  note?: string 
}

type GovernmentType =
​​| "presidential Islamic republic"
​​| "parliamentary republic"
​​| "presidential republic"
​​| "republican form of government with separate executive, legislative, and judicial branches; unincorporated unorganized territory of the US with local self-government"
​​| "parliamentary democracy (since March 1993) that retains its chiefs of state in the form of a co-principality; the two princes are the President of France and Bishop of Seu d'Urgell, Spain"
​​| "parliamentary democracy (House of Assembly); self-governing overseas territory of the UK"
​​| "Antarctic Treaty Summary - the Antarctic region is governed by a system known as the Antarctic Treaty system; the system includes: 1. the Antarctic Treaty, signed on 1 December 1959 and entered into force on 23 June 1961, which establishes the legal framework for the management of Antarctica, 2. Measures, Decisions, and Resolutions adopted at Antarctic Treaty Consultative Meetings, 3. The Convention for the Conservation of Antarctic Seals (1972), 4. The Convention for the Conservation of Antarctic Marine Living Resources (1980), and 5. The Protocol on Environmental Protection to the Antarctic Treaty (1991); the Antarctic Treaty Consultative Meetings operate by consensus (not by vote) of all consultative parties at annual Treaty meetings; by January 2016, there were 53 treaty member nations: 29 consultative and 24 non-consultative; consultative (decision-making) members include the seven nations that claim portions of Antarctica as national territory (some claims overlap) and 22 non-claimant nations; the US and Russia have reserved the right to make claims; the US does not recognize the claims of others; Antarctica is administered through meetings of the consultative member nations; measures adopted at these meetings are carried out by these member nations (with respect to their own nationals and operations) in accordance with their own national laws; the years in parentheses indicate when a consultative member-nation acceded to the Treaty and when it was accepted as a consultative member, while no date indicates the country was an original 1959 treaty signatory; claimant nations are - Argentina, Australia, Chile, France, NZ, Norway, and the UK; nonclaimant consultative nations are - Belgium, Brazil (1975/1983), Bulgaria (1978/1998), China (1983/1985), Czech Republic (1962/2014), Ecuador (1987/1990), Finland (1984/1989), Germany (1979/1981), India (1983/1983), Italy (1981/1987), Japan, South Korea (1986/1989), Netherlands (1967/1990), Peru (1981/1989), Poland (1961/1977), Russia, South Africa, Spain (1982/1988), Sweden (1984/1988), Ukraine (1992/2004), Uruguay (1980/1985), and the US; non-consultative members, with year of accession in parentheses, are - Austria (1987), Belarus (2006), Canada (1988), Colombia (1989), Cuba (1984), Denmark (1965), Estonia (2001), Greece (1987), Guatemala (1991), Hungary (1984), Iceland (2015), Kazakhstan (2015), North Korea (1987), Malaysia (2011), Monaco (2008), Mongolia (2015), Pakistan (2012), Papua New Guinea (1981), Portugal (2010), Romania (1971), Slovakia (1962/1993), Switzerland (1990), Turkey (1996), and Venezuela (1999); note - Czechoslovakia acceded to the Treaty in 1962 and separated into the Czech Republic and Slovakia in 1993; Article 1 - area to be used for peaceful purposes only; military activity, such as weapons testing, is prohibited, but military personnel and equipment may be used for scientific research or any other peaceful purpose; Article 2 - freedom of scientific investigation and cooperation shall continue; Article 3 - free exchange of information and personnel, cooperation with the UN and other international agencies; Article 4 - does not recognize, dispute, or establish territorial claims and no new claims shall be asserted while the treaty is in force; Article 5 - prohibits nuclear explosions or disposal of radioactive wastes;Article 6 - includes under the treaty all land and ice shelves south of 60 degrees 00 minutes south and reserves high seas rights; Article 7 - treaty-state observers have free access, including aerial observation, to any area and may inspect all stations, installations, and equipment; advance notice of all expeditions and of the introduction of military personnel must be given; Article 8 - allows for jurisdiction over observers and scientists by their own states; Article 9 - frequent consultative meetings take place among member nations; Article 10 - treaty states will discourage activities by any country in Antarctica that are contrary to the treaty; Article 11 - disputes to be settled peacefully by the parties concerned or, ultimately, by the ICJ; Articles 12, 13, 14 - deal with upholding, interpreting, and amending the treaty among involved nations; other agreements - some 200 measures adopted at treaty consultative meetings and approved by governments; the Protocol on Environmental Protection to the Antarctic Treaty was signed 4 October 1991 and entered into force 14 January 1998; this agreement provides for the protection of the Antarctic environment and includes five annexes that have entered into force: 1) environmental impact assessment, 2) conservation of Antarctic fauna and flora, 3) waste disposal and waste management, 4) prevention of marine pollution, 5) area protection and management; a sixth annex addressing liability arising from environmental emergencies has yet to enter into force; the Protocol prohibits all activities relating to mineral resources except scientific research; a permanent Antarctic Treaty Secretariat was established in 2004 in Buenos Aires, Argentina"
​​| "parliamentary democracy under a constitutional monarchy; a Commonwealth realm"
​​| "parliamentary democracy; note - constitutional changes adopted in December 2015 transformed the government to a parliamentary system"
​​| "parliamentary democracy; part of the Kingdom of the Netherlands"
| "federal parliamentary democracy under a constitutional monarchy; a Commonwealth realm"
| "federal parliamentary republic"
| "constitutional monarchy"
| "presidential republic in name, although in fact a dictatorship"
| "federal parliamentary democracy under a constitutional monarchy"
| "parliamentary democracy (National Assembly) under a constitutional monarchy; a Commonwealth realm"
| "parliamentary democracy; self-governing overseas territory of the UK"
| "federal presidential republic"
| "absolute monarchy or sultanate"
| "parliamentary constitutional monarchy"
| "federal parliamentary democracy (Parliament of Canada) under a constitutional monarchy; a Commonwealth realm; federal and state authorities and responsibilities regulated in constitution"
| "communist party-led state"
| "non-self-governing overseas territory of Australia"
| "semi-presidential republic"
| "parliamentary democracy"
| "communist state"
| "Republic of Cyprus - presidential republic; \"Turkish Republic of Northern Cyprus\" (self-declared) - parliamentary republic with enhanced presidency\nnote: a separation of the two main ethnic communities inhabiting the island began following the outbreak of communal strife in 1963; this separation was further solidified when a Greek military-junta-supported coup attempt prompted the Turkish military intervention in July 1974 that gave the Turkish Cypriots de facto control in the north; Greek Cypriots control the only internationally recognized government on the island; on 15 November 1983, then Turkish Cypriot \"President\" Rauf DENKTAS declared independence and the formation of the \"TRNC,” which is recognized only by Turkey"
| "absolute monarchy"
| "parliamentary democracy (Legislative Assembly); self-governing overseas territory of the UK"
| "parliamentary democracy (Faroese Parliament); part of the Kingdom of Denmark"
| "parliamentary democracy (Assembly of French Polynesia); an overseas collectivity of France"
| "parliamentary democracy (Parliament); self-governing overseas territory of the UK"
| "parliamentary democracy (Parliament of Greenland or Inatsisartut)"
| "republican form of government with separate executive, legislative, and judicial branches; unincorporated organized territory of the US with local self-government"
| "parliamentary democracy (States of Deliberation)"
| "ecclesiastical elective monarchy; self-described as an \"absolute monarchy\""
| "presidential limited democracy; a special administrative region of the People's Republic of China"
| "unitary parliamentary republic"
| "theocratic republic"
| "parliamentary democracy (Tynwald)"
| "parliamentary democracy (Parliament) under a constitutional monarchy; a Commonwealth realm"
| "parliamentary democracy (Assembly of the States of Jersey)"
| "dictatorship, single-party state; official state ideology of \"Juche\" or \"national self-reliance\""
| "constitutional monarchy (emirate)"
| "in transition"
| "executive-led limited democracy; a special administrative region of the People's Republic of China"
| "federal parliamentary constitutional monarchy\nnote: all Peninsular Malaysian states have hereditary rulers (commonly referred to as sultans) except Melaka (Malacca) and Pulau Pinang (Penang); those two states along with Sabah and Sarawak in East Malaysia have governors appointed by government; powers of state governments are limited by the federal constitution; under terms of federation, Sabah and Sarawak retain certain constitutional prerogatives (e.g., right to maintain their own immigration controls)"
| "mixed presidential-parliamentary system in free association with the US"
| "federal republic in free association with the US"
| "parliamentary constitutional monarchy; part of the Kingdom of the Netherlands"
| "parliamentary democracy (Territorial Congress); an overseas collectivity of France"
| "non-self-governing overseas territory of Australia; note - the Norfolk Island Regional Council, which began operations 1 July 2016, is responsible for planning and managing a variety of public services, including those funded by the Government of Australia"
| "republican form of government with separate executive, legislative, and judicial branches; a commonwealth in political union with and under the sovereignty of the US"
| "presidential republic in free association with the US"
| "republican form of government with separate executive, legislative, and judicial branches; unincorporated organized territory of the US with local self-government\nNote: reference Puerto Rican Federal Relations Act, 2 March 1917, as amended by Public Law 600, 3 July 1950"
| "semi-presidential federation"
| "parliamentary democracy (Territorial Council); overseas collectivity of France"
| "parliamentary democracy (Parliament of Sint Maarten) under a constitutional monarchy"
| "non-self-governing territory of Norway"
| "federal republic (formally a confederation)"
| "presidential republic; highly authoritarian regime"
| "parliamentary democracy under a constitutional monarchy"
| "presidential republic; authoritarian"
| "federation of monarchies"
| "parliamentary constitutional monarchy; a Commonwealth realm"
| "constitutional federal republic"
| "presidential republic; highly authoritarian"
| "parliamentary democracy (Territorial Assembly); overseas collectivity of France"
| "legal status of territory and issue of sovereignty unresolved; territory contested by Morocco and Polisario Front (Popular Front for the Liberation of the Saguia el Hamra and Rio de Oro), which in February 1976 formally proclaimed a government-in-exile of the Sahrawi Arab Democratic Republic (SADR), near Tindouf, Algeria, led by President Mohamed ABDELAZIZ until his death in May 2016; current President Brahim GHALI elected in July 2016; territory partitioned between Morocco and Mauritania in April 1976 when Spain withdrew, with Morocco acquiring northern two-thirds; Mauritania, under pressure from Polisario guerrillas, abandoned all claims to its portion in August 1979; Morocco moved to occupy that sector shortly thereafter and has since asserted administrative control; the Polisario's government-in-exile was seated as an Organization of African Unity (OAU) member in 1984; Morocco between 1980 and 1987 built a fortified sand berm delineating the roughly 75% of Western Sahara west of the barrier that currently is controlled by Morocco; guerrilla activities continued sporadically until a UN-monitored cease-fire was implemented on 6 September 1991 (Security Council Resolution 690) by the United Nations Mission for the Referendum in Western Sahara (MINURSO)"