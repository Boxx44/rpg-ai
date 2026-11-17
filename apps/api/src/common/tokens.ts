export const LOGGER = Symbol('LOGGER');
export const DB = Symbol('DB');
export const REDIS = Symbol('REDIS');

export interface AuthUser {
  id: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthUser;
    }
  }
}
