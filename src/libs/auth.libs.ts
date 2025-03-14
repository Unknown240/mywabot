import type { PrismaClient } from "@prisma/client"
import { BufferJSON, initAuthCreds, proto } from "@adiwajshing/baileys"
import type { AuthenticationCreds, SignalDataTypeMap } from "@adiwajshing/baileys"
import type { ArugaAuth } from "../types/auth.types"

export const useMultiAuthState = async (Database: PrismaClient): Promise<ArugaAuth> => {
  const fixFileName = (fileName: string): string => fileName.replace(/\//g, "__")?.replace(/:/g, "-")

  const writeData = async (data: unknown, fileName: string): Promise<void> => {
    try {
      const sessionId = fixFileName(fileName)
      const session = JSON.stringify(data, BufferJSON.replacer)
      await Database.session.upsert({
        where: {
          sessionId
        },
        update: {
          sessionId,
          session
        },
        create: {
          sessionId,
          session
        }
      })
    } catch {}
  }

  const readData = async (fileName: string): Promise<AuthenticationCreds | null> => {
    try {
      const sessionId = fixFileName(fileName)
      const data = await Database.session.findFirst({
        where: {
          sessionId
        }
      })
      return JSON.parse(data?.session, BufferJSON.reviver) as AuthenticationCreds
    } catch {
      return null
    }
  }

  const removeData = async (fileName: string): Promise<void> => {
    try {
      const sessionId = fixFileName(fileName)
      await Database.session.delete({
        where: {
          sessionId
        }
      })
    } catch {}
  }

  const creds: AuthenticationCreds = (await readData("creds")) || initAuthCreds()

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [_: string]: SignalDataTypeMap[typeof type] } = {}
          await Promise.all(
            ids.map(async id => {
              const value = await readData(`${type}-${id}`)
              type === "app-state-sync-key" && !!value ? (data[id] = proto.Message.AppStateSyncKeyData.fromObject(value)) : (data[id] = value)
            })
          )
          return data
        },
        set: async data => {
          const tasks: Promise<void>[] = []
          for (const category in data) {
            for (const id in data[category]) {
              const value: unknown = data[category][id]
              const file = `${category}-${id}`
              tasks.push(value ? writeData(value, file) : removeData(file))
            }
          }
          await Promise.all(tasks)
        }
      }
    },
    saveState: async (): Promise<void> => {
      await writeData(creds, "creds")
    },
    clearState: async (): Promise<void> => {
      await Database.session.deleteMany()
    }
  }
}

export const useSingleAuthState = async (Database: PrismaClient): Promise<ArugaAuth> => {
  const KEY_MAP: { [T in keyof SignalDataTypeMap]: string } = {
    "pre-key": "preKeys",
    session: "sessions",
    "sender-key": "senderKeys",
    "app-state-sync-key": "appStateSyncKeys",
    "app-state-sync-version": "appStateVersions",
    "sender-key-memory": "senderKeyMemory"
  }

  let creds: AuthenticationCreds
  let keys: unknown = {}

  const storedCreds = await Database.session.findFirst({
    where: {
      sessionId: "creds"
    }
  })
  if (storedCreds && storedCreds.session) {
    const parsedCreds = JSON.parse(storedCreds.session, BufferJSON.reviver)
    creds = parsedCreds.creds as AuthenticationCreds
    keys = parsedCreds.keys
  } else {
    if (!storedCreds)
      await Database.session.create({
        data: {
          sessionId: "creds"
        }
      })
    creds = initAuthCreds()
  }

  const saveState = async (): Promise<void> => {
    const session = JSON.stringify({ creds, keys }, BufferJSON.replacer)
    await Database.session.update({ where: { sessionId: "creds" }, data: { session } })
  }

  const clearState = async (): Promise<void> => {
    await Database.session.delete({
      where: { sessionId: "creds" }
    })
  }

  return {
    state: {
      creds,
      keys: {
        get: (type, ids) => {
          const key = KEY_MAP[type]
          return ids.reduce((dict: unknown, id) => {
            const value: unknown = keys[key]?.[id]
            if (value) {
              if (type === "app-state-sync-key") dict[id] = proto.Message.AppStateSyncKeyData.fromObject(value)
              dict[id] = value
            }
            return dict
          }, {})
        },
        set: data => {
          for (const _key in data) {
            const key = KEY_MAP[_key as keyof SignalDataTypeMap]
            keys[key] = keys[key] || {}
            Object.assign(keys[key], data[_key])
          }
          saveState()
        }
      }
    },
    saveState,
    clearState
  }
}
