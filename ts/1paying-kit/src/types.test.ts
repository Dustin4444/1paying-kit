import { decode, encode, rfc8949EncodeOptions } from 'cborg'
import { describe, expect, it } from 'vitest'
import {
  isSettlementPending,
  resolvePaymentFlow,
  sanitizeIconUrl,
  sanitizeServiceName,
  sanitizeTags,
  selectPaymentRequirements,
  toMessage,
  toMessageCompact,
  type Message,
  type PaymentRequired,
  type PaymentRequirements,
  type PaymentRequirementsResponse,
  type SettleResponse
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

describe('x402 v2 resource info', () => {
  it('round-trips serviceName, tags and iconUrl', () => {
    const msg: Message<PaymentRequired> = {
      pubkey: new Uint8Array(32),
      nonce: 3,
      payload: {
        x402Version: 2,
        resource: {
          url: 'https://api.example.com/premium-data',
          description: 'Access to premium market data',
          mimeType: 'application/json',
          serviceName: 'Example Market Data',
          tags: ['market-data', 'finance'],
          iconUrl: 'https://api.example.com/icon.png'
        },
        accepts: [
          {
            scheme: 'exact',
            network: 'eip155:84532',
            amount: '10000',
            asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
            maxTimeoutSeconds: 60,
            extra: { name: 'USDC', version: '2' }
          }
        ]
      }
    }

    const compact = toMessageCompact(msg) as any
    expect(compact.p.r).toEqual({
      u: 'https://api.example.com/premium-data',
      d: 'Access to premium market data',
      m: 'application/json',
      sn: 'Example Market Data',
      t: ['market-data', 'finance'],
      iu: 'https://api.example.com/icon.png'
    })

    const back = roundTrip(msg) as Message<PaymentRequired>
    expect(back.payload).toEqual(msg.payload)
  })

  it('drops display fields that violate the spec limits', () => {
    const msg: Message<PaymentRequired> = {
      pubkey: new Uint8Array(32),
      nonce: 4,
      payload: {
        x402Version: 2,
        resource: {
          url: 'https://api.example.com/data',
          serviceName: 'x'.repeat(33),
          tags: ['ok', 'y'.repeat(33), 'ok2', 'ok3', 'ok4', 'ok5', 'ok6'],
          iconUrl: 'javascript:alert(1)'
        },
        accepts: [
          {
            scheme: 'exact',
            network: 'eip155:8453',
            amount: '1',
            asset: 'A',
            payTo: 'B',
            maxTimeoutSeconds: 60
          }
        ]
      }
    }

    const compact = toMessageCompact(msg) as any
    expect(compact.p.r.sn).toBeUndefined()
    expect(compact.p.r.iu).toBeUndefined()
    expect(compact.p.r.t).toEqual(['ok', 'ok2', 'ok3', 'ok4', 'ok5'])
  })

  it('validates individual display fields', () => {
    expect(sanitizeServiceName('Example')).toBe('Example')
    expect(sanitizeServiceName('naïve')).toBeUndefined()
    expect(sanitizeServiceName('x'.repeat(32))).toBe('x'.repeat(32))
    expect(sanitizeTags(['a', 1, 'b'])).toEqual(['a', 'b'])
    expect(sanitizeTags([])).toBeUndefined()
    expect(sanitizeIconUrl('http://a.example/i.png')).toBe(
      'http://a.example/i.png'
    )
    expect(sanitizeIconUrl('/relative.png')).toBeUndefined()
    expect(
      sanitizeIconUrl(`https://a.example/${'x'.repeat(2048)}`)
    ).toBeUndefined()
  })
})

describe('x402 v2 extensions', () => {
  it('round-trips the extensions map keyed by extension identifier', () => {
    const msg: Message<PaymentRequired> = {
      pubkey: new Uint8Array(32),
      nonce: 5,
      payload: {
        x402Version: 2,
        resource: { url: 'https://api.example.com/data' },
        accepts: [
          {
            scheme: 'exact',
            network: 'eip155:8453',
            amount: '1',
            asset: 'A',
            payTo: 'B',
            maxTimeoutSeconds: 60
          }
        ],
        extensions: {
          bazaar: {
            info: { category: 'finance' },
            schema: { type: 'object' }
          }
        }
      }
    }

    const compact = toMessageCompact(msg) as any
    expect(compact.p.ex).toEqual({
      bazaar: { i: { category: 'finance' }, s: { type: 'object' } }
    })

    const back = roundTrip(msg) as Message<PaymentRequired>
    expect(back.payload).toEqual(msg.payload)
  })
})

describe('x402 v2 payment flows', () => {
  const req = (extra?: Record<string, unknown>): PaymentRequirements => ({
    scheme: 'exact',
    network: 'eip155:8453',
    amount: '1',
    asset: 'A',
    payTo: 'B',
    maxTimeoutSeconds: 60,
    ...(extra ? { extra } : {})
  })

  it('defaults an omitted paymentFlow to authorization', () => {
    expect(resolvePaymentFlow(req())).toBe('authorization')
    expect(resolvePaymentFlow(req({ paymentFlow: 'escrow' }))).toBe('escrow')
  })

  it('drops unknown flows and prefers authorization', () => {
    const upfront = req({ paymentFlow: 'upfront' })
    const authorization = req()
    const unknown = req({ paymentFlow: 'teleport' })

    expect(
      selectPaymentRequirements([upfront, unknown, authorization])
    ).toEqual([authorization, upfront])
  })
})

describe('settlement_pending', () => {
  const base: SettleResponse = {
    success: false,
    transaction: '0xabc',
    network: 'eip155:8453'
  }

  it('is recognized only with a non-empty transaction', () => {
    expect(
      isSettlementPending({ ...base, errorReason: 'settlement_pending' })
    ).toBe(true)
    expect(
      isSettlementPending({
        ...base,
        transaction: '',
        errorReason: 'settlement_pending'
      })
    ).toBe(false)
    expect(
      isSettlementPending({ ...base, errorReason: 'insufficient_funds' })
    ).toBe(false)
    expect(isSettlementPending({ ...base, success: true })).toBe(false)
  })
})
