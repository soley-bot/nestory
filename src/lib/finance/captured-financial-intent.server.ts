import "server-only";
import { copyFinancialGeneration } from "./financial-write-context";

const capturedIntents = new WeakMap<object, FormData>();

export function captureFinancialIntent(client: object, intent: FormData) {
  capturedIntents.set(client, copyFinancialGeneration(intent, new FormData()));
}

// Carry the original browser intent into a privileged storage operation. Never
// read the latest generation to upgrade an old request.
export function getCapturedFinancialIntent(client: object): FormData | undefined {
  const captured = capturedIntents.get(client);
  return captured ? copyFinancialGeneration(captured, new FormData()) : undefined;
}
