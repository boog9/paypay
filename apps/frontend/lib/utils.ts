import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getApiBasePath } from './bff';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const apiBasePath = getApiBasePath();

export const apiRoutes = {
  auth: {
    login: `${apiBasePath}/auth/login`,
    signup: `${apiBasePath}/auth/signup`,
    refresh: `${apiBasePath}/auth/refresh`
  },
  organizations: {
    list: `${apiBasePath}/organizations`
  }
};
