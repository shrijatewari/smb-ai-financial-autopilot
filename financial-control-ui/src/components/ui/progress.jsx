import { cn } from '../../lib/utils'

function Progress({ className, value = 0 }) {
  const v = Math.min(100, Math.max(0, Number(value) || 0))
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-violet-100', className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#6C3BFF] via-violet-500 to-emerald-400 transition-all duration-500 ease-out"
        style={{ width: `${v}%` }}
      />
    </div>
  )
}

export { Progress }
