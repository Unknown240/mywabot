import type { User } from "@prisma/client"
import NodeCache from "node-cache"
import Database from "../../../libs/database.libs"
import config from "../../config.utils"

const user = new NodeCache({
  stdTTL: 60 * 10, // 10 mins
  useClones: false
})

export const getUser = async (userId: string) => {
  try {
    if (user.has(userId)) return user.get(userId) as User

    const userData = await Database.user.findUnique({
      where: { userId }
    })

    if (userData) user.set(userId, userData)

    return userData
  } catch {
    return null
  }
}

export const createUser = async (userId: string, metadata: Partial<Omit<User, "id" | "userId">>) => {
  try {
    if (user.has(userId)) return user.get(userId) as User

    const userData = await Database.user.create({
      data: {
        userId,
        name: metadata?.name || "",
        language: config.language,
        limit: config.user.limit || 30,
        ban: metadata?.ban || false
      }
    })

    if (userData) user.set(userId, userData)

    return userData
  } catch {
    return null
  }
}

export const updateUser = async (userId: string, userInput: Partial<Omit<User, "id" | "userId">>) => {
  try {
    const userData = await Database.user.update({
      where: { userId },
      data: { ...userInput }
    })

    if (userData) user.set(userId, userData)

    return userData
  } catch {
    return null
  }
}
