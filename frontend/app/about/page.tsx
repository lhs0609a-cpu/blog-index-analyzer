import InformationPage from '@/components/InformationPage'
import { pageMetadata, SITE_DESCRIPTION } from '@/lib/seo'
import { aboutSections } from '@/lib/site-information'

export const metadata = pageMetadata({ title: '블스피 소개와 이용 안내', description: SITE_DESCRIPTION, path: '/about' })
export default function AboutPage() {
  return <InformationPage title="블스피 소개" summary={SITE_DESCRIPTION} path="/about" type="AboutPage" sections={aboutSections} />
}
