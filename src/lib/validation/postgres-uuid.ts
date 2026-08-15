import { z } from "zod";

export function postgresUuid(message: string) {
  return z.guid(message);
}
