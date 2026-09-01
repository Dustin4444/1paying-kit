/**
 * Types mirroring the x402 protocol specification.
 *
 * Core protocol: `specs/x402-specification-v2.md` (Protocol Version 2).
 * HTTP transport: `specs/transports-v2/http.md`.
 *
 * The `*V1` / `*CompactV1` variants keep the legacy x402 v1 shapes alive so
 * that a resource server that has not migrated yet still works.
 */

/** The x402 protocol version implemented by this kit. */
export const X402_VERSION = 2

/**
 * HTTP transport header names (`specs/transports-v2/http.md`, Header Summary).
 * The `X_*` names are the x402 v1 equivalents, still accepted on read.
 */
export const PAYMENT_REQUIRED_HEADER = 'PAYMENT-REQUIRED'
export const PAYMENT_SIGNATURE_HEADER = 'PAYMENT-SIGNATURE'
export const PAYMENT_RESPONSE_HEADER = 'PAYMENT-RESPONSE'
export const X_PAYMENT_HEADER = 'X-PAYMENT'
export const X_PAYMENT_RESPONSE_HEADER = 'X-PAYMENT-RESPONSE'

/**
 * Represents the state of a 1Pay.ing payment transaction.
 */
export interface TransactionState {
  /** The status of the transaction. */
  status: 'pending' | 'accepted' | 'completed' | 'error'
  /** Details about an error if the transaction failed. */
  error?: { code: number; message: string; data?: unknown }
  /** The result of the transaction, typically a PaymentPayload encoded as a base64 string. */
  result?: string
}

/**
 * Represents a generic message structure.
 * @template T The type of the payload, typically a PaymentRequired
 */
export interface Message<T> {
  /** The public key of the sender, 32 bytes ed25519. */
  pubkey: Uint8Array // 32 bytes ed25519 pubkey
  /** A number used once to prevent replay attacks. */
  nonce: number
  /** The payload of the message. */
  payload: T
}

/**
 * Represents a compact version of a generic message structure.
 * @template TC The type of the compact payload.
 */
export interface MessageCompact<TC> {
  /** The public key of the sender. */
  pk: Uint8Array // pubkey
  /** A number used once to prevent replay attacks. */
  n: number // nonce
  /** The compact payload of the message, typically a PaymentRequiredCompact */
  p: TC // payload
}

/**
 * Converts a compact or standard message into a standard `Message`.
 * @param msg The message to convert.
 * @returns The standard message.
 */
export function toMessage(
  msg:
    | MessageCompact<PaymentRequirementsResponseCompactV1>
    | Message<PaymentRequirementsResponse>
    | MessageCompact<PaymentRequiredCompact>
    | Message<PaymentRequired>
): Message<PaymentRequirementsResponse | PaymentRequired> {
  if ('pubkey' in msg && 'nonce' in msg && 'payload' in msg) {
    return msg
  }

  if (!Array.isArray(msg.p?.a)) {
    throw new Error('Invalid message: "p.a" (accepts) must be an array')
  }

  // Absent optional fields are omitted rather than set to `undefined`, which
  // cborg would otherwise encode as an explicit CBOR `undefined` (0xf7).
  const payload = {
    x402Version: msg.p.x,
    accepts: msg.p.a.map(toPaymentRequirements) as PaymentRequirementsV1[]
  } as PaymentRequirementsResponse

  if (msg.p.e != null) {
    payload.error = msg.p.e
  }

  const rt: Message<PaymentRequirementsResponse> = {
    pubkey: msg.pk,
    nonce: msg.n,
    payload
  }

  if ('r' in msg.p) {
    const required = rt.payload as any as PaymentRequired
    const resource: ResourceInfo = { url: msg.p.r.u }
    if (msg.p.r.d != null) {
      resource.description = msg.p.r.d
    }
    if (msg.p.r.m != null) {
      resource.mimeType = msg.p.r.m
    }
    // Display fields are attacker-controlled and rendered on the signing page,
    // so anything violating the spec's limits is dropped rather than forwarded.
    const serviceName = sanitizeServiceName(msg.p.r.sn)
    if (serviceName != null) {
      resource.serviceName = serviceName
    }
    const tags = sanitizeTags(msg.p.r.t)
    if (tags != null) {
      resource.tags = tags
    }
    const iconUrl = sanitizeIconUrl(msg.p.r.iu)
    if (iconUrl != null) {
      resource.iconUrl = iconUrl
    }
    required.resource = resource

    if (msg.p.ex) {
      required.extensions = toExtensions(msg.p.ex)
    }
  }

  return rt
}

/**
 * Converts a standard or compact message into a compact `MessageCompact`.
 * @param msg The message to convert.
 * @returns The compact message.
 */
export function toMessageCompact(
  msg:
    | MessageCompact<PaymentRequiredCompact>
    | Message<PaymentRequired>
    | MessageCompact<PaymentRequirementsResponseCompactV1>
    | Message<PaymentRequirementsResponse>
): MessageCompact<
  PaymentRequiredCompact | PaymentRequirementsResponseCompactV1
> {
  if ('pk' in msg && 'n' in msg && 'p' in msg) {
    return msg
  }

  if (!Array.isArray(msg.payload?.accepts)) {
    throw new Error('Invalid message: "payload.accepts" must be an array')
  }

  // Absent optional fields are omitted rather than set to `undefined`, which
  // cborg would otherwise encode as an explicit CBOR `undefined` (0xf7).
  const p = {
    x: msg.payload.x402Version,
    a: msg.payload.accepts.map(
      toPaymentRequirementsCompact
    ) as PaymentRequirementsCompactV1[]
  } as PaymentRequirementsResponseCompactV1

  if (msg.payload.error != null) {
    p.e = msg.payload.error
  }

  const rt: MessageCompact<PaymentRequirementsResponseCompactV1> = {
    pk: msg.pubkey,
    n: msg.nonce,
    p
  }

  if ('resource' in msg.payload) {
    const compact = rt.p as any as PaymentRequiredCompact
    const resource = msg.payload.resource!
    const r: ResourceInfoCompact = { u: resource.url }
    if (resource.description != null) {
      r.d = resource.description
    }
    if (resource.mimeType != null) {
      r.m = resource.mimeType
    }
    // See the matching note in `toMessage`.
    const serviceName = sanitizeServiceName(resource.serviceName)
    if (serviceName != null) {
      r.sn = serviceName
    }
    const tags = sanitizeTags(resource.tags)
    if (tags != null) {
      r.t = tags
    }
    const iconUrl = sanitizeIconUrl(resource.iconUrl)
    if (iconUrl != null) {
      r.iu = iconUrl
    }
    compact.r = r

    if (msg.payload.extensions) {
      compact.ex = toExtensionsCompact(msg.payload.extensions)
    }
  }

  return rt
}

/**
 * Payment scheme identifier. The protocol is extensible, so any string is
 * accepted; the listed values are the schemes specified under `specs/schemes/`.
 */
export type PaymentScheme =
  | 'exact'
  | 'upto'
  | 'batch-settlement'
  | 'auth-capture'
  | (string & {})

/**
 * Payment flow model, i.e. when settlement occurs relative to resource
 * execution (x402 v2 §6.1).
 *
 * - `authorization` (default): verify -> resource -> settle -> respond
 * - `upfront`: settle -> resource -> respond
 * - `escrow`: settle -> resource -> settle -> respond
 */
export type PaymentFlow = 'authorization' | 'upfront' | 'escrow'

/** Every payment flow this kit understands, in x402 v2 §6.1 order. */
export const PAYMENT_FLOWS: readonly PaymentFlow[] = [
  'authorization',
  'upfront',
  'escrow'
]

/** The flow used when `extra.paymentFlow` is omitted (x402 v2 §6.1). */
export const DEFAULT_PAYMENT_FLOW: PaymentFlow = 'authorization'

/**
 * Additional information carried by `PaymentRequirements.extra`.
 *
 * `assetTransferMethod` and `paymentFlow` are protocol-reserved keys (x402 v2
 * §6.1) and must be interpreted as specified rather than as opaque
 * scheme-private fields. All other keys are scheme-specific.
 */
export interface PaymentRequirementsExtra {
  /**
   * How value is authorized or moved for this mechanism, e.g. `eip3009` or
   * `permit2` on EVM `exact`. Allowed values are mechanism-defined.
   */
  assetTransferMethod?: string
  /** When settlement occurs relative to resource execution. */
  paymentFlow?: PaymentFlow
  [key: string]: unknown
}

/**
 * The x402 requirements for a payment.
 */
export interface PaymentRequirements {
  /** Payment scheme identifier (e.g., "exact"). */
  scheme: PaymentScheme
  /** Network identifier in CAIP-2 format (e.g., "eip155:8453"). */
  network: string
  /** Required payment amount in atomic token units. */
  amount: string
  /** Token contract address, or an ISO 4217 currency code for fiat. */
  asset: string
  /** Recipient wallet address, or a role constant (e.g., "merchant"). */
  payTo: string
  /** Maximum time allowed for payment completion in seconds. */
  maxTimeoutSeconds: number
  /** Reserved protocol keys plus scheme-specific additional information. */
  extra?: PaymentRequirementsExtra
}

/**
 * Represents a compact version of `PaymentRequirements`.
 */
export interface PaymentRequirementsCompact {
  /** Payment scheme identifier. */
  s: PaymentScheme // scheme
  /** Network identifier in CAIP-2 format. */
  n: string // network
  /** Required payment amount in atomic token units. */
  am: string // amount
  /** Token contract address or ISO 4217 currency code. */
  a: string // asset
  /** Recipient wallet address for the payment. */
  p: string // payTo
  /** Maximum time allowed for payment completion in seconds. */
  mts: number // maxTimeoutSeconds
  /** Reserved protocol keys plus scheme-specific additional information. */
  ex?: PaymentRequirementsExtra // extra
}

/**
 * Resolves the payment flow of a requirement, applying the x402 v2 §6.1
 * default when `extra.paymentFlow` is omitted.
 * @param req The payment requirement to inspect.
 * @returns The declared flow, or `authorization` when unspecified.
 */
export function resolvePaymentFlow(
  req: PaymentRequirements | PaymentRequirementsV1
): PaymentFlow {
  const flow = (req.extra as PaymentRequirementsExtra | undefined)?.paymentFlow
  return flow == null ? DEFAULT_PAYMENT_FLOW : flow
}

/**
 * Reports whether a payment flow is one this kit understands. Clients must not
 * construct a payment for a flow they do not recognize (x402 v2 §6.1).
 * @param flow The flow to check.
 */
export function isKnownPaymentFlow(flow: unknown): flow is PaymentFlow {
  return PAYMENT_FLOWS.includes(flow as PaymentFlow)
}

/**
 * Reports whether funds are committed before the resource runs, which is true
 * for the `upfront` and `escrow` flows (x402 v2 §6.1).
 * @param req The payment requirement to inspect.
 */
export function settlesBeforeResource(
  req: PaymentRequirements | PaymentRequirementsV1
): boolean {
  return resolvePaymentFlow(req) !== 'authorization'
}

/**
 * Orders `accepts` the way x402 v2 §6.1 tells clients to select: requirements
 * whose flow this kit does not recognize are dropped, and `authorization`
 * (settlement after the resource runs) is preferred over the pre-handler
 * settlement flows.
 * @param accepts The requirements offered by the resource server.
 * @returns The selectable requirements, most preferred first.
 */
export function selectPaymentRequirements<
  T extends PaymentRequirements | PaymentRequirementsV1
>(accepts: readonly T[]): T[] {
  return accepts
    .filter((req) => {
      const flow = (req.extra as PaymentRequirementsExtra | undefined)
        ?.paymentFlow
      return flow == null || isKnownPaymentFlow(flow)
    })
    .sort(
      (a, b) =>
        Number(settlesBeforeResource(a)) - Number(settlesBeforeResource(b))
    )
}

/** Maximum length of `ResourceInfo.serviceName`, in characters. */
export const MAX_SERVICE_NAME_LENGTH = 32
/** Maximum number of `ResourceInfo.tags` entries. */
export const MAX_TAGS = 5
/** Maximum length of a single `ResourceInfo.tags` entry, in characters. */
export const MAX_TAG_LENGTH = 32
/** Maximum length of `ResourceInfo.iconUrl`, in characters. */
export const MAX_ICON_URL_LENGTH = 2048

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/

/**
 * Reports whether a value is a non-empty printable-ASCII string within
 * `maxLength` characters, the constraint the spec puts on service names and
 * tags.
 * @param value The value to check.
 * @param maxLength The inclusive maximum length.
 */
export function isPrintableAscii(value: unknown, maxLength: number): boolean {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    PRINTABLE_ASCII.test(value)
  )
}

/**
 * Returns `serviceName` when it satisfies the spec constraints (printable
 * ASCII, at most 32 characters), otherwise `undefined`.
 * @param value The candidate service name.
 */
export function sanitizeServiceName(value: unknown): string | undefined {
  return isPrintableAscii(value, MAX_SERVICE_NAME_LENGTH)
    ? (value as string)
    : undefined
}

/**
 * Returns the tags that satisfy the spec constraints (at most 5 entries, each
 * printable ASCII and at most 32 characters), or `undefined` when none do.
 * @param value The candidate tags.
 */
export function sanitizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const tags = value
    .filter((tag) => isPrintableAscii(tag, MAX_TAG_LENGTH))
    .slice(0, MAX_TAGS) as string[]
  return tags.length > 0 ? tags : undefined
}

/**
 * Returns `iconUrl` when it is an absolute `http`/`https` URL of at most 2048
 * characters, otherwise `undefined`.
 * @param value The candidate icon URL.
 */
export function sanitizeIconUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > MAX_ICON_URL_LENGTH) {
    return undefined
  }

  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:' ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Describes the protected resource (x402 v2 §5.1.2).
 */
export interface ResourceInfo {
  /** The protected resource, e.g., URL of the resource endpoint. */
  url: string
  /** Human-readable description of the resource. */
  description?: string
  /** MIME type of the expected response. */
  mimeType?: string
  /** Name of the service hosting the resource. Printable ASCII, max 32 chars. */
  serviceName?: string
  /** Topical tags used for discovery filtering. Max 5, each max 32 chars. */
  tags?: string[]
  /** Absolute `http`/`https` icon URL for the service. Max 2048 chars. */
  iconUrl?: string
}

/**
 * Represents a compact version of `ResourceInfo`.
 */
export interface ResourceInfoCompact {
  u: string // url
  d?: string // description
  m?: string // mimeType
  sn?: string // serviceName
  t?: string[] // tags
  iu?: string // iconUrl
}

/**
 * A single protocol extension entry (x402 v2 §5.1.2).
 */
export interface Extension {
  /** Extension-specific data provided by the server. */
  info: Record<string, unknown>
  /** JSON Schema defining the expected structure of `info`. */
  schema: Record<string, unknown>
}

/**
 * Protocol extensions, keyed by extension identifier (e.g., `bazaar`).
 *
 * Servers advertise supported extensions in `PaymentRequired` and clients echo
 * them in `PaymentPayload`. A client must include at least the info it
 * received; it may append more but must not delete or overwrite existing info.
 */
export type Extensions = Record<string, Extension>

/**
 * Represents a compact version of `Extension`.
 */
export interface ExtensionCompact {
  i: Record<string, unknown> // info
  s: Record<string, unknown> // schema
}

/**
 * Represents a compact version of `Extensions`.
 */
export type ExtensionsCompact = Record<string, ExtensionCompact>

/**
 * Converts compact extensions into the standard `Extensions` map.
 * @param ex The compact extensions.
 * @returns The standard extensions map.
 */
export function toExtensions(ex: ExtensionsCompact): Extensions {
  const rt: Extensions = {}
  for (const [name, value] of Object.entries(ex)) {
    rt[name] = { info: value.i, schema: value.s }
  }
  return rt
}

/**
 * Converts standard extensions into the compact `ExtensionsCompact` map.
 * @param extensions The standard extensions map.
 * @returns The compact extensions.
 */
export function toExtensionsCompact(extensions: Extensions): ExtensionsCompact {
  const rt: ExtensionsCompact = {}
  for (const [name, value] of Object.entries(extensions)) {
    rt[name] = { i: value.info, s: value.schema }
  }
  return rt
}

/**
 * The x402 v1 requirements for a payment.
 */
export interface PaymentRequirementsV1 {
  /** Payment scheme identifier (e.g., "exact"). */
  scheme: PaymentScheme
  /** Blockchain network identifier (e.g., "base-sepolia"). */
  network: string
  /** Required payment amount in atomic token units. */
  maxAmountRequired: string
  /** Token ledger canister address. */
  asset: string
  /** Recipient wallet address for the payment. */
  payTo: string
  /** The protected resource, e.g., URL of the resource endpoint. */
  resource: string
  /** Human-readable description of the resource. */
  description: string
  /** MIME type of the expected response. */
  mimeType?: string
  /** JSON schema describing the response format. */
  outputSchema?: object
  /** Maximum time allowed for payment completion in seconds. */
  maxTimeoutSeconds: number
  /** Scheme-specific additional information. */
  extra?: object
}

/**
 * Represents a compact version of `PaymentRequirementsV1`.
 */
export interface PaymentRequirementsCompactV1 {
  /** Payment scheme identifier. */
  s: PaymentScheme // scheme
  /** Blockchain network identifier. */
  n: string // network
  /** Required payment amount in atomic token units. */
  mar: string // maxAmountRequired
  /** Token ledger canister address. */
  a: string // asset
  /** Recipient wallet address for the payment. */
  p: string // payTo
  /** The protected resource. */
  r: string // resource
  /** Human-readable description of the resource. */
  d: string // description
  /** MIME type of the expected response. */
  mt?: string // mimeType
  /** JSON schema describing the response format. */
  os?: object // outputSchema
  /** Maximum time allowed for payment completion in seconds. */
  mts: number // maxTimeoutSeconds
  /** Scheme-specific additional information. */
  ex?: object // extra
}

/**
 * Converts a compact or standard payment requirement into a standard `PaymentRequirements`.
 * @param req The payment requirement to convert.
 * @returns The standard `PaymentRequirements` object.
 */
export function toPaymentRequirements(
  req:
    | PaymentRequirementsCompact
    | PaymentRequirements
    | PaymentRequirementsCompactV1
    | PaymentRequirementsV1
): PaymentRequirements | PaymentRequirementsV1 {
  if ('scheme' in req) {
    return req
  }

  if ('mar' in req) {
    const obj: PaymentRequirementsV1 = {
      scheme: req.s,
      network: req.n,
      maxAmountRequired: req.mar,
      asset: req.a,
      payTo: req.p,
      resource: req.r,
      description: req.d,
      maxTimeoutSeconds: req.mts
    }
    if (req.mt) {
      obj.mimeType = req.mt
    }
    if (req.os) {
      obj.outputSchema = req.os
    }
    if (req.ex) {
      obj.extra = req.ex
    }
    return obj
  }

  const obj: PaymentRequirements = {
    scheme: req.s,
    network: req.n,
    amount: req.am,
    asset: req.a,
    payTo: req.p,
    maxTimeoutSeconds: req.mts
  }
  if (req.ex) {
    obj.extra = req.ex
  }
  return obj
}

/**
 * Converts a standard or compact payment requirement into a compact `PaymentRequirementsCompact`.
 * @param req The payment requirement to convert.
 * @returns The compact `PaymentRequirementsCompact` object.
 */
export function toPaymentRequirementsCompact(
  req:
    | PaymentRequirementsCompact
    | PaymentRequirements
    | PaymentRequirementsCompactV1
    | PaymentRequirementsV1
): PaymentRequirementsCompact | PaymentRequirementsCompactV1 {
  if ('s' in req) {
    return req
  }

  if ('maxAmountRequired' in req) {
    const obj: PaymentRequirementsCompactV1 = {
      s: req.scheme,
      n: req.network,
      mar: req.maxAmountRequired,
      a: req.asset,
      p: req.payTo,
      r: req.resource,
      d: req.description,
      mts: req.maxTimeoutSeconds
    }
    if (req.mimeType) {
      obj.mt = req.mimeType
    }
    if (req.outputSchema) {
      obj.os = req.outputSchema
    }
    if (req.extra) {
      obj.ex = req.extra
    }
    return obj
  }

  const obj: PaymentRequirementsCompact = {
    s: req.scheme,
    n: req.network,
    am: req.amount,
    a: req.asset,
    p: req.payTo,
    mts: req.maxTimeoutSeconds
  }
  if (req.extra) {
    obj.ex = req.extra
  }
  return obj
}

/**
 * The payment required signal sent by a resource server (x402 v2 §5.1).
 */
export interface PaymentRequired {
  /** The version of the x402 protocol. Must be 2. */
  x402Version: number
  /** Human-readable message explaining why payment is required. */
  error?: string
  /** Information about the protected resource. */
  resource: ResourceInfo
  /** A list of accepted payment requirements. */
  accepts: PaymentRequirements[]
  /** Protocol extensions data, keyed by extension identifier. */
  extensions?: Extensions
}

/**
 * Represents a compact version of `PaymentRequired`.
 */
export interface PaymentRequiredCompact {
  x: number // x402Version
  e?: string // error
  a: PaymentRequirementsCompact[] // accepts
  r: ResourceInfoCompact // resource
  ex?: ExtensionsCompact // extensions
}

/**
 * Represents the x402 v1 response containing payment requirements.
 */
export interface PaymentRequirementsResponse {
  /** The version of the x402 protocol. */
  x402Version: number
  /** An error message if the request failed. */
  error: string
  /** A list of accepted payment requirements. */
  accepts: PaymentRequirementsV1[]
}

/**
 * Represents a compact version of `PaymentRequirementsResponse`.
 */
export interface PaymentRequirementsResponseCompactV1 {
  x: number // x402Version
  e: string // error
  a: PaymentRequirementsCompactV1[] // accepts
}

/**
 * Represents an x402 v1 payment payload.
 * @template T The type of the scheme-specific payload.
 */
export interface PaymentPayloadV1<T> {
  /** The version of the x402 protocol. */
  x402Version: number
  /** The payment scheme identifier. */
  scheme: string
  /** The blockchain network identifier. */
  network: string
  /** The scheme-specific payload. */
  payload: T
}

/**
 * The payment authorization sent by a client (x402 v2 §5.2).
 * @template T The type of the scheme-specific payload.
 */
export interface PaymentPayload<T> {
  /** The version of the x402 protocol. */
  x402Version: number
  /** Information about the protected resource. */
  resource?: ResourceInfo
  /** PaymentRequirements object indicating the payment method chosen. */
  accepted: PaymentRequirements
  /** The scheme-specific payload. */
  payload: T
  /** Protocol extensions data, echoing at least what the server advertised. */
  extensions?: Extensions
}

/**
 * The EIP-3009 authorization carried by the `exact` EVM scheme (x402 v2 §5.2.2).
 */
export interface Authorization {
  /** Payer's wallet address. */
  from: string
  /** Recipient's wallet address. */
  to: string
  /** Payment amount in atomic units. */
  value: string
  /** Unix timestamp when the authorization becomes valid. */
  validAfter: string
  /** Unix timestamp when the authorization expires. */
  validBefore: string
  /** 32-byte random nonce to prevent replay attacks. */
  nonce: string
}

/**
 * The `payload` of an `exact` EVM `PaymentPayload` (x402 v2 §5.2.2).
 */
export interface ExactEvmPayload {
  /** EIP-712 signature for the authorization. */
  signature: string
  /** EIP-3009 authorization parameters. */
  authorization: Authorization
}

/** Represents the verification and settlement request structure for X402 payments.
 * @template T The type of the payment payload.
 */
export interface X402Request<T> {
  /** The version of the x402 protocol. */
  x402Version?: number
  paymentPayload: PaymentPayload<T> | PaymentPayloadV1<T>
  paymentRequirements: PaymentRequirements | PaymentRequirementsV1
}

/**
 * Standard error codes returned by facilitators or resource servers
 * (x402 v2 §9). The protocol is extensible, so any string is accepted.
 */
export type ErrorReason =
  | 'insufficient_funds'
  | 'invalid_exact_evm_payload_authorization_valid_after'
  | 'invalid_exact_evm_payload_authorization_valid_before'
  | 'invalid_exact_evm_payload_authorization_value_mismatch'
  | 'invalid_exact_evm_payload_signature'
  | 'invalid_exact_evm_payload_recipient_mismatch'
  | 'invalid_network'
  | 'invalid_payload'
  | 'invalid_payment_requirements'
  | 'invalid_scheme'
  | 'unsupported_scheme'
  | 'invalid_x402_version'
  | 'invalid_transaction_state'
  | 'unexpected_verify_error'
  | 'unexpected_settle_error'
  | 'settlement_pending'
  | (string & {})

/**
 * The settlement transaction was broadcast but its confirmation could not be
 * established. This code is **non-terminal**: the transaction may still confirm
 * on chain, so callers must reconcile before treating the payment as failed.
 */
export const SETTLEMENT_PENDING = 'settlement_pending'

/**
 * Represents the response for verifying a payment (x402 v2 §5.4).
 */
export interface VerifyResponse {
  /** Indicates whether the payment is valid. */
  isValid: boolean
  /** The reason why the payment is invalid, if applicable. */
  invalidReason?: ErrorReason
  /** The address of the payer. */
  payer?: string
  /** Protocol extensions data. */
  extensions?: Extensions
  /** Scheme-specific additional data. */
  extra?: Record<string, unknown>
}

/**
 * Represents the response for settling a payment (x402 v2 §5.3).
 */
export interface SettleResponse {
  /** Indicates whether the settlement was successful. */
  success: boolean
  /** The reason why the settlement failed, if applicable. */
  errorReason?: ErrorReason
  /**
   * The blockchain transaction hash. Empty when no transaction was broadcast;
   * non-empty when `errorReason` is `settlement_pending`.
   */
  transaction: string
  /** The network identifier in CAIP-2 format. */
  network: string
  /** The address of the payer. */
  payer?: string
  /** The actual amount settled in atomic units. */
  amount?: string
  /** Protocol extensions data. */
  extensions?: Extensions
}

/**
 * Reports whether a settle response is the non-terminal `settlement_pending`
 * state (x402 v2 §9), i.e. the transaction was broadcast but not confirmed.
 * Such a payment must not be recorded as failed until it is reconciled on chain.
 * @param res The settle response to inspect.
 */
export function isSettlementPending(res: SettleResponse): boolean {
  return (
    !res.success && res.errorReason === SETTLEMENT_PENDING && !!res.transaction
  )
}

/**
 * A payment kind supported by a facilitator (x402 v2 §7.3.1).
 */
export interface SupportedKind {
  /** Protocol version supported (2 for v2). */
  x402Version: number
  /** Payment scheme identifier (e.g., "exact"). */
  scheme: PaymentScheme
  /** Network identifier in CAIP-2 format. */
  network: string
  /** Additional scheme-specific configuration. */
  extra?: Record<string, unknown>
}

/**
 * The response of a facilitator's `GET /supported` endpoint (x402 v2 §7.3).
 */
export interface SupportedResponse {
  /** Supported payment kinds. */
  kinds: SupportedKind[]
  /** Extension identifiers the facilitator has implemented. */
  extensions: string[]
  /** Map of CAIP-2 patterns (e.g., `eip155:*`) to public signer addresses. */
  signers: Record<string, string[]>
}

/**
 * A resource listed by the discovery API (x402 v2 §8.3).
 */
export interface DiscoveredResource {
  /** The resource URL or identifier being monetized. */
  resource: string
  /** Resource type (currently "http" for HTTP endpoints). */
  type: string
  /** Protocol version supported by the resource. */
  x402Version: number
  /** Payment methods the resource accepts. */
  accepts: PaymentRequirements[]
  /** ISO 8601 timestamp of when the resource was last updated. */
  lastUpdated: string
  /** Additional extension payloads associated with this resource. */
  extensions?: Extensions
}

/**
 * Pagination metadata returned by the discovery API (x402 v2 §8.1).
 */
export interface DiscoveryPagination {
  limit: number
  offset: number
  total: number
}

/**
 * The response of `GET /discovery/resources` (x402 v2 §8.1).
 */
export interface DiscoveryResourcesResponse {
  x402Version: number
  items: DiscoveredResource[]
  pagination: DiscoveryPagination
}

/**
 * Query parameters accepted by `GET /discovery/resources` (x402 v2 §8.1).
 */
export interface DiscoveryResourcesQuery {
  type?: string
  payTo?: string
  scheme?: PaymentScheme
  network?: string
  extensions?: string
  limit?: number
  offset?: number
}

/**
 * Represents the result of updating a payment transaction status.
 */
export type UpdatePaymentTxStatus = {
  tx: string
  status: 'finalized' | 'failed'
}
