import Link from 'next/link'
import { absoluteUrl, breadcrumbJsonLd, jsonLdScript, SITE_NAME, SITE_URL, SITE_UPDATED } from '@/lib/seo'

type Props = {
  title: string
  summary: string
  path: string
  type: 'AboutPage' | 'WebPage'
  sections: Array<{ heading: string; paragraphs: string[] }>
  sources?: Array<{ label: string; url: string }>
}

export default function InformationPage({ title, summary, path, type, sections, sources }: Props) {
  return <article className="mx-auto max-w-4xl px-5 py-12 md:py-16">
    <script {...jsonLdScript([
      { '@context': 'https://schema.org', '@type': type, '@id': absoluteUrl(path), url: absoluteUrl(path), name: title, description: summary,
        inLanguage: 'ko-KR', dateModified: SITE_UPDATED, isPartOf: { '@id': `${SITE_URL}/#website` }, about: { '@id': `${SITE_URL}/#software` }, publisher: { '@id': `${SITE_URL}/#organization` } },
      breadcrumbJsonLd([{ name: SITE_NAME, path: '/' }, { name: title, path }]),
    ])} />
    <nav aria-label="현재 위치" className="mb-6 text-sm text-gray-500"><Link href="/">블스피</Link> / {title}</nav>
    <header className="mb-10">
      <h1 className="mb-5 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">{title}</h1>
      <p className="text-lg leading-8 text-gray-600">{summary}</p>
      <p className="mt-4 text-sm text-gray-500">블스피 운영팀 · 갱신 <time dateTime={SITE_UPDATED}>{SITE_UPDATED}</time></p>
    </header>
    {sections.map((section, i) => <section key={section.heading} id={`section-${i + 1}`} className="mb-9">
      <h2 className="mb-4 text-xl font-bold text-gray-900">{section.heading}</h2>
      {section.paragraphs.map((text) => <p key={text} className="mb-3 leading-8 text-gray-700">{text}</p>)}
    </section>)}
    {sources && <section className="mb-10"><h2 className="mb-4 text-xl font-bold">확인에 사용한 자료</h2><ul className="space-y-3">{sources.map(source => <li key={source.url}><a className="text-blue-700 underline underline-offset-4" href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></li>)}</ul></section>}
    <nav aria-label="관련 페이지" className="flex flex-wrap gap-4 border-t border-gray-200 pt-6 text-blue-700">
      <Link href="/analyze">블로그 분석 시작</Link><Link href="/guides">블로그 성장 가이드</Link>
      <Link href={path === '/about' ? '/methodology' : '/about'}>{path === '/about' ? '분석 기준과 데이터 출처' : '블스피 소개'}</Link><Link href="/pricing">요금제</Link>
    </nav>
  </article>
}
