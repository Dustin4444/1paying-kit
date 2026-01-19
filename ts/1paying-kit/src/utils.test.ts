import { describe, expect, it } from 'vitest'
import { base64ToString, stringToBase64 } from './utils.js'

describe('base64 utils (unicode-safe)', () => {
  it('round-trips Unicode strings via base64', () => {
    const input = '你好，世界🌍 — café — Καλημέρα — مرحبا'
    const encoded = stringToBase64(input)
    expect(base64ToString(encoded)).toBe(input)
  })

  it('accepts base64url (unpadded) input for decoding', () => {
    const input = 'emoji: 😄, CJK: 汉字, accents: naïve'
    const b64 = stringToBase64(input)
    const b64url = b64
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '')
    expect(base64ToString(b64url)).toBe(input)
  })
})
