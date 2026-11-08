import { describe, expect, it } from 'vitest'
import { MAX_RETRIES, backoffMs, createPacer, judgeResponse } from './retry'

describe('judgeResponse', () => {
  it('accepts 2xx images', () => {
    expect(judgeResponse(200, 'image/jpeg')).toEqual({ kind: 'ok' })
    expect(judgeResponse(200, 'image/png; charset=binary')).toEqual({ kind: 'ok' })
    expect(judgeResponse(200, 'IMAGE/WEBP')).toEqual({ kind: 'ok' })
  })

  it('rejects 2xx responses that are not images, without retrying', () => {
    const v = judgeResponse(200, 'text/html; charset=utf-8')
    expect(v.kind).toBe('fail')
    expect(judgeResponse(200, null).kind).toBe('fail')
  })

  it('skips 404 and 410', () => {
    expect(judgeResponse(404, 'text/html')).toEqual({ kind: 'not-found' })
    expect(judgeResponse(410, null)).toEqual({ kind: 'not-found' })
  })

  it('retries 5xx, 408 and 429', () => {
    for (const status of [500, 502, 503, 504, 408, 429]) {
      expect(judgeResponse(status, 'text/html').kind).toBe('retry')
    }
  })

  it('fails other 4xx straight away', () => {
    expect(judgeResponse(403, 'text/html').kind).toBe('fail')
    expect(judgeResponse(400, null).kind).toBe('fail')
  })
})

describe('backoffMs', () => {
  it('doubles from one second for each of the three retries', () => {
    expect(MAX_RETRIES).toBe(3)
    expect([1, 2, 3].map((n) => backoffMs(n))).toEqual([1000, 2000, 4000])
  })

  it('caps the delay', () => {
    expect(backoffMs(20)).toBeLessThanOrEqual(8000)
  })
})

describe('createPacer', () => {
  it('waits only the remainder of the interval since the last request', async () => {
    let clock = 0
    const waits: number[] = []
    const pace = createPacer(
      1000,
      () => clock,
      async (ms) => {
        waits.push(ms)
        clock += ms
      }
    )
    await pace() // first request: no wait
    clock += 300
    await pace() // 300 ms later: wait 700
    clock += 2500
    await pace() // long after: no wait
    expect(waits).toEqual([700])
  })
})
