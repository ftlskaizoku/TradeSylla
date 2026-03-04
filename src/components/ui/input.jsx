import * as React from "react"
import { cn } from "@/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input type={type} className={cn("flex h-9 w-full rounded-lg border px-3 py-1 text-sm focus-visible:outline-none disabled:opacity-50", className)} style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)" }} ref={ref} {...props} />
))
Input.displayName = "Input"
export { Input }
