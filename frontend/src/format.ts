const numberFormat = new Intl.NumberFormat('fi-FI', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: false
})
const dateFormat = new Intl.DateTimeFormat('fi-FI', { timeZone: 'UTC' })

export const formatNumber = (value: number) => numberFormat.format(value)
export const formatDate = (value: string) => dateFormat.format(new Date(value))
