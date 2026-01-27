'use client'

import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'

/**
 * P3-4: 공통 버튼 컴포넌트
 * Primary, Secondary, Ghost, Danger 등 일관된 스타일 제공
 */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  fullWidth?: boolean
  href?: string
  external?: boolean
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-[#0064FF] text-white
    hover:bg-[#0052D4] active:bg-[#0045B5]
    shadow-lg shadow-[#0064FF]/20 hover:shadow-xl hover:shadow-[#0064FF]/30
    focus:ring-2 focus:ring-[#0064FF]/50 focus:ring-offset-2
  `,
  secondary: `
    bg-gray-100 text-gray-900
    hover:bg-gray-200 active:bg-gray-300
    focus:ring-2 focus:ring-gray-300 focus:ring-offset-2
  `,
  ghost: `
    bg-transparent text-gray-600
    hover:bg-gray-100 active:bg-gray-200
    focus:ring-2 focus:ring-gray-200 focus:ring-offset-2
  `,
  danger: `
    bg-red-500 text-white
    hover:bg-red-600 active:bg-red-700
    shadow-lg shadow-red-500/20 hover:shadow-xl hover:shadow-red-500/30
    focus:ring-2 focus:ring-red-500/50 focus:ring-offset-2
  `,
  success: `
    bg-green-500 text-white
    hover:bg-green-600 active:bg-green-700
    shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/30
    focus:ring-2 focus:ring-green-500/50 focus:ring-offset-2
  `,
  outline: `
    bg-transparent text-[#0064FF] border-2 border-[#0064FF]
    hover:bg-[#0064FF]/5 active:bg-[#0064FF]/10
    focus:ring-2 focus:ring-[#0064FF]/50 focus:ring-offset-2
  `
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3 text-base rounded-xl gap-2',
  xl: 'px-8 py-4 text-lg rounded-2xl gap-3'
}

const iconSizeMap: Record<ButtonSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
  xl: 'w-6 h-6'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  href,
  external = false,
  className = '',
  disabled,
  children,
  ...props
}, ref) => {
  const baseStyles = `
    inline-flex items-center justify-center font-semibold
    transition-all duration-200 ease-out
    disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
    outline-none
  `

  const combinedClassName = `
    ${baseStyles}
    ${variantStyles[variant]}
    ${sizeStyles[size]}
    ${fullWidth ? 'w-full' : ''}
    ${className}
  `.replace(/\s+/g, ' ').trim()

  const iconSize = iconSizeMap[size]

  const content = (
    <>
      {loading && (
        <Loader2 className={`${iconSize} animate-spin`} />
      )}
      {!loading && icon && iconPosition === 'left' && (
        <span className={iconSize}>{icon}</span>
      )}
      {children && <span>{children}</span>}
      {!loading && icon && iconPosition === 'right' && (
        <span className={iconSize}>{icon}</span>
      )}
    </>
  )

  // href가 있으면 Link로 렌더링
  if (href && !disabled && !loading) {
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={combinedClassName}
        >
          {content}
        </a>
      )
    }
    return (
      <Link href={href} className={combinedClassName}>
        {content}
      </Link>
    )
  }

  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
      className={combinedClassName}
      disabled={disabled || loading}
      {...props}
    >
      {content}
    </motion.button>
  )
})

Button.displayName = 'Button'

export default Button

/**
 * 아이콘만 있는 버튼
 */
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  label: string // 접근성을 위한 aria-label
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({
  icon,
  variant = 'ghost',
  size = 'md',
  loading = false,
  label,
  className = '',
  disabled,
  ...props
}, ref) => {
  const sizeMap: Record<ButtonSize, string> = {
    sm: 'p-1.5 rounded-lg',
    md: 'p-2 rounded-xl',
    lg: 'p-2.5 rounded-xl',
    xl: 'p-3 rounded-2xl'
  }

  const iconSizes: Record<ButtonSize, string> = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-7 h-7'
  }

  const combinedClassName = `
    inline-flex items-center justify-center
    transition-all duration-200 ease-out
    disabled:opacity-50 disabled:cursor-not-allowed
    outline-none
    ${variantStyles[variant]}
    ${sizeMap[size]}
    ${className}
  `.replace(/\s+/g, ' ').trim()

  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: disabled || loading ? 1 : 0.95 }}
      className={combinedClassName}
      disabled={disabled || loading}
      aria-label={label}
      {...props}
    >
      {loading ? (
        <Loader2 className={`${iconSizes[size]} animate-spin`} />
      ) : (
        <span className={iconSizes[size]}>{icon}</span>
      )}
    </motion.button>
  )
})

IconButton.displayName = 'IconButton'

/**
 * 버튼 그룹 (여러 버튼을 나란히 배치)
 */
export function ButtonGroup({
  children,
  className = ''
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {children}
    </div>
  )
}
