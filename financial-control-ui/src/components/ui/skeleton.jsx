import { cn } from '../../lib/utils'

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-gradient-to-r from-violet-100/80 via-violet-50/80 to-violet-100/80 bg-[length:200%_100%]', className)}
      {...props}
    />
  )
}

export { Skeleton }
