import { Command } from '../types/game'

export const update = async (cmd: Command) => {
  try {
    const response = await fetch(process.env.baseUrl + 'api/commands', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(cmd),
    })
    return await response.json()
  } catch (e) {
    return undefined
  }
}
