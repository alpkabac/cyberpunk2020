/**
 * CP2020 FNFF: after the first action on your part of the round, each successive action
 * takes a −3 penalty (core book — "More Than One Action").
 * We apply the penalty to rolled checks (attack, skill, etc.), not to every button click.
 */

export const CP2020_SUCCESSIVE_ACTION_PENALTY = -3;

/**
 * @param actionsThisTurn — Number of actions already completed this initiative turn (0 = none yet).
 */
export function multiActionRollPenalty(actionsThisTurn: number): number {
  return actionsThisTurn > 0 ? CP2020_SUCCESSIVE_ACTION_PENALTY : 0;
}
