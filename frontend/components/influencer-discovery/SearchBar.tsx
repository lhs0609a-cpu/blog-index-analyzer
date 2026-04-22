'use client'

import { useState, useRef } from 'react'
import { Search, Loader2 } from 'lucide-react'

interface SearchBarProps {
  onSearch: (query: string) => void
  loading?: boolean
  placeholder?: string
}

export default function SearchBar({ onSearch, loading = false, placeholder }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (trimmed) {
      onSearch(trimmed)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative flex items-center">
        <div className="absolute left-4 text-gray-400">
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Search className="w-5 h-5" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder || '키워드로 인플루언서를 검색하세요 (예: 뷰티, 맛집, IT)'}
          className="w-full pl-12 pr-28 py-4 text-base bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0064FF]/30 focus:border-[#0064FF] transition-all shadow-sm"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-2 px-6 py-2.5 bg-[#0064FF] text-white text-sm font-bold rounded-xl hover:bg-[#0050CC] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          검색
        </button>
      </div>
    </form>
  )
}
