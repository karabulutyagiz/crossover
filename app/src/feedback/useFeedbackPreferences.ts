import { useEffect, useState } from 'react';
import { getFeedbackPreferences, loadFeedbackPreferences, setFeedbackPreference, subscribeFeedbackPreferences, type FeedbackPreferences } from './preferences';

export function useFeedbackPreferences() {
  const [prefs, setPrefs] = useState<FeedbackPreferences>(getFeedbackPreferences());
  useEffect(() => {
    loadFeedbackPreferences().catch(() => {});
    return subscribeFeedbackPreferences(setPrefs);
  }, []);
  return { prefs, setPreference: setFeedbackPreference };
}
