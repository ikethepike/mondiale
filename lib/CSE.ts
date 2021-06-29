import { Command } from '../types/game'

export async function update<R>(cmd: Command): Promise<R> {
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
    // return Promise.reject(e)
  }
}
