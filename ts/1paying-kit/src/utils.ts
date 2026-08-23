const CHUNK_SIZE = 0x8000

/**
 * Converts a Uint8Array into a binary (latin1) string.
 * Chunked to avoid spreading huge arrays into String.fromCharCode.
 * @param bytes The Uint8Array to convert.
 * @returns The binary string.
 */
function bytesToBinaryString(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE))
  }
  return bin
}

/**
 * Encodes a Uint8Array to a base64 string.
 * @param bytes The Uint8Array to encode.
 * @returns The base64 encoded string.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof (bytes as any).toBase64 === 'function') {
    return (bytes as any).toBase64()
  }

  return globalThis.btoa(bytesToBinaryString(bytes))
}

/**
 * Encodes a Uint8Array to a base64url string.
 * @param bytes The Uint8Array to encode.
 * @returns The base64url encoded string.
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  if (typeof (bytes as any).toBase64 === 'function') {
    return (bytes as any).toBase64({ alphabet: 'base64url', omitPadding: true })
  }

  return globalThis
    .btoa(bytesToBinaryString(bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

/**
 * Decodes a base64 or base64url encoded string to a Uint8Array.
 * @param str The base64 or base64url encoded string.
 * @returns The decoded Uint8Array.
 */
export function base64ToBytes(str: string): Uint8Array {
  if (typeof (Uint8Array as any).fromBase64 === 'function') {
    if (str.includes('-') || str.includes('_')) {
      return (Uint8Array as any).fromBase64(str, { alphabet: 'base64url' })
    }
    return (Uint8Array as any).fromBase64(str)
  }

  // Normalize base64url to base64 and restore padding so atob can decode.
  let normalized = str.replaceAll('-', '+').replaceAll('_', '/')
  const mod = normalized.length % 4
  if (mod === 2) normalized += '=='
  else if (mod === 3) normalized += '='
  else if (mod === 1) throw new Error('Invalid base64/base64url string')

  return Uint8Array.from(globalThis.atob(normalized), (m) => m.charCodeAt(0))
}

/**
 * Decodes a base64 or base64url encoded string to a regular string.
 * @param str The base64 or base64url encoded string.
 * @returns The decoded string.
 */
export function base64ToString(str: string): string {
  const bytes = base64ToBytes(str)

  if (typeof globalThis.TextDecoder === 'function') {
    return new TextDecoder().decode(bytes)
  }

  // Node fallback (for unusual runtimes where TextDecoder isn't global)
  if (typeof (globalThis as any).Buffer !== 'undefined') {
    return (globalThis as any).Buffer.from(bytes).toString('utf8')
  }

  // Best-effort fallback (binary/latin1)
  return bytesToBinaryString(bytes)
}

/**
 * Encodes a regular string to a base64 string.
 * @param str The string to encode.
 * @returns The base64 encoded string.
 */
export function stringToBase64(str: string): string {
  if (typeof globalThis.TextEncoder === 'function') {
    return bytesToBase64(new TextEncoder().encode(str))
  }

  // Node fallback (for unusual runtimes where TextEncoder isn't global)
  if (typeof (globalThis as any).Buffer !== 'undefined') {
    return (globalThis as any).Buffer.from(str, 'utf8').toString('base64')
  }

  // Best-effort fallback (ASCII-only)
  return globalThis.btoa(str)
}
