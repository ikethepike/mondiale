export const parseCookie = (cookieString: string): { [key: string]: string } => {
  try {
    return cookieString
      .split(';')
      .map(value => value.split('='))
      .reduce((acc: { [key: string]: string }, v) => {
        acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim())
        return acc
      }, {})
  } catch (_) {
    return {}
  }
}
