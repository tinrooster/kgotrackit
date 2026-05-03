"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface ComboboxOption {
  label: string
  value: string
}

export interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  emptyText?: string
  allowCustomValue?: boolean
  disabled?: boolean
}

/**
 * Searchable dropdown without cmdk: native input + buttons avoid cmdk/Radix pointer quirks
 * in Electron and non-modal dialogs (items looked interactive but clicks never committed).
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  emptyText = "No options found.",
  allowCustomValue = false,
  disabled = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [activeIndex, setActiveIndex] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)
  const listId = React.useId()

  const handleOpenChange = React.useCallback((next: boolean) => {
    setOpen(next)
    if (next) {
      setQuery("")
      setActiveIndex(0)
    }
  }, [])

  const handleSelect = React.useCallback(
    (selectedValue: string) => {
      const option = options.find(
        (opt) =>
          opt.value === selectedValue ||
          opt.label === selectedValue ||
          `${opt.label}\u2000${opt.value}` === selectedValue
      )
      if (option) {
        onChange(option.value)
      } else if (allowCustomValue) {
        onChange(selectedValue)
      }
      setOpen(false)
    },
    [options, onChange, allowCustomValue]
  )

  const displayValue = React.useMemo(() => {
    const option = options.find((opt) => opt.value === value)
    return option?.label ?? value ?? ""
  }, [options, value])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return options
    }
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    )
  }, [options, query])

  const trimmedQuery = query.trim()
  const showCustomAdd =
    allowCustomValue &&
    trimmedQuery.length > 0 &&
    !options.some(
      (o) =>
        o.value === trimmedQuery ||
        o.label === trimmedQuery ||
        o.label.toLowerCase() === trimmedQuery.toLowerCase()
    )

  const rowCount = filtered.length + (showCustomAdd ? 1 : 0)

  React.useEffect(() => {
    if (!open) {
      return
    }
    if (rowCount === 0) {
      setActiveIndex(-1)
      return
    }
    setActiveIndex(0)
  }, [open, query])

  React.useEffect(() => {
    if (!open) {
      return
    }
    setActiveIndex((prev) => {
      if (rowCount === 0) {
        return -1
      }
      return Math.min(Math.max(0, prev), rowCount - 1)
    })
  }, [open, rowCount])

  React.useLayoutEffect(() => {
    if (!open || activeIndex < 0) {
      return
    }
    const el = listRef.current?.querySelector(
      `[data-combobox-row="${activeIndex}"]`
    )
    el?.scrollIntoView({ block: "nearest" })
  }, [open, activeIndex])

  const commitActive = React.useCallback(() => {
    if (activeIndex < 0 || rowCount === 0) {
      return
    }
    if (activeIndex < filtered.length) {
      handleSelect(filtered[activeIndex].value)
      return
    }
    if (showCustomAdd && activeIndex === filtered.length) {
      handleSelect(trimmedQuery)
    }
  }, [
    activeIndex,
    rowCount,
    filtered,
    showCustomAdd,
    trimmedQuery,
    handleSelect,
  ])

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation()
      setOpen(false)
      return
    }

    if (rowCount === 0) {
      return
    }

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault()
        setActiveIndex((i) => {
          const base = i < 0 ? -1 : i
          return Math.min(base + 1, rowCount - 1)
        })
        break
      }
      case "ArrowUp": {
        e.preventDefault()
        setActiveIndex((i) => Math.max((i < 0 ? 0 : i) - 1, 0))
        break
      }
      case "Home": {
        e.preventDefault()
        setActiveIndex(0)
        break
      }
      case "End": {
        e.preventDefault()
        setActiveIndex(rowCount - 1)
        break
      }
      case "Enter": {
        e.preventDefault()
        commitActive()
        break
      }
      default:
        break
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span
            className={cn(
              "truncate",
              !displayValue && "text-muted-foreground/45",
            )}
          >
            {displayValue || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        useNestedPortal={false}
        align="start"
        sideOffset={4}
        className="max-h-[min(24rem,70vh)] min-w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-1.5rem,28rem)] p-0"
        style={{ position: "relative", zIndex: 2147483647 }}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col overflow-hidden rounded-md bg-popover text-popover-foreground">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              type="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={placeholder}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground/50"
              aria-autocomplete="list"
              aria-controls={listId}
            />
          </div>
          <div
            ref={listRef}
            id={listId}
            className="max-h-[min(20rem,60vh)] overflow-y-auto overflow-x-hidden p-1"
            role="listbox"
          >
            {filtered.length === 0 && !showCustomAdd ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {emptyText}
              </p>
            ) : null}
            {filtered.map((option, idx) => (
              <button
                key={option.value}
                type="button"
                role="option"
                data-combobox-row={idx}
                aria-selected={open && activeIndex === idx}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                  open && activeIndex === idx && "bg-accent text-accent-foreground"
                )}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  handleSelect(option.value)
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value === option.value ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="truncate">{option.label}</span>
              </button>
            ))}
            {showCustomAdd ? (
              <button
                type="button"
                role="option"
                data-combobox-row={filtered.length}
                aria-selected={open && activeIndex === filtered.length}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                  open &&
                    activeIndex === filtered.length &&
                    "bg-accent text-accent-foreground"
                )}
                onMouseEnter={() => setActiveIndex(filtered.length)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  handleSelect(trimmedQuery)
                }}
              >
                Add &quot;{trimmedQuery}&quot;
              </button>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
