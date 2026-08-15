export type GoogleAuthRequest = Record<string, unknown>;
export type GoogleAuthResponse =
  | { type: 'success'; params?: { id_token?: string }; authentication?: { idToken?: string | null } | null }
  | { type: string; params?: Record<string, string>; authentication?: { idToken?: string | null } | null }
  | null;

export function useIdTokenAuthRequest(config: {
  iosClientId?: string;
  androidClientId?: string;
  webClientId?: string;
}): [GoogleAuthRequest | null, GoogleAuthResponse, () => Promise<unknown>];
