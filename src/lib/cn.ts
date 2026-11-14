import { clsx } from "clsx";

export function cn(...a: (string | false | null | undefined)[]) {
  return clsx(a);
}
