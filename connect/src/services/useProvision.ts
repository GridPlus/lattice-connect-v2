import { Request, Response } from "express";
import { IAppService } from "../core"
import { IAdminClient, createClient } from "../clients/createClient"
import { getRandomUser } from "../core/utils"

export async function useProvision(service: IAppService) {
  const retry = {
    count: 0,
    limit: 5
  }

  const generateNextValidUser = async (client: IAdminClient, userGenerator: () => {
    id: string;
    password: string;
  }): Promise<{ id: string, password: string }> => {
    return new Promise(async (res, rej) => {
      const user = userGenerator()
      await client
        .get({ api: `users/${user.id}` })
        .ok((res: any) => res.status == 404)
        .catch((error: any) => {
          if (error.status == 200) {
            // We've hit our "retry.limit". The chances of this
            // happening are **infinitesimally** small.
            //-------------------------------------------------
            if (retry.count >= retry.limit) {
              retry.count = 0
              return rej({
                status: 500,
                message: "Unable to provision new user. Retry limit exceeded."
              })
            }

            // Keep retrying (up to "retry.limit" times)...
            //----------------------------------------------
            retry.count += 1
            return res(
              generateNextValidUser(client, userGenerator)
            )
          }
          rej(error)
        })
      res(user)
    })
  }

  return await createClient({
    url: new URL(`${process.env.ADMIN_CLIENT_HOST}`),
    username: process.env.ADMIN_CLIENT_USER,
    password: process.env.ADMIN_CLIENT_PASS
  })
    .then(({ client }) => {
      service.app.get("/provision", async (req: Request, res: Response) => {
        await generateNextValidUser(client, getRandomUser)
          .then(async user => {
            await client.put({
              api: `users/${user.id}`,
              payload: {
                password: user.password,
                tags: 'lattice'
              }
            }).then((_res: any) => client.put({
              api: `permissions/%2F/${user.id}`,
              payload: {
                configure: '.*',
                write: '.*',
                read: '.*'
              }
            })).then((_res: any) => client.put({
              api: `topic-permissions/%2F/${user.id}`,
              payload: {
                exchange: 'amq.topic',
                write: '.*',
                read: 'to_agent.{username}.*|lattice.*'
              }
            }))
            res.json({
              user: user.id,
              password: user.password
            })
          })
          .catch(error => {
            console.error(error)
            res.status(500).send(error)
          })
      })
    })
}
