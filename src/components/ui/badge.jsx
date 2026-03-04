import { cn } from "@/utils"

export function Badge({ className, variant = "default", children, style, ...props }) {
  const variants = {
    default: { background: "rgba(108,99,255,0.15)", color: "var(--accent)" },
    success: { background: "rgba(46,213,115,0.15)", color: "var(--accent-success)" },
    danger:  { background: "rgba(255,71,87,0.15)",  color: "var(--accent-danger)" },
    warning: { background: "rgba(255,165,2,0.15)",  color: "var(--accent-warning)" },
    muted:   { background: "var(--bg-elevated)",    color: "var(--text-muted)" },
  }
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", className)} style={{ ...variants[variant], ...style }} {...props}>{children}</span>
}
