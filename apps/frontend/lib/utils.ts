import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const apiRoutes = {
  auth: {
    login: "/api/auth/login",
    signup: "/api/auth/signup",
    refresh: "/api/auth/refresh"
  },
  organizations: {
    list: "/api/organizations"
  }
};
