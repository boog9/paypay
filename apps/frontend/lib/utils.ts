import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getBffApiBaseUrl } from './bff';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const apiBaseUrl = getBffApiBaseUrl().replace(/\/$/, '');

export const apiRoutes = {
  auth: {
    login: `${apiBaseUrl}/auth/login`,
    signup: `${apiBaseUrl}/auth/signup`,
    refresh: `${apiBaseUrl}/auth/refresh`
  },
  organizations: {
    list: `${apiBaseUrl}/organizations`
  }
};
