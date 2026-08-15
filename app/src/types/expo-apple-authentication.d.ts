export const AppleAuthenticationScope: {
  readonly FULL_NAME: string;
  readonly EMAIL: string;
};

export type AppleAuthenticationCredential = {
  identityToken?: string | null;
  fullName?: {
    givenName?: string | null;
    familyName?: string | null;
  } | null;
};

export function isAvailableAsync(): Promise<boolean>;
export function signInAsync(options?: { requestedScopes?: readonly string[] }): Promise<AppleAuthenticationCredential>;
