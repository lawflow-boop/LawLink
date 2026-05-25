import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-primary/10 text-primary",
        secondary:
          "bg-muted text-muted-foreground",
        destructive:
          "bg-[#fde8e8] text-[#d4252f]",
        outline: "border border-border text-foreground",
        teal: "bg-primary/10 text-primary",
        green: "bg-[#e6f4ea] text-[#1aa126]",
        orange: "bg-[#fef3e2] text-[#e18d00]",
        red: "bg-[#fde8e8] text-[#d4252f]",
        purple: "bg-[#f3eafc] text-[#722ec7]",
        blue: "bg-[#eff4ff] text-[#3b82f6]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
