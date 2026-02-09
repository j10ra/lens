import * as React from "react"
import { createContext, useContext, useState } from "react"
import { cn } from "@/lib/utils"

const TabsContext = createContext<{ value: string; onChange: (v: string) => void }>({ value: "", onChange: () => {} })

function Tabs({
  className,
  defaultValue = "",
  value: controlledValue,
  onValueChange,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
}) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const value = controlledValue ?? internalValue
  const onChange = onValueChange ?? setInternalValue

  return (
    <TabsContext.Provider value={{ value, onChange }}>
      <div data-slot="tabs" className={cn("flex flex-col gap-2", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

function TabsList({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tabs-list"
      role="tablist"
      className={cn("bg-muted rounded-lg p-[3px] h-9 inline-flex w-fit items-center justify-center text-muted-foreground", className)}
      {...props}
    >
      {children}
    </div>
  )
}

function TabsTrigger({
  className,
  value,
  children,
  ...props
}: React.ComponentProps<"button"> & { value: string }) {
  const ctx = useContext(TabsContext)
  const isActive = ctx.value === value

  return (
    <button
      data-slot="tabs-trigger"
      role="tab"
      aria-selected={isActive}
      data-state={isActive ? "active" : "inactive"}
      onClick={() => ctx.onChange(value)}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "text-foreground/60 hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

function TabsContent({
  className,
  value,
  children,
  ...props
}: React.ComponentProps<"div"> & { value: string }) {
  const ctx = useContext(TabsContext)
  if (ctx.value !== value) return null

  return (
    <div data-slot="tabs-content" role="tabpanel" className={cn("flex-1 outline-none", className)} {...props}>
      {children}
    </div>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
