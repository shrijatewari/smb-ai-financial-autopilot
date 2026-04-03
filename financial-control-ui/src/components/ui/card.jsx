import * as React from 'react'
import { cn } from '../../lib/utils'

function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/40 bg-white/75 shadow-[0_8px_32px_-8px_rgba(108,59,255,0.12)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_-8px_rgba(108,59,255,0.18)]',
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1.5 p-6 pb-2', className)} {...props} />
}

function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-lg font-semibold tracking-tight text-violet-950', className)} {...props} />
}

function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm text-violet-950/55', className)} {...props} />
}

function CardContent({ className, ...props }) {
  return <div className={cn('p-6 pt-2', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent }
