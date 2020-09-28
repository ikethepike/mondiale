export const parseCookie = (
  cookieString: string
): { [key: string]: string } => {
  if (!cookieString || !cookieString.includes(';')) return {}

  return cookieString
    .split(';')
    .map((value) => value.split('='))
    .reduce((acc: { [key: string]: string }, v) => {
      acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim())
      return acc
    }, {})
}

export const setCookie = (res: any, key: string, value: string) => {
  res.cookie(key, value, {
    httpOnly: true,
    expires: new Date(Date.now() + 9000000),
    secure: !process.env.baseUrl.includes('localhost'),
  })
}
