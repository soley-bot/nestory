"use client"

import * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"

type CheckboxControlProps = React.ComponentProps<typeof Checkbox>

/** Compatibility adapter while feature code moves to the shadcn Checkbox. */
export function CheckboxControl(props: CheckboxControlProps) {
  return <Checkbox {...props} />
}
