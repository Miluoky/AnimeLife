import { Account, Client, Functions, TablesDB } from 'appwrite'
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT } from './config'

// Клиенты Appwrite. Файл тянет весь SDK, поэтому его импортируют только страницы и модули,
// которые грузятся отдельно (аккаунт, отзывы, пуши), а из основной сборки — через import().
export * from './config'
export { ID } from 'appwrite'
export const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT)
export const account = new Account(client)
export const functions = new Functions(client)
export const tablesDB = new TablesDB(client)
