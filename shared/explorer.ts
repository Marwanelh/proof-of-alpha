/** Block-explorer links. Client-safe: no credentials, no I/O. */

export function explorerBase(chainId: number): string {
  return chainId === 56 ? "https://bscscan.com" : "https://testnet.bscscan.com";
}

export function txUrl(chainId: number, hash: string): string {
  return `${explorerBase(chainId)}/tx/${hash}`;
}

export function addressUrl(chainId: number, address: string): string {
  return `${explorerBase(chainId)}/address/${address}`;
}

/** 0x6860e4…0360 */
export function shortHex(hex: string, head = 6, tail = 4): string {
  return hex.length <= head + tail + 1 ? hex : `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

/** "CryptoNova" -> "CN", "sample-kol-alpha" -> "SA". */
export function initials(name: string): string {
  const parts = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean);
  const letters = parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}
