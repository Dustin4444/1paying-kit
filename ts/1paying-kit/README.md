# 1Paying Kit (TypeScript)

This is the TypeScript version of the client SDK for [1Pay.ing](https://1pay.ing), a decentralized payment protocol. It provides a simple and efficient way to integrate 1Pay.ing into your web applications, enabling you to request and verify payments with ease.

This library is designed to be lightweight and work in modern browser environments, using standard Web APIs like `fetch` and the Web Crypto API where possible.

## Features

- **Easy Integration**: A simple `PayingKit` class to handle payment flows.
- **Automatic x402 v1 & v2 Handling**: `tryGetPayUrl` method to automatically handle `402 Payment Required` responses.
- **Payment URL Generation**: Create payment URLs from server-provided requirements.
- **Payment Verification**: `waitForPaymentPayload` to poll for payment completion and retrieve the payload.
- **Full x402 v2 Type Surface**: Types mirroring [x402 Protocol Version 2](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md) — `PaymentRequired`, `PaymentPayload`, `SettleResponse`, `VerifyResponse`, payment flows, facilitator `/supported`, and the discovery API.
- **Lightweight**: Minimal dependencies, relying on `@noble/` for cryptography and `cborg` for CBOR encoding.

## Installation

You can install the package using npm or your favorite package manager:

```bash
npm install @ldclabs/1paying-kit
```

## Usage

Here's a basic example of how to use the `PayingKit` to handle a payment-required API response.

```typescript
import { payingKit } from '@ldclabs/1paying-kit'

async function fetchData() {
  let response = await fetch('https://api.example.com/premium-data')

  // Check if payment is required
  const { payUrl, txid } = await payingKit.tryGetPayUrl(response)
  if (payUrl) {
    // Payment is required, handle it with the kit
    console.log(`Please complete the payment at: ${payUrl}`)
    window.open(payUrl, '1Pay.ing') // Redirect user to sign the payment

    try {
      const payload = await payingKit.waitForPaymentPayload(txid, {
        onprogress: (state) => {
          console.log(
            `Payment status: ${state.status}, attempt: ${state.attempt}`
          )
        }
      })
      console.log('Payment successful! Received x402 PaymentPayload:', payload)

      // Now you can retry the original request with the payment payload
      // in 'PAYMENT-SIGNATURE' header.
      response = await fetch('https://api.example.com/premium-data', {
        headers: {
          'PAYMENT-SIGNATURE': payload
        }
      })
    } catch (error) {
      console.error('Payment failed or timed out:', error)
      throw error
    }
  }

  // Process the successful response
  const data = await response.json()
  console.log('Data received:', data)
}
```

## API Reference

### `PayingKit`

The main class for interacting with the 1Pay.ing service.

#### `payingKit`

An instance of the `PayingKit` class initialized with a new Ed25519 key pair.

#### `async tryGetPayUrl(res: Response): Promise<{ payUrl: string; txid: string } | { payUrl: null; txid: null }>`

Parses a `fetch` `Response`. If the status is `402`, it reads the payment requirements from the `PAYMENT-REQUIRED` header (falling back to the JSON body) and returns an object with the `payUrl` and `txid`. Otherwise it returns `{ payUrl: null, txid: null }`.

#### `async getPayUrl(requirements: PaymentRequirementsResponse): Promise<{ payUrl: string; txid: string }>`

Generates a payment URL and transaction ID from the payment requirements provided by the server.

#### `waitForPaymentPayload(txid: string, options?: PayingKitOptions): Promise<string>`

Polls the 1Pay.ing transaction service until the payment is completed.

- `txid`: The transaction ID from `getPayUrl` or `tryGetPayUrl`.
- `options`:
  - `timeoutMs` (optional): Timeout in milliseconds. Defaults to 3 minutes.
  - `initialDelayMs` (optional): Delay before the first poll. Defaults to 5 seconds.
  - `signal` (optional): An `AbortSignal` that cancels the wait, including the delays between polls.
  - `onprogress` (optional): A callback function `(state: TransactionState & { attempt: number }) => void` that receives polling status updates.

Returns a promise that resolves with the base64-encoded payment payload upon success or rejects on failure or timeout.

#### `getSettleResponse(input: SettleResponse | string | Headers): SettleResponse | null`

Extracts the `SettleResponse` from a `SettleResponse` object, a base64-encoded string, or a `Headers` instance (reading `PAYMENT-RESPONSE`, falling back to the x402 v1 `X-PAYMENT-RESPONSE`).

#### `async submitSettleResult(txid: string, input: SettleResponse | string | Headers): Promise<SettleResponse | null>`

Reports the settlement outcome back to 1Pay.ing. Returns the submitted response, or `null` when there was nothing to submit.

A `settlement_pending` response is deliberately **not** submitted: x402 v2 §9 defines it as non-terminal — the broadcast transaction may still confirm on chain — so recording it as `failed` would be wrong. Reconcile the transaction and call this again with the resolved response.

### x402 v2 Types and Helpers

`@ldclabs/1paying-kit/types` mirrors the [x402 v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md). Alongside `PaymentRequired`, `PaymentPayload`, `VerifyResponse`, `SettleResponse`, `SupportedResponse` and the discovery types, it exports:

#### Payment flows (§6.1)

`extra.paymentFlow` decides when settlement happens relative to the resource executing:

| Flow                      | Ordering                             |
| ------------------------- | ------------------------------------ |
| `authorization` (default) | verify → resource → settle → respond |
| `upfront`                 | settle → resource → respond          |
| `escrow`                  | settle → resource → settle → respond |

- `resolvePaymentFlow(req)`: the declared flow, defaulting to `authorization`.
- `isKnownPaymentFlow(flow)`: whether this kit understands the flow.
- `settlesBeforeResource(req)`: whether funds are committed before the resource runs.
- `selectPaymentRequirements(accepts)`: drops requirements whose flow this kit does not recognize and puts `authorization` first, as §6.1 tells clients to select.

#### Settlement state (§9)

- `isSettlementPending(res)`: whether a `SettleResponse` is the non-terminal `settlement_pending` state, i.e. broadcast (non-empty `transaction`) but unconfirmed.
- `ErrorReason`: the standard error codes.

#### Resource display fields (§5.1.2)

`ResourceInfo` carries `serviceName`, `tags` and `iconUrl` in addition to `url`, `description` and `mimeType`. These are attacker-controlled strings rendered on the signing page, so `toMessage` / `toMessageCompact` drop any that violate the spec's limits (printable ASCII, ≤32 chars for `serviceName` and each of at most 5 `tags`; an absolute `http`/`https` URL of ≤2048 chars for `iconUrl`). `sanitizeServiceName`, `sanitizeTags` and `sanitizeIconUrl` are exported to check values directly.

#### Header names

`PAYMENT_REQUIRED_HEADER`, `PAYMENT_SIGNATURE_HEADER`, `PAYMENT_RESPONSE_HEADER`, plus the x402 v1 `X_PAYMENT_HEADER` and `X_PAYMENT_RESPONSE_HEADER`.

### Gzip Utilities

The library also exports the underlying Gzip compression and decompression functions.

- `async gzipCompress(data: Uint8Array): Promise<Uint8Array>`
- `async gzipDecompress(data: Uint8Array): Promise<Uint8Array>`
- `async tryDecompress(data: Uint8Array): Promise<Uint8Array>`
- `isGzip(data: Uint8Array): boolean`

## Upgrading to 0.5.0

`Extensions` now matches x402 v2 §5.1.2: it is a **map keyed by extension identifier**, not a single `{ info, schema }` object. A `PaymentRequired` carrying extensions changes from

```typescript
extensions: { info: {...}, schema: {...} }
```

to

```typescript
extensions: { bazaar: { info: {...}, schema: {...} } }
```

The compact CBOR encoding under the `ex` key changes to match. `submitSettleResult` now returns `SettleResponse | null` instead of `void`; callers that ignore the result are unaffected.

## License

Copyright © 2025 [LDC Labs](https://github.com/ldclabs).

Licensed under the Apache License. See [LICENSE](LICENSE) for details.
