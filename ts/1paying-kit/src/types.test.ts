import { decode, encode, rfc8949EncodeOptions } from 'cborg'
import { describe, expect, it } from 'vitest'
import {
  toMessage,
  toMessageCompact,
  type Message,
  type PaymentRequired,
  type PaymentRequirementsResponse
} from './types.js'

const roundTrip = (msg: Message<any>) =>
  toMessage(decode(encode(toMessageCompact(msg), rfc8949EncodeOptions)) as any)

describe('message compaction', () => {
  it('omits absent optional fields instead of encoding CBOR undefined', () => {
    const msg: Message<PaymentRequired> = {
      pubkey: new Uint8Array(32),
      nonce: 1,
      payload: {
        x402Version: 2,
        resource: { url: 'https://api.example.com/data' },
        accepts: [
          {
            scheme: 'exact',
            network: 'solana',
            amount: '100',
            asset: 'A',
            payTo: 'B',
            maxTimeoutSeconds: 60
          }
        ]
      }
    }

    const compact = toMessageCompact(msg) as any
    expect(Object.keys(compact.p.r)).toEqual(['u'])
    expect('e' in compact.p).toBe(false)

    // CBOR `undefined` (0xf7) must not appear in the encoded message.
    const bytes = encode(compact, rfc8949EncodeOptions)
    expect(bytes.includes(0xf7)).toBe(false)

    const back = roundTrip(msg) as Message<PaymentRequired>
    expect(back.payload).toEqual(msg.payload)
  })

  it('round-trips a v1 requirements response', () => {
    const msg: Message<PaymentRequirementsResponse> = {
      pubkey: new Uint8Array(32),
      nonce: 2,
      payload: {
        x402Version: 1,
        error: 'X-PAYMENT header is required',
        accepts: [
          {
            scheme: 'exact',
            network: 'base-sepolia',
            maxAmountRequired: '10000',
            asset: '0xasset',
            payTo: '0xpayTo',
            resource: 'https://api.example.com/data',
            description: 'premium data',
            maxTimeoutSeconds: 60
          }
        ]
      }
    }

    const back = roundTrip(msg) as Message<PaymentRequirementsResponse>
    expect(back.payload).toEqual(msg.payload)
    expect('resource' in back.payload).toBe(false)
  })
})
