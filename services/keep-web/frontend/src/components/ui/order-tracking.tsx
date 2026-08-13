"use client"

import * as React from "react"
import { CheckCircle2, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface OrderTrackingProps extends React.HTMLAttributes<HTMLDivElement> {
  steps: { name: string; timestamp: string; isCompleted: boolean }[]
}

const OrderTracking = React.forwardRef<HTMLDivElement, OrderTrackingProps>(
  ({ steps = [], className, ...props }, ref) => (
    <div ref={ref} className={cn("w-full max-w-md", className)} {...props}>
      {steps.length > 0 ? steps.map((step, index) => (
        <div key={`${step.name}-${index}`} className="flex">
          <div className="flex flex-col items-center">
            {step.isCompleted ? <CheckCircle2 className="h-6 w-6 shrink-0 text-primary/70" /> : <Circle className="h-6 w-6 shrink-0 text-muted-foreground" />}
            {index < steps.length - 1 && <div className={cn("w-[1.5px] grow", steps[index + 1].isCompleted ? "bg-primary/70" : "bg-muted-foreground")} />}
          </div>
          <div className="ml-3 pb-6"><p className="text-sm font-medium">{step.name}</p><p className="text-sm text-muted-foreground">{step.timestamp}</p></div>
        </div>
      )) : <p className="text-sm text-foreground/80">아직 계획 단계가 없어요.</p>}
    </div>
  ),
)
OrderTracking.displayName = "OrderTracking"

export { OrderTracking }
