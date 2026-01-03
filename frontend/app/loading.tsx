export default function Loading() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 -left-40 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl animate-pulse" />
      </div>

      <div className="relative flex flex-col items-center">
        {/* Loading spinner */}
        <div className="relative w-16 h-16 mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-white/10" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-500 animate-spin" />
        </div>

        {/* Loading text */}
        <p className="text-white/60 text-sm animate-pulse">
          불러오는 중...
        </p>
      </div>
    </div>
  )
}
