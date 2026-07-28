import { bench, describe } from 'vitest'
import { gzipCompress, gzipDecompress, isGzip } from '../src/gzip.js'

const encoder = new TextEncoder()

const makeRepeatingData = (length: number): Uint8Array => {
  const data = new Uint8Array(length)
  const pattern = encoder.encode('ABCD1Pay.ing')
  for (let i = 0; i < length; i += 1) {
    data[i] = pattern[i % pattern.length] as number
  }
  return data
}

const smallInput = makeRepeatingData(256)
const largeInput = makeRepeatingData(64 * 1024)

const smallCompressed = await gzipCompress(smallInput)
const largeCompressed = await gzipCompress(largeInput)

describe('gzip compression', () => {
  bench('gzipCompress (256 B)', async () => {
    await gzipCompress(smallInput)
  })

  bench('gzipCompress (64 KiB)', async () => {
    await gzipCompress(largeInput)
  })
})

describe('gzip decompression', () => {
  bench('gzipDecompress (256 B)', async () => {
    await gzipDecompress(smallCompressed)
  })

  bench('gzipDecompress (64 KiB)', async () => {
    await gzipDecompress(largeCompressed)
  })

  bench('isGzip', () => {
    isGzip(largeCompressed)
  })
})
