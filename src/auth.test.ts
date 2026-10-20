import { describe, expect, it } from 'vitest'
import { createAdminAccess, isValidAdminPin, verifyAdminPin } from './auth'

describe('local admin access', () => {
  it('only accepts a six to twelve digit PIN', () => {
    expect(isValidAdminPin('123456')).toBe(true)
    expect(isValidAdminPin('12345')).toBe(false)
    expect(isValidAdminPin('1234567890123')).toBe(false)
    expect(isValidAdminPin('abcdef')).toBe(false)
  })

  it('verifies a PIN without storing it in the credential record', async () => {
    const access = await createAdminAccess('123456')

    expect(access.pinHash).not.toContain('123456')
    await expect(verifyAdminPin('123456', access)).resolves.toBe(true)
    await expect(verifyAdminPin('654321', access)).resolves.toBe(false)
  })
})
