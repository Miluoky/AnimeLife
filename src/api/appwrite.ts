import { Account, Client } from 'appwrite'

// Проект Appwrite (регион Франкфурт). ID проекта не секретный, он и так виден в браузере.
export const APPWRITE_ENDPOINT =
  (import.meta.env.VITE_APPWRITE_ENDPOINT as string | undefined) ?? 'https://fra.cloud.appwrite.io/v1'
export const APPWRITE_PROJECT = (import.meta.env.VITE_APPWRITE_PROJECT as string | undefined) ?? '6abf65850016889f9b1b'

export const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT)
export const account = new Account(client)
