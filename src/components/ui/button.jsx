import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "@/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "text-white shadow hover:opacity-90",
        outline: "border bg-transparent hover:opacity-80",
        ghost: "hover:opacity-80",
        destructive: "bg-red-600 text-white hover:bg-red-700",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, style, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  const baseStyle = (!variant || variant === "default")
    ? { background: "linear-gradient(135deg, #6c63ff, #5a52d5)", ...style }
    : style
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} style={baseStyle} {...props} />
})
Button.displayName = "Button"
export { Button, buttonVariants }
