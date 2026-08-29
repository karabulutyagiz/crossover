import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { APP_BUILD_NUMBER, fetchApi } from './config';

export type PlayerFeedbackCategory = 'suggestion' | 'bug' | 'gameplay' | 'purchase' | 'general' | 'sponsorship';

export async function submitPlayerFeedback(input: {
  category: PlayerFeedbackCategory;
  message: string;
  playerId?: string | null;
  context?: Record<string, unknown>;
}): Promise<void> {
  const message = input.message.trim();
  if (message.length < 4) throw new Error('empty');
  if (message.length > 1200) throw new Error('too-long');
  await fetchApi('/feedback', 8000, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      category: input.category,
      message,
      appVersion: Constants.expoConfig?.version ?? null,
      buildNumber: APP_BUILD_NUMBER,
      platform: Platform.OS,
      osVersion: Device.osVersion ?? null,
      deviceModel: Device.modelName ?? null,
      playerId: input.playerId ?? null,
      context: input.context ?? {},
      timestamp: new Date().toISOString(),
    }),
  });
}
