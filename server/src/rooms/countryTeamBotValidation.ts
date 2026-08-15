import { validateCountryTeamPlayerId, verifyCountryTeamGuess } from '../game/verify.ts';
import { log } from '../logger.ts';

export type CountryTeamBotValidationAction = 'SUBMIT' | 'REJECTED' | 'NO_ANSWER';

export interface CountryTeamBotValidationInput {
  countryId: string | null;
  clubId: number | null;
  candidatePlayerId: number | null;
  candidateText: string | null;
}

export interface CountryTeamBotValidationResult {
  action: CountryTeamBotValidationAction;
  finalValid: boolean;
  submitText: string | null;
}

export async function validateCountryTeamBotCandidate(input: CountryTeamBotValidationInput): Promise<CountryTeamBotValidationResult> {
  const { countryId, clubId, candidatePlayerId, candidateText } = input;
  if (!countryId || !clubId || !candidatePlayerId || !candidateText) {
    log.warn('country_team_bot_no_valid_answer', {
      countryId,
      clubId,
      candidatePlayerId,
      finalValid: false,
      action: 'NO_ANSWER',
    });
    return { action: 'NO_ANSWER', finalValid: false, submitText: null };
  }

  const idCheck = await validateCountryTeamPlayerId(clubId, countryId, candidatePlayerId);
  if (!idCheck.valid || !idCheck.player) {
    log.warn('country_team_bot_final_validation_failed', {
      countryId,
      clubId,
      candidatePlayerId,
      countryValid: false,
      clubValid: false,
      finalValid: false,
      action: 'REJECTED',
    });
    return { action: 'REJECTED', finalValid: false, submitText: null };
  }

  const typed = await verifyCountryTeamGuess(clubId, countryId, candidateText);
  if (typed.correct && typed.matchedPlayer?.id === candidatePlayerId) {
    return { action: 'SUBMIT', finalValid: true, submitText: candidateText };
  }

  const canonicalText = idCheck.player.canonicalName;
  const canonical = await verifyCountryTeamGuess(clubId, countryId, canonicalText);
  if (canonical.correct && canonical.matchedPlayer?.id === candidatePlayerId) {
    return { action: 'SUBMIT', finalValid: true, submitText: canonicalText };
  }

  log.warn('country_team_bot_final_validation_failed', {
    countryId,
    clubId,
    candidatePlayerId,
    candidateName: canonicalText,
    typedText: candidateText,
    finalValid: false,
    action: 'REJECTED',
  });
  return { action: 'REJECTED', finalValid: false, submitText: null };
}
