import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";

type SearchInputProps = Omit<ComponentProps<"input">, "inputMode" | "type">;

export function SearchInput(props: SearchInputProps) {
  return <Input autoComplete="off" inputMode="search" type="text" {...props} />;
}
