
import bs58 from "bs58"
import crypto from 'crypto'

export const getRandomUser: () => { id: string, password: string } = () => {
  return {
    id: bs58.encode(crypto.randomBytes(8)).slice(5),
    password: crypto.randomBytes(24).toString('hex')
  }
}