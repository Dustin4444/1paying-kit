import { bench, describe } from 'vitest'
import {
  base64ToBytes,
  base64ToString,
  bytesToBase64,
  bytesToBase64Url,
  stringToBase64
} from '../src/utils.js'

const makeBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i += 1) {
    bytes[i] = (i * 31 + 7) & 0xff
  }
  return bytes
}

const unicodeText =
  '你好，世界🌍 — café — Καλημέρα — مرحبا — 1Pay.ing payment payload '.repeat(
    64
  )

const smallBytes = makeBytes(64)
const largeBytes = makeBytes(64 * 1024)

const smallBase64 = bytesToBase64(smallBytes)
const largeBase64 = bytesToBase64(largeBytes)
const largeBase64Url = bytesToBase64Url(largeBytes)
const unicodeBase64 = stringToBase64(unicodeText)

describe('base64 encoding', () => {
  bench('bytesToBase64 (64 B)', () => {
    bytesToBase64(smallBytes)
  })

  bench('bytesToBase64 (64 KiB)', () => {
    bytesToBase64(largeBytes)
  })

  bench('bytesToBase64Url (64 KiB)', () => {
    bytesToBase64Url(largeBytes)
  })

  bench('stringToBase64 (unicode)', () => {
    stringToBase64(unicodeText)
  })
})

describe('base64 decoding', () => {
  bench('base64ToBytes (64 B)', () => {
    base64ToBytes(smallBase64)
  })

  bench('base64ToBytes (64 KiB)', () => {
    base64ToBytes(largeBase64)
  })

  bench('base64ToBytes (64 KiB base64url)', () => {
    base64ToBytes(largeBase64Url)
  })

  bench('base64ToString (unicode)', () => {
    base64ToString(unicodeBase64)
  })
})
