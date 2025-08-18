

  export const factbookRegions = ["Asia","Europe","Africa","Central America and the Caribbean","South America","Oceania","Middle East","Southeast Asia","North America","<strong>metropolitan France:</strong> Europe <br><br><strong>French Guiana:</strong> South America <br><br><strong>Guadeloupe:</strong> Central America and the Caribbean <br><br><strong>Martinique:</strong> Central America and the Caribbean <br><br><strong>Mayotte:</strong> Africa <br><br><strong>Reunion:</strong> World","Arctic Region","AsiaEurope"] as const 
  export type FactbookRegion = typeof factbookRegions[number]
  