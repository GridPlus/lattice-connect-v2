import { Request, Response } from 'express';
import { IAdminClient, createClient } from '../clients/createClient';
import { getRandomUser } from '../core/utils';

// Configuration for retries
const MAX_RETRY_LIMIT = 5;

/**
 * Generate a valid user that doesn't already exist
 * @param client The admin client
 * @param userGenerator Function to generate random user credentials
 * @param retryCount Current retry count
 * @returns Promise with user credentials
 */
const generateNextValidUser = async (
  client: IAdminClient,
  userGenerator: () => { id: string; password: string },
  retryCount = 0
): Promise<{ id: string; password: string }> => {
  const user = userGenerator();

  try {
    // Check if the user already exists
    // We expect a 404 if the user doesn't exist
    await client.get({ api: `users/${user.id}` }).ok((res: any) => res.status == 404);

    return user;
  } catch (error: any) {
    // If status is 200, user already exists
    if (error.status == 200) {
      if (retryCount >= MAX_RETRY_LIMIT) {
        throw {
          status: 500,
          message: 'Unable to provision new user. Retry limit exceeded.',
        };
      }

      // Try again with a new user
      return generateNextValidUser(client, userGenerator, retryCount + 1);
    }

    throw error;
  }
};

/**
 * Create a new user with appropriate permissions
 */
export const createNewUser = async (req: Request, res: Response) => {
  try {
    // Create admin client
    const { client } = await createClient({
      url: new URL(`${process.env.ADMIN_CLIENT_HOST}`),
      username: process.env.ADMIN_CLIENT_USER || '',
      password: process.env.ADMIN_CLIENT_PASS || '',
    });

    // Generate a valid user
    const user = await generateNextValidUser(client, getRandomUser);

    // Create the user in the system
    await client
      .put({
        api: `users/${user.id}`,
        payload: {
          password: user.password,
          tags: 'lattice',
        },
      })
      .then((_res: any) =>
        // Set user permissions
        client.put({
          api: `permissions/%2F/${user.id}`,
          payload: {
            configure: '.*',
            write: '.*',
            read: '.*',
          },
        })
      )
      .then((_res: any) =>
        // Set topic permissions
        client.put({
          api: `topic-permissions/%2F/${user.id}`,
          payload: {
            exchange: 'amq.topic',
            write: '.*',
            read: 'to_agent.{username}.*|lattice.*',
          },
        })
      );

    // Return the user credentials
    res.json({
      user: user.id,
      password: user.password,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).send(error);
  }
};
