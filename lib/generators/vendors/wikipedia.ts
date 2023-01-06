interface BeltAndRoadResponse {
  parse: {
    title: string
    pageid: number
    sections: {
      toclevel: number
      level: string
      line: string
      number: string
      index: string
      fromtitle: string
      byteoffset: number
      anchor: string
      linkAnchor: string
    }[]
    showtoc: string
  }
}

export const fetchBeltAndRoadIniativeParticipants = async (): Promise<string[]> => {
  try {
    console.log('> Fetching BRI Membership')
    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=sections&page=List_of_projects_of_the_Belt_and_Road_Initiative`
    )

    const data: BeltAndRoadResponse = await response.json()

    return data.parse.sections
      .filter(section => section.toclevel === 2)
      .map(section => section.line.toLowerCase().trim())
  } catch (e) {
    return Promise.reject(e)
  }
}
