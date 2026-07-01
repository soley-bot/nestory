import type { InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "inputMode" | "type">;

export function SearchInput(props: SearchInputProps) {
  return <Input autoComplete="off" inputMode="search" type="text" {...props} />;
}
