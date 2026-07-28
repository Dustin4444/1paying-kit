import { bench, describe } from 'vitest'
import {
  toMessage,
  toMessageCompact,
  toPaymentRequirements,
  toPaymentRequirementsCompact,
  type Message,
  type MessageCompact,
  type PaymentRequirementsResponse,
  type PaymentRequirementsResponseCompactV1,
  type PaymentRequirementsV1
} from '../src/types.js'

const makeRequirement = (i: number): PaymentRequirementsV1 => ({
  scheme: 'exact',
  network: 'icp-druyg-tyaaa-aaaaq-aactq-cai',
  maxAmountRequired: String(1000 + i),
  asset: 'ryjl3-tyaaa-aaaaa-aaaba-cai',
  payTo: 'druyg-tyaaa-aaaaq-aactq-cai',
  resource: `https://api.1pay.ing/resource/${i}`,
  description: `Access to protected resource number ${i}`,
  mimeType: 'application/json',
  maxTimeoutSeconds: 180,
  extra: { note: 'benchmark payload', index: i }
})

const accepts = Array.from({ length: 8 }, (_, i) => makeRequirement(i))

const pubkey = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff)

const standardMessage: Message<PaymentRequirementsResponse> = {
  pubkey,
  nonce: 42,
  payload: {
    x402Version: 1,
    error: '',
    accepts
  }
}

const compactMessage = toMessageCompact(
  standardMessage
) as MessageCompact<PaymentRequirementsResponseCompactV1>

const singleRequirement = accepts[0] as PaymentRequirementsV1
const singleRequirementCompact = toPaymentRequirementsCompact(singleRequirement)

describe('message conversion', () => {
  bench('toMessageCompact (8 requirements)', () => {
    toMessageCompact(standardMessage)
  })

  bench('toMessage (8 requirements)', () => {
    toMessage(compactMessage)
  })
})

describe('payment requirements conversion', () => {
  bench('toPaymentRequirementsCompact', () => {
    toPaymentRequirementsCompact(singleRequirement)
  })

  bench('toPaymentRequirements', () => {
    toPaymentRequirements(singleRequirementCompact)
  })
})
