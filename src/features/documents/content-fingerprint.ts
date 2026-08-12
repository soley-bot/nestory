export async function sha256Hex(input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const exactBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(exactBuffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", exactBuffer);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
