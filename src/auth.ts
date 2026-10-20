import type { AdminAccess } from './types'

const encoder = new TextEncoder()
const pinPattern = /^\d{6,12}$/

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

const digest = async (pin: string, salt: string) => {
  const value = await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}:${pin}`))
  return hex(new Uint8Array(value))
}

const secureEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false
  return Array.from(left).reduce((difference, character, index) => difference | (character.charCodeAt(0) ^ right.charCodeAt(index)), 0) === 0
}

export const isValidAdminPin = (pin: string) => pinPattern.test(pin)

export const createAdminAccess = async (pin: string): Promise<AdminAccess> => {
  if (!isValidAdminPin(pin)) throw new Error('PIN harus terdiri dari 6 sampai 12 angka.')
  const saltBytes = crypto.getRandomValues(new Uint8Array(16))
  const pinSalt = hex(saltBytes)
  return { pinSalt, pinHash: await digest(pin, pinSalt) }
}

export const verifyAdminPin = async (pin: string, access: AdminAccess) => {
  if (!isValidAdminPin(pin) || !access.pinSalt || !access.pinHash) return false
  return secureEqual(await digest(pin, access.pinSalt), access.pinHash)
}
