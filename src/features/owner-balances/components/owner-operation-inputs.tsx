"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";

export type OwnerTransactionOption = { id: string; label: string };
export function OwnerTransactionPicker({ name, label, options }: {name: string; label: string; options: OwnerTransactionOption[]}) {
  const [selected, setSelected] = useState("");
  const selectedOption = options.find(option => option.id === selected);
  return <div className="space-y-2">
    <label className="grid gap-1 text-sm">{label}
      <select className="h-9 w-full rounded-md border bg-background px-2" name={name} required value={selectedOption?.id ?? ""} onChange={event => setSelected(event.target.value)}>
        <option value="">Select a recorded transaction</option>
        {options.map(option => <option value={option.id} key={option.id}>{option.label}</option>)}
      </select>
    </label>
    {selectedOption ? <p role="status" className="rounded-md border p-3 text-sm">Transaction to reverse: {selectedOption.label}. Confirm its date and amount before continuing.</p> : null}
    {options.length === 0 ? <p className="text-sm text-muted-foreground">No unreversed transactions in this owner, property and month. Select the original transaction’s month to continue.</p> : null}
  </div>;
}

export function EvidenceFileField() {
  const [hash, setHash] = useState("");
  const [status, setStatus] = useState("");
  const version = useRef(0);
  return <div className="space-y-1 text-sm">
    <label className="grid gap-1">Evidence file
      <Input type="file" required onChange={async event => {
        const current = ++version.current;
        const file = event.target.files?.[0];
        const input = event.target;
        setHash(""); input.setCustomValidity("Wait for evidence verification to finish.");
        if (!file) { setStatus(""); input.setCustomValidity(""); return; }
        setStatus("Verifying evidence file…");
        try {
          const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
          if (version.current !== current) return;
          setHash(Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join(""));
          setStatus(`${file.name}: evidence fingerprint ready.`); input.setCustomValidity("");
        } catch {
          if (version.current !== current) return;
          setStatus("Could not read this file. Select it again or choose another file.");
          input.setCustomValidity("Choose a readable evidence file.");
        }
      }} />
    </label>
    <input name="evidenceSha256" type="hidden" value={hash} />
    <p className="text-xs text-muted-foreground">The file is verified on this device. Keep the original evidence at the reference location; this records its fingerprint, not a file upload.</p>
    {status ? <p role="status">{status}</p> : null}
  </div>;
}
