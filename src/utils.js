import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * Creates a URL path for a given page name.
 * e.g. createPageUrl("Journal") => "/Journal"
 *      createPageUrl("Journal?view=calendar") => "/Journal?view=calendar"
 */
export function createPageUrl(page) {
  const [name, query] = page.split('?')
  return query ? `/${name}?${query}` : `/${name}`
}
