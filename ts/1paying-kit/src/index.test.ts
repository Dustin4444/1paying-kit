import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PayingKit,
  payingKit,
  stringToBase64,
  type PaymentRequired,
  type PaymentRequirementsResponse,
  type SettleResponse
} from './index.js'

describe('PayingKit#getPayUrl', () => {
  it('encodes requirements into a deterministic payment URL', async () => {
    const requirements1: PaymentRequirementsResponse = {
      'x402Version': 1,
      'error': 'X-PAYMENT header is required',
      'accepts': [
        {
          'scheme': 'exact',
          'network': 'base-sepolia',
          'maxAmountRequired': '10000',
          'asset': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          'payTo': '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
          'resource': 'https://api.example.com/premium-data',
          'description': 'Access to premium market data',
          'mimeType': 'application/json',
          'maxTimeoutSeconds': 60,
          'extra': {
            'name': 'USDC',
            'version': '2'
          }
        }
      ]
    }

    const requirements2: PaymentRequirementsResponse = {
      'x402Version': 1,
      'error': 'X-PAYMENT header is required',
      'accepts': [
        {
          'scheme': 'exact',
          'network': 'solana',
          'maxAmountRequired': '5000000',
          'asset': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          'payTo': '45FWyVsWLVUKyAdGwFaeDvxwYnQGoBshfoJAm6fhoECX',
          'resource': 'https://api.example.com/premium-data',
          'description': 'Access to premium market data 1',
          'mimeType': 'application/json',
          'maxTimeoutSeconds': 60,
          'extra': {
            'feePayer': 'CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5'
          }
        },
        {
          'scheme': 'exact',
          'network': 'solana-devnet',
          'maxAmountRequired': '5000000',
          'asset': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
          'payTo': '45FWyVsWLVUKyAdGwFaeDvxwYnQGoBshfoJAm6fhoECX',
          'resource': 'https://api.example.com/premium-data',
          'description': 'Access to premium market data 1',
          'mimeType': 'application/json',
          'maxTimeoutSeconds': 60,
          'extra': {
            'feePayer': 'CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5'
          }
        },
        {
          'scheme': 'exact',
          'network': 'solana',
          'maxAmountRequired': '5000000',
          'asset': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
          'payTo': '45FWyVsWLVUKyAdGwFaeDvxwYnQGoBshfoJAm6fhoECX',
          'resource': 'https://api.example.com/premium-data',
          'description': 'Access to premium market data 2',
          'mimeType': 'application/json',
          'maxTimeoutSeconds': 60,
          'extra': {
            'feePayer': 'CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5'
          }
        },
        {
          'scheme': 'exact',
          'network': 'solana',
          'maxAmountRequired': '50000000',
          'asset': 'So11111111111111111111111111111111111111111',
          'payTo': '45FWyVsWLVUKyAdGwFaeDvxwYnQGoBshfoJAm6fhoECX',
          'resource': 'https://api.example.com/premium-data',
          'description': 'Access to premium market data 3',
          'mimeType': 'application/json',
          'maxTimeoutSeconds': 60,
          'extra': {
            'feePayer': 'CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5'
          }
        },
        {
          'scheme': 'exact',
          'network': 'solana',
          'maxAmountRequired': '5000000000',
          'asset': 'PAYiNGqaLFRdBomkQY3JXZeCm7wzK7hKuhrJDzcZBWN',
          'payTo': '45FWyVsWLVUKyAdGwFaeDvxwYnQGoBshfoJAm6fhoECX',
          'resource': 'https://api.example.com/premium-data',
          'description': 'Access to premium market data 4',
          'mimeType': 'application/json',
          'maxTimeoutSeconds': 60,
          'extra': {
            'feePayer': 'CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5'
          }
        }
      ]
    }
    const json1 = JSON.stringify(requirements1)
    console.log('Requirements 1 JSON length:', json1.length)
    const json2 = JSON.stringify(requirements2)
    console.log('Requirements 2 JSON length:', json2.length)
    const { payUrl, txid } = await payingKit.getPayUrl(requirements1)
    console.log('Requirements 1 payUrl length:', payUrl.length)
    const { payUrl: payUrl2 } = await payingKit.getPayUrl(requirements2)
    console.log('Requirements 2 payUrl length:', payUrl2.length)
    console.log({ payUrl2, txid })
    expect(payUrl2.length < payUrl.length * 2).toBe(true)
  })
})

describe('PayingKit#waitForPaymentPayload', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retries a 200 response whose body is not JSON', async () => {
    const bodies = ['<html>proxy</html>', '<html>proxy</html>', null]
    const fetchMock = vi.fn(async () => {
      const body = bodies.shift()
      return body == null
        ? new Response(JSON.stringify({ status: 'completed', result: 'ok' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        : new Response(body, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      payingKit.waitForPaymentPayload('txid', { initialDelayMs: 0 })
    ).resolves.toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('keeps the HTTP status when the error response has an empty body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 }))
    )

    await expect(
      payingKit.waitForPaymentPayload('txid', { initialDelayMs: 0 })
    ).rejects.toThrow(/after 3 attempts: HTTP 404/)
  })
})

describe('PayingKit#verify', () => {
  it('returns false instead of throwing on a malformed signature', () => {
    const kit = new PayingKit()
    const message = new Uint8Array([1, 2, 3])
    expect(kit.verify(message, new Uint8Array(10))).toBe(false)
    expect(kit.verify(message, new Uint8Array(64))).toBe(false)
  })
})

describe('PayingKit#tryGetPayUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const paymentRequired: PaymentRequired = {
    x402Version: 2,
    error: 'PAYMENT-SIGNATURE header is required',
    resource: {
      url: 'https://api.example.com/premium-data',
      serviceName: 'Example Market Data',
      tags: ['market-data'],
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

  it('returns nothing when the response is not 402', async () => {
    const res = new Response('{}', { status: 200 })
    await expect(payingKit.tryGetPayUrl(res)).resolves.toEqual({
      payUrl: null,
      txid: null
    })
  })

  it('reads PaymentRequired from the PAYMENT-REQUIRED header', async () => {
    const res = new Response('{}', {
      status: 402,
      headers: {
        'PAYMENT-REQUIRED': stringToBase64(JSON.stringify(paymentRequired))
      }
    })

    const { payUrl, txid } = await payingKit.tryGetPayUrl(res)
    expect(payUrl).toContain('https://1pay.ing/sign?action=pay#msg=')
    expect(txid).toBeTruthy()
  })

  it('falls back to the body when the header cannot be decoded', async () => {
    const res = new Response(JSON.stringify(paymentRequired), {
      status: 402,
      headers: { 'PAYMENT-REQUIRED': 'not-base64-json!!' }
    })

    const { payUrl } = await payingKit.tryGetPayUrl(res)
    expect(payUrl).toContain('https://1pay.ing/sign?action=pay#msg=')
  })
})

describe('PayingKit#submitSettleResult', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const pending: SettleResponse = {
    success: false,
    errorReason: 'settlement_pending',
    transaction: '0xabc',
    network: 'eip155:8453'
  }

  it('does not record a non-terminal settlement_pending as failed', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(payingKit.submitSettleResult('txid', pending)).resolves.toBe(
      null
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('records a terminal failure', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const failed: SettleResponse = {
      ...pending,
      errorReason: 'insufficient_funds',
      transaction: ''
    }
    await expect(payingKit.submitSettleResult('txid', failed)).resolves.toEqual(
      failed
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      tx: '',
      status: 'failed'
    })
  })
})
