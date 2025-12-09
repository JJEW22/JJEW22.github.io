#!/usr/bin/env python3
"""
Calculate win probabilities for March Madness bracket competition.

This script simulates all possible outcomes for remaining games and calculates
the probability of each participant winning the competition.

Uses JSON bracket files instead of Excel.
Supports merging similar winning outcomes and showing top N most probable scenarios.
"""

import json
import os
import argparse
import random
from typing import Dict, List, Optional, Set, Tuple

# Constants (matching bracketStructure.js)
SCORE_FOR_ROUND = [0, 10, 20, 30, 50, 80, 130]
SEED_FACTOR = [0, 1, 2, 3, 4, 5, 6]

# Round keys in order
ROUND_KEYS = ['round1', 'round2', 'round3', 'round4', 'round5', 'round6']

# Progress reporting interval (print progress every N simulations)
PROGRESS_INTERVAL = 1000

# Default number of top winning scenarios to keep per participant
DEFAULT_MAX_WINNING_SCENARIOS = 10


def american_odds_to_probability(odds: float, remove_vig: bool = False) -> float:
    """
    Convert American betting odds to implied probability.
    
    American odds work differently for favorites and underdogs:
    - Negative odds (favorites): The number is how much you bet to win $100
    - Positive odds (underdogs): The number is how much you win on a $100 bet
    
    Args:
        odds: American odds value (e.g., -150, +200)
        remove_vig: If True, this is just one side and vig removal should be done
                    separately by normalizing all probabilities to sum to 1
    
    Returns:
        Implied probability as a decimal (0.0 to 1.0)
    
    Examples:
        -150 -> 0.60 (60% implied probability)
        +200 -> 0.333 (33.3% implied probability)
        -110 -> 0.524 (52.4% implied probability)
        +100 -> 0.50 (50% implied probability)
    """
    if odds < 0:
        # Favorite: probability = |odds| / (|odds| + 100)
        return abs(odds) / (abs(odds) + 100)
    else:
        # Underdog: probability = 100 / (odds + 100)
        return 100 / (odds + 100)


def normalize_probabilities(probs: dict) -> dict:
    """
    Normalize probabilities to sum to 1.0 (removes the vig/juice).
    
    Sportsbooks build in a margin, so raw implied probabilities sum to > 100%.
    This function normalizes them to get "true" probabilities.
    
    Args:
        probs: Dict mapping team/outcome name to implied probability
        
    Returns:
        Dict with normalized probabilities summing to 1.0
    """
    total = sum(probs.values())
    if total == 0:
        return probs
    return {k: v / total for k, v in probs.items()}


def load_bracket(filepath: str) -> dict:
    """Load a bracket from a JSON file."""
    with open(filepath, 'r') as f:
        return json.load(f)


# Probability column names for each round
# These represent probability of reaching/winning that round
PROB_COLUMNS = ['prob_r32', 'prob_r16', 'prob_r8', 'prob_r4', 'prob_r2', 'prob_win']

# Expected sum for each probability column (how many teams reach that round)
EXPECTED_SUMS = {
    'prob_r32': 32.0,   # 32 teams reach round of 32
    'prob_r16': 16.0,   # 16 teams reach round of 16 (sweet 16)
    'prob_r8': 8.0,     # 8 teams reach elite 8
    'prob_r4': 4.0,     # 4 teams reach final 4
    'prob_r2': 2.0,     # 2 teams reach championship
    'prob_win': 1.0     # 1 winner
}

# Floating point tolerance for validation
PROB_TOLERANCE = 0.001


def validate_team_probabilities(teams: Dict[str, dict], results_bracket: dict = None) -> List[str]:
    """
    Validate team probability data.
    
    Checks:
    1. No probability is negative or greater than 1
    2. Sum of probabilities for each round equals expected value
    3. For decided games, winner has prob ~1 and loser has prob ~0 for next round
    4. Probabilities are monotonically decreasing (prob_r32 >= prob_r16 >= ... >= prob_win)
    
    Args:
        teams: Dict mapping team name to team data (including probabilities)
        results_bracket: Optional results bracket to check decided games
        
    Returns:
        List of warning/error messages (empty if all valid)
    """
    errors = []
    
    # Check if probability columns exist
    sample_team = next(iter(teams.values())) if teams else {}
    has_probs = any(col in sample_team for col in PROB_COLUMNS)
    
    if not has_probs:
        return []  # No probability columns, skip validation
    
    # Check 1: No value < 0 or > 1
    for team_name, team_data in teams.items():
        for col in PROB_COLUMNS:
            if col in team_data:
                prob = team_data[col]
                if prob < 0:
                    errors.append(f"Negative probability for {team_name}.{col}: {prob}")
                if prob > 1 + PROB_TOLERANCE:
                    errors.append(f"Probability > 1 for {team_name}.{col}: {prob}")
    
    # Check 2: Sums equal expected values
    for col in PROB_COLUMNS:
        total = sum(team_data.get(col, 0) for team_data in teams.values())
        expected = EXPECTED_SUMS[col]
        if abs(total - expected) > PROB_TOLERANCE:
            errors.append(f"Sum of {col} is {total:.4f}, expected {expected:.4f}")
    
    # Check 3: Decided games have correct probabilities
    if results_bracket:
        for round_idx, round_key in enumerate(ROUND_KEYS):
            if round_key not in results_bracket:
                continue
            
            # The probability column for "reaching the next round"
            # round1 winners reach round2, which is prob_r32
            # round2 winners reach round3, which is prob_r16
            # etc.
            if round_idx >= len(PROB_COLUMNS):
                continue
            prob_col = PROB_COLUMNS[round_idx]
            
            for game in results_bracket[round_key]:
                if not game:
                    continue
                winner_name = get_winner_name(game)
                if not winner_name:
                    continue  # Game not decided
                
                # Get both teams
                team1_name = get_team_name(game.get('team1'))
                team2_name = get_team_name(game.get('team2'))
                
                if not team1_name or not team2_name:
                    continue
                
                loser_name = team2_name if winner_name == team1_name else team1_name
                
                # Check winner has prob ~1 and loser has prob ~0 for this round
                if winner_name in teams:
                    winner_prob = teams[winner_name].get(prob_col, 0)
                    if winner_prob < 1 - PROB_TOLERANCE:
                        errors.append(
                            f"Decided game: {winner_name} won in {round_key} but {prob_col}={winner_prob:.4f} (expected ~1.0)"
                        )
                
                if loser_name in teams:
                    loser_prob = teams[loser_name].get(prob_col, 0)
                    if loser_prob > PROB_TOLERANCE:
                        errors.append(
                            f"Decided game: {loser_name} lost in {round_key} but {prob_col}={loser_prob:.4f} (expected ~0.0)"
                        )
    
    # Check 4: Probabilities should be monotonically decreasing for each team
    # prob_r32 >= prob_r16 >= prob_r8 >= prob_r4 >= prob_r2 >= prob_win
    for team_name, team_data in teams.items():
        prev_prob = None
        prev_col = None
        for col in PROB_COLUMNS:
            if col in team_data:
                prob = team_data[col]
                if prev_prob is not None and prob > prev_prob + PROB_TOLERANCE:
                    errors.append(
                        f"Non-monotonic probability for {team_name}: {prev_col}={prev_prob:.4f} < {col}={prob:.4f}"
                    )
                prev_prob = prob
                prev_col = col
    
    return errors


def load_teams(filepath: str, results_bracket: dict = None, validate: bool = True) -> Dict[str, dict]:
    """
    Load teams from a JSON or CSV file and return a dict mapping name to team data.
    
    For CSV files, also loads probability columns (prob_r32, prob_r16, prob_r8, prob_r4, prob_r2, prob_win)
    if present.
    
    Args:
        filepath: Path to teams file (JSON or CSV)
        results_bracket: Optional results bracket for validation of decided games
        validate: Whether to validate probability data
        
    Returns:
        Dict mapping team name to team data
    """
    teams = {}
    
    if filepath.endswith('.json'):
        with open(filepath, 'r') as f:
            team_list = json.load(f)
            for team in team_list:
                teams[team['name']] = team
    elif filepath.endswith('.csv'):
        import csv
        with open(filepath, 'r', encoding='utf-8-sig') as f:  # utf-8-sig handles BOM automatically
            reader = csv.DictReader(f)
            
            # Debug: print column names found
            print(f"CSV columns found: {reader.fieldnames}")
            
            for row in reader:
                # Handle various column name possibilities
                name = row.get('TEAM') or row.get('\ufeffTEAM') or row.get('Team') or row.get('name')
                
                # Skip empty rows or rows without a team name
                if not name or not name.strip():
                    continue
                
                name = name.strip()  # Remove any whitespace
                
                seed_str = row.get('SEED') or row.get('Seed') or row.get('seed', '0')
                seed = int(seed_str) if seed_str and seed_str.strip() else 0
                region = row.get('Region') or row.get('region', '')
                
                team_data = {'name': name, 'seed': seed, 'region': region}
                
                # Load probability columns if present
                for col in PROB_COLUMNS:
                    if col in row and row[col]:
                        try:
                            team_data[col] = float(row[col])
                        except ValueError:
                            pass  # Skip invalid values
                
                teams[name] = team_data
    
    # Validate probabilities
    if validate and teams:
        errors = validate_team_probabilities(teams, results_bracket)
        if errors:
            print("\nProbability validation warnings:")
            for error in errors:
                print(f"  - {error}")
            print()
    
    return teams


def get_winner_name(game: dict) -> Optional[str]:
    """Get the winner's name from a game, handling different data formats."""
    if not game or not game.get('winner'):
        return None
    winner = game['winner']
    if isinstance(winner, dict):
        return winner.get('name')
    return winner


def get_team_name(team) -> Optional[str]:
    """Get team name from team data, handling different formats."""
    if not team:
        return None
    if isinstance(team, dict):
        return team.get('name')
    return team


def get_team_seed(team, teams_data: dict) -> int:
    """Get seed for a team."""
    if not team:
        return 0
    
    name = get_team_name(team)
    if name and name in teams_data:
        return teams_data[name].get('seed', 0)
    
    if isinstance(team, dict):
        return team.get('seed', 0)
    
    return 0


# Track which teams we've warned about missing probability data
_warned_missing_prob_teams = set()


def get_team_probability(team_name: str, prob_column: str, teams_data: dict) -> float:
    """
    Get a team's probability for reaching a specific round.
    
    Args:
        team_name: Name of the team
        prob_column: Column name (e.g., 'prob_r32', 'prob_r16', etc.)
        teams_data: Dict mapping team name to team data
        
    Returns:
        Probability value, or default (1/2)^R if not available
    """
    global _warned_missing_prob_teams
    
    # Map prob_column to number of rounds needed from R64
    rounds_needed = {
        'prob_r32': 1,
        'prob_r16': 2,
        'prob_r8': 3,
        'prob_r4': 4,
        'prob_r2': 5,
        'prob_win': 6
    }
    
    # Check if team exists and has probability data
    if team_name in teams_data:
        team_data = teams_data[team_name]
        if prob_column in team_data:
            return team_data[prob_column]
    
    # Default: (1/2)^R
    r = rounds_needed.get(prob_column, 1)
    default_prob = (0.5) ** r
    
    # Warn once per team
    warn_key = (team_name, prob_column)
    if warn_key not in _warned_missing_prob_teams:
        _warned_missing_prob_teams.add(warn_key)
        print(f"  Warning: No {prob_column} data for '{team_name}', using default {default_prob:.6f}")
    
    return default_prob


def calculate_outcome_probability(hypothetical_bracket: dict, teams_data: dict) -> float:
    """
    Calculate the probability of a specific bracket outcome.
    
    The probability is computed as:
    P(bracket) = P_win(winner) × P_r2(finalist) × ∏P_r4(F4 losers) × ∏P_r8(E8 losers) × ...
    
    For each round, we multiply by the probability of teams that "exit" at that round
    (i.e., reached that round but went no further).
    
    Args:
        hypothetical_bracket: A completed bracket with all winners determined
        teams_data: Dict mapping team name to team data with probabilities
        
    Returns:
        Probability of this specific outcome
    """
    probability = 1.0
    
    # The winner (exits at championship with a win)
    winner_name = get_team_name(hypothetical_bracket.get('winner'))
    if winner_name:
        prob = get_team_probability(winner_name, 'prob_win', teams_data)
        probability *= prob
    
    # Championship loser (reached championship but didn't win) - use prob_r2
    final_game = hypothetical_bracket.get('round6', [{}])[0]
    if final_game:
        final_winner = get_team_name(final_game.get('winner'))
        team1 = get_team_name(final_game.get('team1'))
        team2 = get_team_name(final_game.get('team2'))
        finalist_loser = team2 if final_winner == team1 else team1
        if finalist_loser:
            prob = get_team_probability(finalist_loser, 'prob_r2', teams_data)
            probability *= prob
    
    # Final Four losers (reached F4 but not championship) - use prob_r4
    # Round 5 has 2 games, losers are F4 exits
    for game in hypothetical_bracket.get('round5', []):
        if not game:
            continue
        winner = get_team_name(game.get('winner'))
        team1 = get_team_name(game.get('team1'))
        team2 = get_team_name(game.get('team2'))
        loser = team2 if winner == team1 else team1
        if loser:
            prob = get_team_probability(loser, 'prob_r4', teams_data)
            probability *= prob
    
    # Elite 8 losers (reached E8 but not F4) - use prob_r8
    # Round 4 has 4 games
    for game in hypothetical_bracket.get('round4', []):
        if not game:
            continue
        winner = get_team_name(game.get('winner'))
        team1 = get_team_name(game.get('team1'))
        team2 = get_team_name(game.get('team2'))
        loser = team2 if winner == team1 else team1
        if loser:
            prob = get_team_probability(loser, 'prob_r8', teams_data)
            probability *= prob
    
    # Sweet 16 losers (reached S16 but not E8) - use prob_r16
    # Round 3 has 8 games
    for game in hypothetical_bracket.get('round3', []):
        if not game:
            continue
        winner = get_team_name(game.get('winner'))
        team1 = get_team_name(game.get('team1'))
        team2 = get_team_name(game.get('team2'))
        loser = team2 if winner == team1 else team1
        if loser:
            prob = get_team_probability(loser, 'prob_r16', teams_data)
            probability *= prob
    
    # Round of 32 losers (reached R32 but not S16) - use prob_r32
    # Round 2 has 16 games
    for game in hypothetical_bracket.get('round2', []):
        if not game:
            continue
        winner = get_team_name(game.get('winner'))
        team1 = get_team_name(game.get('team1'))
        team2 = get_team_name(game.get('team2'))
        loser = team2 if winner == team1 else team1
        if loser:
            prob = get_team_probability(loser, 'prob_r32', teams_data)
            probability *= prob
    
    # Round of 64 losers don't contribute (they didn't "reach" any tracked round)
    # Their elimination is implicit in the probabilities of teams that did advance
    
    return probability


def compute_score(results_bracket: dict, picks_bracket: dict, teams_data: dict,
                  apply_seed_bonus: bool = True) -> Tuple[int, int, int]:
    """
    Compute score for a bracket against results.
    Returns (total_score, correct_picks, seed_bonus)
    """
    total_score = 0
    correct_picks = 0
    seed_bonus = 0
    
    for round_num, round_key in enumerate(ROUND_KEYS, start=1):
        results_round = results_bracket.get(round_key, [])
        picks_round = picks_bracket.get(round_key, [])
        
        if not results_round or not picks_round:
            continue
        
        for i, result_game in enumerate(results_round):
            if i >= len(picks_round):
                continue
            
            pick_game = picks_round[i]
            
            if not result_game or not pick_game:
                continue
            
            result_winner = get_winner_name(result_game)
            pick_winner = get_winner_name(pick_game)
            
            if not result_winner or not pick_winner:
                continue
            
            # Check if pick matches result
            if result_winner == pick_winner:
                points = SCORE_FOR_ROUND[round_num]
                total_score += points
                correct_picks += 1
                
                # Apply upset bonus
                if apply_seed_bonus:
                    team1_seed = get_team_seed(result_game.get('team1'), teams_data)
                    team2_seed = get_team_seed(result_game.get('team2'), teams_data)
                    winner_seed = get_team_seed(result_game.get('winner'), teams_data)
                    
                    if team1_seed and team2_seed and winner_seed:
                        expected_winner_seed = min(team1_seed, team2_seed)
                        if winner_seed > expected_winner_seed:
                            upset_bonus = (winner_seed - expected_winner_seed) * SEED_FACTOR[round_num]
                            total_score += upset_bonus
                            seed_bonus += upset_bonus
    
    return total_score, correct_picks, seed_bonus


def find_remaining_games(results_bracket: dict) -> List[Tuple[str, int]]:
    """
    Find all games that haven't been decided yet (including future rounds).
    Returns list of (round_key, game_index) tuples in round order.
    """
    remaining = []
    
    for round_key in ROUND_KEYS:
        results_round = results_bracket.get(round_key, [])
        
        for i, game in enumerate(results_round):
            if game and not get_winner_name(game):
                # Game exists but no winner yet - include it regardless of whether teams are determined
                remaining.append((round_key, i))
    
    return remaining


def get_feeder_games(round_key: str, game_index: int) -> Optional[Tuple[str, int, int]]:
    """
    Get the two feeder games that feed into this game.
    Returns (prev_round_key, feeder_game_1_index, feeder_game_2_index) or None for round 1.
    """
    round_num = ROUND_KEYS.index(round_key) + 1
    
    if round_num == 1:
        return None  # Round 1 has no feeder games
    
    prev_round_key = ROUND_KEYS[round_num - 2]  # Previous round
    feeder_1 = game_index * 2
    feeder_2 = game_index * 2 + 1
    
    return (prev_round_key, feeder_1, feeder_2)


def get_parent_game_info(round_key: str, game_index: int) -> Optional[Tuple[str, int, int]]:
    """
    Get the parent game that this game feeds into.
    Returns (parent_round_key, parent_game_index, slot) where slot is 0 for team1, 1 for team2.
    """
    round_num = ROUND_KEYS.index(round_key) + 1
    
    if round_num >= 6:  # Championship has no parent
        return None
    
    parent_round_key = ROUND_KEYS[round_num]  # Next round
    parent_game_index = game_index // 2
    slot = game_index % 2  # 0 = team1, 1 = team2
    
    return (parent_round_key, parent_game_index, slot)


def create_hypothetical_bracket(results_bracket: dict, remaining_games: List[Tuple[str, int]], 
                                 outcome_string: str) -> dict:
    """
    Create a hypothetical completed bracket by simulating game outcomes.
    outcome_string: binary string where '1' means team1 wins, '0' means team2 wins.
    
    Games are processed in round order, so earlier round results propagate to later rounds.
    """
    import copy
    hypothetical = copy.deepcopy(results_bracket)
    
    for i, (round_key, game_index) in enumerate(remaining_games):
        game = hypothetical[round_key][game_index]
        
        # Get the teams - they should be populated from previous rounds by now
        team1 = game.get('team1')
        team2 = game.get('team2')
        
        # Skip if teams aren't determined yet (shouldn't happen if processed in order)
        if not team1 or not team2:
            continue
        
        # Determine winner based on outcome string
        if outcome_string[i] == '1':
            winner = team1
        else:
            winner = team2
        
        game['winner'] = winner
        
        # Propagate winner to next round's game
        parent_info = get_parent_game_info(round_key, game_index)
        if parent_info:
            parent_round, parent_index, slot = parent_info
            
            # Make sure parent round exists
            if parent_round not in hypothetical:
                continue
            if parent_index >= len(hypothetical[parent_round]):
                continue
                
            parent_game = hypothetical[parent_round][parent_index]
            
            if slot == 0:
                parent_game['team1'] = winner
            else:
                parent_game['team2'] = winner
    
    # Set overall winner
    final_game = hypothetical.get('round6', [{}])[0]
    hypothetical['winner'] = final_game.get('winner')
    
    return hypothetical


def generate_random_outcome(num_games: int) -> str:
    """Generate a random outcome string."""
    return ''.join(str(random.randint(0, 1)) for _ in range(num_games))


def decode_outcome_to_games(results_bracket: dict, remaining_games: List[Tuple[str, int]], 
                            outcome_string: str) -> List[dict]:
    """
    Decode an outcome string into a list of game results.
    Returns list of dicts with round, game index, and winner info.
    """
    import copy
    hypothetical = copy.deepcopy(results_bracket)
    game_results = []
    
    for i, (round_key, game_index) in enumerate(remaining_games):
        game = hypothetical[round_key][game_index]
        
        team1 = game.get('team1')
        team2 = game.get('team2')
        
        if not team1 or not team2:
            continue
        
        if outcome_string[i] == '1':
            winner = team1
            loser = team2
        else:
            winner = team2
            loser = team1
        
        game['winner'] = winner
        
        # Record this game result
        round_num = ROUND_KEYS.index(round_key) + 1
        game_results.append({
            'round': round_num,
            'roundKey': round_key,
            'gameIndex': game_index,
            'team1': get_team_name(team1),
            'team2': get_team_name(team2),
            'winner': get_team_name(winner),
            'loser': get_team_name(loser),
            'team1Seed': team1.get('seed') if team1 else None,
            'team2Seed': team2.get('seed') if team2 else None,
            'winnerSeed': winner.get('seed') if winner else None
        })
        
        # Propagate winner to next round
        parent_info = get_parent_game_info(round_key, game_index)
        if parent_info:
            parent_round, parent_index, slot = parent_info
            
            if parent_round in hypothetical and parent_index < len(hypothetical[parent_round]):
                parent_game = hypothetical[parent_round][parent_index]
                if slot == 0:
                    parent_game['team1'] = winner
                else:
                    parent_game['team2'] = winner
    
    return game_results


def can_merge_outcomes(outcome1: str, outcome2: str) -> Optional[int]:
    """
    Check if two outcome strings can be merged (differ by exactly 1 position).
    Returns the differing position index if mergeable, None otherwise.
    Both outcomes can contain 'X' for "either" positions.
    """
    if len(outcome1) != len(outcome2):
        return None
    
    diff_positions = []
    for i, (c1, c2) in enumerate(zip(outcome1, outcome2)):
        if c1 != c2:
            # Can only merge if both are concrete values (0 or 1), not X
            if c1 == 'X' or c2 == 'X':
                return None
            diff_positions.append(i)
            if len(diff_positions) > 1:
                return None  # Early exit if more than 1 difference
    
    if len(diff_positions) == 1:
        return diff_positions[0]
    return None


def merge_two_outcomes(outcome1: str, outcome2: str, diff_pos: int) -> str:
    """
    Merge two outcomes that differ at exactly one position.
    Returns new outcome with 'X' at the differing position.
    """
    result = list(outcome1)
    result[diff_pos] = 'X'
    return ''.join(result)


def get_merge_key(outcome: str, pos: int) -> str:
    """
    Get a key for grouping outcomes that could potentially merge at position pos.
    Returns the outcome with position pos replaced with 'X'.
    """
    result = list(outcome)
    result[pos] = 'X'
    return ''.join(result)


import heapq

class MergeCandidateTracker:
    """
    Efficiently tracks merge candidates using incremental group maintenance.
    
    Maintains:
    - groups[pos][key] = set of outcomes that share this merge key at position pos
    - A max-heap of merge candidates (negative prob for max-heap behavior)
    - probabilities[outcome] = probability of each outcome
    """
    
    def __init__(self, outcomes_with_probs: Dict[str, float]):
        self.probabilities = dict(outcomes_with_probs)
        self.num_positions = len(next(iter(outcomes_with_probs))) if outcomes_with_probs else 0
        
        # groups[pos][key] = set of outcomes with that merge key at position pos
        self.groups: List[Dict[str, set]] = [{} for _ in range(self.num_positions)]
        
        # Priority queue: (-combined_prob, outcome1, outcome2, position)
        # Using negative prob because heapq is a min-heap
        self.heap = []
        
        # Track valid candidates (some in heap may be stale)
        self.valid_outcomes = set(outcomes_with_probs.keys())
        
        # Build initial groups
        self._build_initial_groups()
    
    def _build_initial_groups(self):
        """Build initial groups for all positions. O(N * L)"""
        for outcome in self.probabilities:
            self._add_outcome_to_groups(outcome)
        
        # Find all initial merge candidates
        self._find_all_merge_candidates()
    
    def _add_outcome_to_groups(self, outcome: str):
        """Add an outcome to all relevant position groups. O(L)"""
        for pos in range(self.num_positions):
            if outcome[pos] == 'X':
                continue  # Skip positions that are already merged
            key = get_merge_key(outcome, pos)
            if key not in self.groups[pos]:
                self.groups[pos][key] = set()
            self.groups[pos][key].add(outcome)
    
    def _remove_outcome_from_groups(self, outcome: str):
        """Remove an outcome from all position groups. O(L)"""
        for pos in range(self.num_positions):
            if outcome[pos] == 'X':
                continue
            key = get_merge_key(outcome, pos)
            if key in self.groups[pos]:
                self.groups[pos][key].discard(outcome)
                # Clean up empty groups
                if not self.groups[pos][key]:
                    del self.groups[pos][key]
    
    def _find_all_merge_candidates(self):
        """Find all merge candidates from current groups. O(N * L) total."""
        for pos in range(self.num_positions):
            for key, members in self.groups[pos].items():
                if len(members) == 2:
                    self._add_candidate_from_group(pos, members)
    
    def _add_candidate_from_group(self, pos: int, members: set):
        """Add a merge candidate to the heap if valid."""
        if len(members) != 2:
            return
        members_list = sorted(members)  # Sort for deterministic ordering
        out1, out2 = members_list[0], members_list[1]
        
        # Verify both are still valid
        if out1 not in self.valid_outcomes or out2 not in self.valid_outcomes:
            return
        
        combined_prob = self.probabilities[out1] + self.probabilities[out2]
        # Use negative for max-heap behavior
        # Tiebreaker: prefer lower positions (add pos as secondary sort key)
        # Then prefer lower out1 (lexicographic order) for determinism
        heapq.heappush(self.heap, (-combined_prob, pos, out1, out2))
    
    def _check_and_add_candidates_for_outcome(self, outcome: str):
        """Check if this outcome forms any new merge candidates. O(L)"""
        for pos in range(self.num_positions):
            if outcome[pos] == 'X':
                continue
            key = get_merge_key(outcome, pos)
            if key in self.groups[pos] and len(self.groups[pos][key]) == 2:
                self._add_candidate_from_group(pos, self.groups[pos][key])
    
    def get_best_merge(self) -> Optional[Tuple[str, str, int, float]]:
        """
        Get the best (highest probability) merge candidate.
        Returns (outcome1, outcome2, position, combined_prob) or None if no merges available.
        Handles stale entries in the heap. O(log N) amortized.
        """
        while self.heap:
            neg_prob, pos, out1, out2 = heapq.heappop(self.heap)
            
            # Check if this candidate is still valid (not stale)
            if out1 in self.valid_outcomes and out2 in self.valid_outcomes:
                # Verify they're still in the same group (extra safety check)
                key = get_merge_key(out1, pos)
                if key in self.groups[pos] and out1 in self.groups[pos][key] and out2 in self.groups[pos][key]:
                    return (out1, out2, pos, -neg_prob)
        
        return None
    
    def perform_merge(self, out1: str, out2: str, pos: int) -> str:
        """
        Perform a merge and update all data structures. O(L)
        Returns the merged outcome.
        """
        # Create merged outcome
        merged = merge_two_outcomes(out1, out2, pos)
        
        # Calculate new probability
        prob1 = self.probabilities.pop(out1)
        prob2 = self.probabilities.pop(out2)
        new_prob = prob1 + prob2
        
        # Remove old outcomes from tracking
        self.valid_outcomes.discard(out1)
        self.valid_outcomes.discard(out2)
        
        # Remove old outcomes from groups
        self._remove_outcome_from_groups(out1)
        self._remove_outcome_from_groups(out2)
        
        # Add merged outcome (or combine if it already exists)
        if merged in self.probabilities:
            self.probabilities[merged] += new_prob
        else:
            self.probabilities[merged] = new_prob
            self.valid_outcomes.add(merged)
            self._add_outcome_to_groups(merged)
            self._check_and_add_candidates_for_outcome(merged)
        
        return merged
    
    def get_results(self) -> Dict[str, float]:
        """Get the final outcomes with probabilities."""
        return self.probabilities


def merge_winning_outcomes(outcomes_with_probs: Dict[str, float]) -> Dict[str, float]:
    """
    Iteratively merge winning outcomes that differ by exactly 1 position.
    Uses greedy approach: always merge the pair with highest combined probability.
    
    Optimized O(N * L) algorithm using incremental group maintenance and priority queue.
    
    Args:
        outcomes_with_probs: Dict mapping outcome strings to their probabilities
        
    Returns:
        Dict of merged outcomes with combined probabilities
    """
    if len(outcomes_with_probs) <= 1:
        return dict(outcomes_with_probs)
    
    tracker = MergeCandidateTracker(outcomes_with_probs)
    merge_count = 0
    
    while True:
        best = tracker.get_best_merge()
        if best is None:
            break
        
        out1, out2, pos, combined_prob = best
        tracker.perform_merge(out1, out2, pos)
        merge_count += 1
        
        # Progress update for large merges
        if merge_count % 500 == 0:
            remaining = len(tracker.valid_outcomes)
            print(f"    ... merged {merge_count} pairs, {remaining} outcomes remaining")
    
    if merge_count > 0:
        print(f"    Merged {merge_count} outcome pairs")
    
    return tracker.get_results()


def get_top_scenarios(outcomes_with_probs: Dict[str, float], max_scenarios: int) -> List[Tuple[str, float]]:
    """
    Get the top N most probable scenarios.
    
    Returns:
        List of (outcome_string, probability) tuples, sorted by probability descending
    """
    sorted_outcomes = sorted(outcomes_with_probs.items(), key=lambda x: x[1], reverse=True)
    return sorted_outcomes[:max_scenarios]


def decode_merged_outcome_to_games(results_bracket: dict, remaining_games: List[Tuple[str, int]], 
                                    outcome_string: str) -> List[dict]:
    """
    Decode a potentially merged outcome string (containing 'X' for either) into a list of game results.
    Returns list of dicts with round, game index, and winner info.
    For positions with 'X', winner is set to 'either' and both teams are valid.
    When an 'either' game propagates to later rounds, both team names are combined with '/'.
    """
    import copy
    hypothetical = copy.deepcopy(results_bracket)
    game_results = []
    
    def get_combined_name(team):
        """Get team name, handling combined 'either' teams."""
        if isinstance(team, dict):
            if team.get('either_teams'):
                # This is a combined either team
                return team.get('name', '')
            return get_team_name(team)
        return str(team) if team else None
    
    def get_combined_seed(team):
        """Get team seed, handling combined 'either' teams."""
        if isinstance(team, dict):
            if team.get('either_teams'):
                # Return seeds as combined string
                return team.get('seed', '')
            return team.get('seed')
        return None
    
    for i, (round_key, game_index) in enumerate(remaining_games):
        game = hypothetical[round_key][game_index]
        
        team1 = game.get('team1')
        team2 = game.get('team2')
        
        if not team1 or not team2:
            continue
        
        outcome_char = outcome_string[i]
        
        # Check if either team came from an "either" game (combined teams)
        team1_is_either = isinstance(team1, dict) and team1.get('either_teams')
        team2_is_either = isinstance(team2, dict) and team2.get('either_teams')
        
        if outcome_char == 'X':
            # Either team can win - this game doesn't matter for the outcome
            game_results.append({
                'round': ROUND_KEYS.index(round_key) + 1,
                'roundKey': round_key,
                'gameIndex': game_index,
                'team1': get_combined_name(team1),
                'team2': get_combined_name(team2),
                'winner': 'either',
                'either': True,
                'team1Seed': get_combined_seed(team1),
                'team2Seed': get_combined_seed(team2),
                'team1IsEither': team1_is_either,
                'team2IsEither': team2_is_either,
            })
            
            # For propagation, create a combined team representing both possibilities
            # Combine all possible teams from both sides
            team1_names = team1.get('either_teams', [get_team_name(team1)]) if isinstance(team1, dict) else [get_team_name(team1)]
            team2_names = team2.get('either_teams', [get_team_name(team2)]) if isinstance(team2, dict) else [get_team_name(team2)]
            all_teams = team1_names + team2_names
            
            team1_seeds = team1.get('either_seeds', [team1.get('seed')]) if isinstance(team1, dict) else [team1.get('seed') if isinstance(team1, dict) else None]
            team2_seeds = team2.get('either_seeds', [team2.get('seed')]) if isinstance(team2, dict) else [team2.get('seed') if isinstance(team2, dict) else None]
            all_seeds = team1_seeds + team2_seeds
            
            winner = {
                'name': '/'.join(all_teams),
                'seed': '/'.join(str(s) for s in all_seeds if s),
                'either_teams': all_teams,
                'either_seeds': all_seeds
            }
        elif outcome_char == '0':
            winner = team1
            loser = team2
            game_results.append({
                'round': ROUND_KEYS.index(round_key) + 1,
                'roundKey': round_key,
                'gameIndex': game_index,
                'team1': get_combined_name(team1),
                'team2': get_combined_name(team2),
                'winner': get_combined_name(winner),
                'loser': get_combined_name(loser),
                'either': False,
                'team1Seed': get_combined_seed(team1),
                'team2Seed': get_combined_seed(team2),
                'winnerSeed': get_combined_seed(winner),
                'team1IsEither': team1_is_either,
                'team2IsEither': team2_is_either,
                'winnerIsEither': team1_is_either,
                # Include the list of teams if winner came from either
                'winnerEitherTeams': team1.get('either_teams') if team1_is_either else None
            })
        else:  # '1'
            winner = team2
            loser = team1
            game_results.append({
                'round': ROUND_KEYS.index(round_key) + 1,
                'roundKey': round_key,
                'gameIndex': game_index,
                'team1': get_combined_name(team1),
                'team2': get_combined_name(team2),
                'winner': get_combined_name(winner),
                'loser': get_combined_name(loser),
                'either': False,
                'team1Seed': get_combined_seed(team1),
                'team2Seed': get_combined_seed(team2),
                'winnerSeed': get_combined_seed(winner),
                'team1IsEither': team1_is_either,
                'team2IsEither': team2_is_either,
                'winnerIsEither': team2_is_either,
                # Include the list of teams if winner came from either
                'winnerEitherTeams': team2.get('either_teams') if team2_is_either else None
            })
        
        # Propagate winner to next round
        parent_info = get_parent_game_info(round_key, game_index)
        if parent_info:
            parent_round, parent_index, slot = parent_info
            
            if parent_round in hypothetical and parent_index < len(hypothetical[parent_round]):
                parent_game = hypothetical[parent_round][parent_index]
                if slot == 0:
                    parent_game['team1'] = winner
                else:
                    parent_game['team2'] = winner
    
    return game_results


def process_winning_outcomes(
    raw_outcomes: Dict[str, Dict[str, float]],  # name -> {outcome: probability}
    results_bracket: dict,
    remaining_games: List[Tuple[str, int]],
    max_scenarios: int
) -> Dict[str, List[dict]]:
    """
    Process raw winning outcomes: merge similar ones and keep top N.
    
    Args:
        raw_outcomes: Dict mapping participant name to {outcome_string: probability}
        results_bracket: The results bracket for decoding games
        remaining_games: List of remaining games
        max_scenarios: Maximum scenarios to keep per participant
        
    Returns:
        Dict mapping participant name to list of scenario dicts with probability
    """
    processed = {}
    
    for name, outcomes in raw_outcomes.items():
        if not outcomes:
            processed[name] = []
            continue
        
        print(f"  Processing {name}: {len(outcomes)} raw winning outcomes")
        
        # Merge similar outcomes
        merged = merge_winning_outcomes(outcomes)
        print(f"    After merging: {len(merged)} outcomes")
        
        # Get top scenarios
        top = get_top_scenarios(merged, max_scenarios)
        print(f"    Keeping top {len(top)} scenarios")
        
        # Decode each scenario to game results
        scenarios = []
        for outcome_str, probability in top:
            games = decode_merged_outcome_to_games(results_bracket, remaining_games, outcome_str)
            scenarios.append({
                'outcome': outcome_str,
                'probability': probability,
                'games': games
            })
        
        processed[name] = scenarios
    
    return processed


def find_next_games(results_bracket: dict) -> List[Tuple[str, int, dict, dict]]:
    """
    Find games that are "next up" - both parent games have been decided.
    Returns list of (round_key, game_index, team1, team2) tuples.
    """
    next_games = []
    
    for round_key in ROUND_KEYS:
        round_num = ROUND_KEYS.index(round_key) + 1
        results_round = results_bracket.get(round_key, [])
        
        for i, game in enumerate(results_round):
            if not game:
                continue
            
            # Skip if already has a winner
            if get_winner_name(game):
                continue
            
            team1 = game.get('team1')
            team2 = game.get('team2')
            
            # Both teams must be determined
            if not team1 or not team2:
                continue
            
            # For round 1, all games with teams are "next"
            if round_num == 1:
                next_games.append((round_key, i, team1, team2))
                continue
            
            # For later rounds, check if both feeder games have winners
            feeder_info = get_feeder_games(round_key, i)
            if feeder_info:
                prev_round_key, f1_idx, f2_idx = feeder_info
                prev_round = results_bracket.get(prev_round_key, [])
                
                f1_game = prev_round[f1_idx] if f1_idx < len(prev_round) else None
                f2_game = prev_round[f2_idx] if f2_idx < len(prev_round) else None
                
                if f1_game and f2_game and get_winner_name(f1_game) and get_winner_name(f2_game):
                    next_games.append((round_key, i, team1, team2))
    
    return next_games


def compute_next_game_preferences(
    raw_winning_outcomes: Dict[str, Dict[str, float]],
    remaining_games: List[Tuple[str, int]],
    next_games: List[Tuple[str, int, dict, dict]],
    results_bracket: dict
) -> Dict[str, dict]:
    """
    Compute what percentage of each participant's winning outcomes require each result
    for each "next up" game.
    
    Args:
        raw_winning_outcomes: Dict of {participant: {outcome_string: probability}}
        remaining_games: List of (round_key, game_index) tuples for all remaining games
        next_games: List of (round_key, game_index, team1, team2) for next games
        results_bracket: The results bracket
        
    Returns:
        Dict mapping game keys to preference data:
        {
            "r3-2": {
                "team1": "Florida",
                "team2": "Clemson", 
                "preferences": {
                    "alice": {"team1": 0.65, "team2": 0.35},
                    "bob": null
                }
            }
        }
    """
    # Build a mapping from (round_key, game_index) to position in outcome string
    game_to_position = {(rk, gi): pos for pos, (rk, gi) in enumerate(remaining_games)}
    
    preferences = {}
    
    for round_key, game_index, team1, team2 in next_games:
        game_key = f"r{ROUND_KEYS.index(round_key) + 1}-{game_index}"
        
        # Check if this game is in remaining games
        if (round_key, game_index) not in game_to_position:
            continue
        
        position = game_to_position[(round_key, game_index)]
        
        game_prefs = {
            "team1": get_team_name(team1),
            "team2": get_team_name(team2),
            "team1Seed": team1.get('seed') if team1 else None,
            "team2Seed": team2.get('seed') if team2 else None,
            "preferences": {}
        }
        
        for name, outcomes in raw_winning_outcomes.items():
            if not outcomes:
                game_prefs["preferences"][name] = None
                continue
            
            team1_prob = 0.0  # outcome char '0' means team1 wins
            team2_prob = 0.0  # outcome char '1' means team2 wins
            
            for outcome_str, prob in outcomes.items():
                if position < len(outcome_str):
                    if outcome_str[position] == '0':
                        team1_prob += prob
                    else:  # '1'
                        team2_prob += prob
            
            total = team1_prob + team2_prob
            if total > 0:
                game_prefs["preferences"][name] = {
                    "team1": team1_prob / total,
                    "team2": team2_prob / total
                }
            else:
                game_prefs["preferences"][name] = None
        
        preferences[game_key] = game_prefs
    
    return preferences


def calculate_win_probabilities(
    results_path: str,
    brackets_dir: str,
    participants: List[str],
    teams_file: str,
    apply_seed_bonus: bool = True,
    max_simulations: Optional[int] = None,
    bonus_stars: Optional[Dict[str, int]] = None,
    max_scenarios: int = DEFAULT_MAX_WINNING_SCENARIOS
) -> Tuple[Dict[str, float], Dict[str, List]]:
    """
    Calculate win probabilities for all participants.
    
    Args:
        results_path: Path to results bracket JSON file
        brackets_dir: Directory containing participant bracket JSON files
        participants: List of participant names
        teams_file: Path to teams JSON/CSV file (for seed bonuses)
        apply_seed_bonus: Whether to apply upset bonus points
        max_simulations: Max number of simulations (uses Monte Carlo if exceeded)
        bonus_stars: Optional dict of {name: bonus_points}
        max_scenarios: Maximum number of winning scenarios to keep per participant
    
    Returns:
        Tuple of (win_probabilities dict, winning_scenarios dict)
    """
    # Load results bracket
    results_bracket = load_bracket(results_path)
    
    # Load teams data (with validation against results)
    teams_data = load_teams(teams_file, results_bracket) if teams_file and os.path.exists(teams_file) else {}
    
    # Load all participant brackets
    name_to_bracket = {}
    for name in participants:
        # Try different file naming conventions
        possible_paths = [
            os.path.join(brackets_dir, f'{name}.json'),
            os.path.join(brackets_dir, f'{name}-bracket.json'),
            os.path.join(brackets_dir, f'{name.lower()}.json'),
            os.path.join(brackets_dir, f'{name.lower()}-bracket.json'),
        ]
        
        # Also search for files containing the participant name
        if os.path.exists(brackets_dir):
            for f in os.listdir(brackets_dir):
                if f.endswith('.json') and name.lower() in f.lower() and 'results' not in f.lower():
                    possible_paths.append(os.path.join(brackets_dir, f))
        
        bracket_path = None
        for path in possible_paths:
            if os.path.exists(path):
                bracket_path = path
                break
        
        if bracket_path:
            name_to_bracket[name] = load_bracket(bracket_path)
        else:
            print(f"Warning: Bracket not found for {name}")
    
    if not name_to_bracket:
        print("Error: No brackets found")
        return {}, {}
    
    # Find remaining games
    remaining_games = find_remaining_games(results_bracket)
    num_remaining = len(remaining_games)
    print(f"Found {num_remaining} remaining games")
    
    # Handle case where tournament is over
    if num_remaining == 0:
        scores = []
        for name, bracket in name_to_bracket.items():
            score, _, _ = compute_score(results_bracket, bracket, teams_data, apply_seed_bonus)
            if bonus_stars and name in bonus_stars:
                score += bonus_stars[name]
            scores.append((name, score))
        
        sorted_scores = sorted(scores, key=lambda x: x[1], reverse=True)
        winner = sorted_scores[0][0]
        probabilities = {name: (1.0 if name == winner else 0.0) for name in name_to_bracket.keys()}
        return probabilities, {}, {}  # Empty winning_outcomes and next_game_prefs since tournament is over
    
    # Determine simulation approach
    total_possible = 2 ** num_remaining
    use_monte_carlo = max_simulations is not None and total_possible > max_simulations
    
    if use_monte_carlo:
        num_simulations = max_simulations
        print(f"Total possible outcomes: {total_possible:,}")
        print(f"Using Monte Carlo sampling with {num_simulations:,} simulations")
    else:
        num_simulations = total_possible
        if max_simulations is not None:
            print(f"Total outcomes ({total_possible:,}) <= max_simulations ({max_simulations:,})")
        print(f"Simulating all {num_simulations:,} possible outcomes...")
    
    # Check if we have probability data
    sample_team = next(iter(teams_data.values())) if teams_data else {}
    has_prob_data = any(col in sample_team for col in PROB_COLUMNS)
    if has_prob_data:
        print("Using team probability data for outcome weighting")
    else:
        print("No probability data found, using uniform (50/50) probabilities")
    
    # Calculate base probability per outcome (used for uniform case)
    base_probability = 1.0 / total_possible
    
    # Simulate outcomes
    total_probability_sum = 0.0  # Track sum of all outcome probabilities
    win_probability_sum = {name: 0.0 for name in name_to_bracket.keys()}  # Sum of probabilities where each person wins
    places = {name: [] for name in name_to_bracket.keys()}
    # Store ALL winning outcomes with their probabilities
    raw_winning_outcomes = {name: {} for name in name_to_bracket.keys()}  # name -> {outcome: probability}
    
    # Calculate progress intervals
    total_intervals = num_simulations // PROGRESS_INTERVAL if num_simulations >= PROGRESS_INTERVAL else 1
    
    print(f"Progress: ", end='', flush=True)
    
    for i in range(num_simulations):
        # Progress reporting
        if PROGRESS_INTERVAL > 0 and (i + 1) % PROGRESS_INTERVAL == 0:
            current_interval = (i + 1) // PROGRESS_INTERVAL
            print(f"\rProgress: {current_interval}/{total_intervals}", end='', flush=True)
        
        # Generate outcome
        if use_monte_carlo:
            outcome = generate_random_outcome(num_remaining)
        else:
            outcome = format(i, f'0{num_remaining}b')
        
        # Create hypothetical results
        hypothetical = create_hypothetical_bracket(results_bracket, remaining_games, outcome)
        
        # Calculate probability of this specific outcome
        if has_prob_data:
            outcome_probability = calculate_outcome_probability(hypothetical, teams_data)
        else:
            outcome_probability = base_probability
        
        total_probability_sum += outcome_probability
        
        # Compute score for each participant
        all_scores = []
        for name, bracket in name_to_bracket.items():
            score, _, _ = compute_score(hypothetical, bracket, teams_data, apply_seed_bonus)
            if bonus_stars and name in bonus_stars:
                score += bonus_stars[name]
            all_scores.append((name, score))
        
        # Sort by score
        sorted_scores = sorted(all_scores, key=lambda x: x[1], reverse=True)
        
        # Record places and check for winner
        for place, (name, score) in enumerate(sorted_scores):
            places[name].append(place + 1)
            if place == 0:
                win_probability_sum[name] += outcome_probability
                # Store this winning outcome with its probability
                if outcome not in raw_winning_outcomes[name]:
                    raw_winning_outcomes[name][outcome] = outcome_probability
                else:
                    # For Monte Carlo, might see same outcome multiple times
                    raw_winning_outcomes[name][outcome] += outcome_probability
    
    # Clear progress line
    print(f"\rProgress: {total_intervals}/{total_intervals} - Complete!          ")
    
    # Normalize probabilities (they should sum to 1, but might not due to floating point)
    if total_probability_sum > 0:
        normalization_factor = 1.0 / total_probability_sum
    else:
        normalization_factor = 1.0
    
    # Calculate win probabilities
    win_probabilities = {}
    
    print("\nResults:")
    print("-" * 50)
    if use_monte_carlo:
        print(f"(Estimated from {num_simulations:,} Monte Carlo samples)")
    if has_prob_data:
        print(f"(Weighted by team probability data, total prob sum: {total_probability_sum:.6f})")
    
    for name in sorted(name_to_bracket.keys(), key=lambda n: win_probability_sum[n], reverse=True):
        prob = win_probability_sum[name] * normalization_factor
        avg_place = sum(places[name]) / len(places[name]) if places[name] else 0
        win_probabilities[name] = prob
        num_raw = len(raw_winning_outcomes.get(name, {}))
        print(f"{name}: {prob*100:.2f}% win probability, avg place: {avg_place:.1f}, {num_raw} raw winning outcomes")
    
    # Normalize raw_winning_outcomes probabilities too
    for name in raw_winning_outcomes:
        for outcome in raw_winning_outcomes[name]:
            raw_winning_outcomes[name][outcome] *= normalization_factor
    
    # Compute next game preferences (before merging)
    print("\nComputing next game preferences...")
    next_games = find_next_games(results_bracket)
    print(f"  Found {len(next_games)} next games")
    next_game_prefs = compute_next_game_preferences(
        raw_winning_outcomes,
        remaining_games,
        next_games,
        results_bracket
    )
    
    # Process winning outcomes: merge similar ones and keep top N
    print("\nProcessing winning scenarios...")
    processed_outcomes = process_winning_outcomes(
        raw_winning_outcomes, 
        results_bracket, 
        remaining_games, 
        max_scenarios
    )
    
    return win_probabilities, processed_outcomes, next_game_prefs


def main():
    parser = argparse.ArgumentParser(description='Calculate March Madness win probabilities')
    parser.add_argument('--results', required=True, help='Path to results bracket JSON file')
    parser.add_argument('--brackets-dir', required=True, help='Directory containing participant bracket JSON files')
    parser.add_argument('--teams', default=None, help='Path to teams JSON/CSV file (for seed bonuses)')
    parser.add_argument('--output', default='winProbabilities.json', help='Output JSON file')
    parser.add_argument('--participants', nargs='+', help='List of participant names')
    parser.add_argument('--participants-file', help='JSON file with list of participants')
    parser.add_argument('--no-seed-bonus', action='store_true', help='Disable upset bonus')
    parser.add_argument('--max-simulations', type=int, default=100000,
                       help='Maximum simulations. Uses Monte Carlo if total outcomes exceeds this. Default: 100000')
    parser.add_argument('--max-scenarios', type=int, default=DEFAULT_MAX_WINNING_SCENARIOS,
                       help=f'Maximum winning scenarios to keep per participant. Default: {DEFAULT_MAX_WINNING_SCENARIOS}')
    parser.add_argument('--seed', type=int, default=None, help='Random seed for reproducible results')
    
    args = parser.parse_args()
    
    # Set random seed if provided
    if args.seed is not None:
        random.seed(args.seed)
        print(f"Using random seed: {args.seed}")
    
    # Get participants
    if args.participants:
        participants = args.participants
    elif args.participants_file:
        with open(args.participants_file) as f:
            participants = json.load(f)
    else:
        # Try to find participants from bracket files
        participants = []
        if os.path.exists(args.brackets_dir):
            for f in os.listdir(args.brackets_dir):
                if f.endswith('.json') and f != 'results.json' and not f.startswith('win'):
                    # Extract participant name as first word (split by - or _)
                    name_without_ext = f.replace('.json', '')
                    # Split by - or _ and take first part as participant name
                    import re
                    parts = re.split(r'[-_]', name_without_ext)
                    name = parts[0]
                    participants.append(name)
        
        if not participants:
            print("Error: No participants specified. Use --participants or --participants-file")
            return
    
    print(f"Calculating win probabilities for {len(participants)} participants...")
    print(f"Participants: {participants}")
    
    # Calculate probabilities
    probabilities, winning_outcomes, next_game_prefs = calculate_win_probabilities(
        results_path=args.results,
        brackets_dir=args.brackets_dir,
        participants=participants,
        teams_file=args.teams or '',
        apply_seed_bonus=not args.no_seed_bonus,
        max_simulations=args.max_simulations,
        max_scenarios=args.max_scenarios
    )
    
    # Save to JSON (include probabilities, winning scenarios, and next game preferences)
    output_data = {
        'probabilities': probabilities,
        'winning_scenarios': winning_outcomes,
        'next_game_preferences': next_game_prefs
    }
    
    with open(args.output, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"\nWin probabilities saved to {args.output}")


if __name__ == '__main__':
    main()