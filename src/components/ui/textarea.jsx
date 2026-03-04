import * as React from "react"
import { cn } from "@/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea className={cn("flex min-h-[80px] w-full rounded-lg border px-3 py-2 text-sm resize-none focus-visible:outline-none disabled:opacity-50", className)} style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)" }} ref={ref} {...props} />
))
Textarea.displayName = "Textarea"
export { Textarea }
