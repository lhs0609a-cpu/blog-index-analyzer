import { MetadataRoute } from 'next'
import { absoluteUrl, PUBLIC_ROUTES, SITE_UPDATED } from '@/lib/seo'
import { GUIDES } from '@/lib/content/guides'

export default function sitemap(): MetadataRoute.Sitemap {

  const staticPages: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: new Date(SITE_UPDATED),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  const guidePages: MetadataRoute.Sitemap = GUIDES.map((guide) => ({
    url: absoluteUrl(`/guides/${guide.slug}`),
    lastModified: new Date(guide.updated),
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  return [...staticPages, ...guidePages]
}
