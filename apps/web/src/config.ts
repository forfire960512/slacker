const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? "http://localhost:8080";

export const AUTH_URL = `${SERVER_URL}/auth/login`;
export const WS_URL = `${SERVER_URL.replace(/^http/, "ws")}/ws`;
