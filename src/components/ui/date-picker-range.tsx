"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { type DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerWithRangeProps {
  value?: DateRange;
  onValueChange?: (date: DateRange | undefined) => void;
}

export function DatePickerWithRange({
  value,
  onValueChange,
}: DatePickerWithRangeProps) {
  const handleSelect = (newDate: DateRange | undefined) => {
    onValueChange?.(newDate);
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              "min-w-[320px] justify-start text-left font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value?.from ? (
              value.to ? (
                <>
                  {format(value.from, "LLL dd, y")} -{" "}
                  {format(value.to, "LLL dd, y")}
                </>
              ) : (
                format(value.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        }
      />
      <PopoverContent
        className="w-auto rounded-xl border border-border/70 p-3 shadow-xl"
        align="start"
        sideOffset={8}
      >
        <Calendar
          mode="range"
          defaultMonth={value?.from}
          selected={value}
          onSelect={handleSelect}
          numberOfMonths={2}
          className="rounded-lg [--cell-radius:var(--radius-lg)] [--cell-size:--spacing(9)]"
          classNames={{
            range_middle: "rounded-none bg-primary/15 text-foreground",
            range_start: "bg-primary text-primary-foreground",
            range_end: "bg-primary text-primary-foreground",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
