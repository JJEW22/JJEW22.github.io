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


def load_bracket(filepath: str) -> dict:
    """Load a bracket from a JSON file."""
    with open(filepath, 'r') as f:
        return json.load(f)


def load_teams(filepath: str) -> Dict[str, dict]:
    """Load teams from a JSON or CSV file and return a dict mapping name to team data."""
    teams = {}
    
    if filepath.endswith('.json'):
        with open(filepath, 'r') as f:
            team_list = json.load(f)
            for team in team_list:
                teams[team['name']] = team
    elif filepath.endswith('.csv'):
        import csv
        with open(filepath, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get('Team') or row.get('name')
                seed = int(row.get('Seed') or row.get('seed', 0))
                region = row.get('Region') or row.get('region', '')
                teams[name] = {'name': name, 'seed': seed, 'region': region}
    
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


def merge_winning_outcomes(outcomes_with_probs: Dict[str, float]) -> Dict[str, float]:
    """
    Iteratively merge winning outcomes that differ by exactly 1 position.
    Uses greedy approach: always merge the pair with highest combined probability.
    
    Optimized to use grouping by potential merge keys for faster matching.
    
    Args:
        outcomes_with_probs: Dict mapping outcome strings to their probabilities
        
    Returns:
        Dict of merged outcomes with combined probabilities
    """
    outcomes = dict(outcomes_with_probs)
    
    if len(outcomes) <= 1:
        return outcomes
    
    merge_count = 0
    num_positions = len(next(iter(outcomes)))
    
    while True:
        # Find the best merge using grouping
        best_merge = None
        best_combined_prob = -1
        
        # For each position, group outcomes by what they'd look like with X at that position
        for pos in range(num_positions):
            groups = {}
            for outcome, prob in outcomes.items():
                # Skip if this position is already X
                if outcome[pos] == 'X':
                    continue
                key = get_merge_key(outcome, pos)
                if key not in groups:
                    groups[key] = []
                groups[key].append((outcome, prob))
            
            # Check groups with exactly 2 members (potential merges)
            for key, members in groups.items():
                if len(members) == 2:
                    out1, prob1 = members[0]
                    out2, prob2 = members[1]
                    # Verify they actually differ by exactly 1 position
                    if can_merge_outcomes(out1, out2) is not None:
                        combined_prob = prob1 + prob2
                        if combined_prob > best_combined_prob:
                            best_combined_prob = combined_prob
                            best_merge = (out1, out2, pos)
        
        # If no merges possible, we're done
        if best_merge is None:
            break
        
        # Perform the best merge
        out1, out2, pos = best_merge
        merged = merge_two_outcomes(out1, out2, pos)
        
        # Remove old outcomes, add merged one
        prob1 = outcomes.pop(out1)
        prob2 = outcomes.pop(out2)
        
        # If merged outcome already exists, add to it
        if merged in outcomes:
            outcomes[merged] += prob1 + prob2
        else:
            outcomes[merged] = prob1 + prob2
        
        merge_count += 1
        
        # Progress update for large merges
        if merge_count % 500 == 0:
            print(f"    ... merged {merge_count} pairs, {len(outcomes)} outcomes remaining")
    
    if merge_count > 0:
        print(f"    Merged {merge_count} outcome pairs")
    
    return outcomes


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
        
        outcome_char = outcome_string[i]
        
        if outcome_char == 'X':
            # Either team can win - this game doesn't matter for the outcome
            game_results.append({
                'round': ROUND_KEYS.index(round_key) + 1,
                'roundKey': round_key,
                'gameIndex': game_index,
                'team1': get_team_name(team1),
                'team2': get_team_name(team2),
                'winner': 'either',
                'either': True,
                'team1Seed': team1.get('seed') if team1 else None,
                'team2Seed': team2.get('seed') if team2 else None,
            })
            
            # For propagation, we need to pick one - use team1 arbitrarily
            # (doesn't matter since this path merges anyway)
            winner = team1
        elif outcome_char == '0':
            winner = team1
            loser = team2
            game_results.append({
                'round': ROUND_KEYS.index(round_key) + 1,
                'roundKey': round_key,
                'gameIndex': game_index,
                'team1': get_team_name(team1),
                'team2': get_team_name(team2),
                'winner': get_team_name(winner),
                'loser': get_team_name(loser),
                'either': False,
                'team1Seed': team1.get('seed') if team1 else None,
                'team2Seed': team2.get('seed') if team2 else None,
                'winnerSeed': winner.get('seed') if winner else None
            })
        else:  # '1'
            winner = team2
            loser = team1
            game_results.append({
                'round': ROUND_KEYS.index(round_key) + 1,
                'roundKey': round_key,
                'gameIndex': game_index,
                'team1': get_team_name(team1),
                'team2': get_team_name(team2),
                'winner': get_team_name(winner),
                'loser': get_team_name(loser),
                'either': False,
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
    
    # Load teams data
    teams_data = load_teams(teams_file) if teams_file and os.path.exists(teams_file) else {}
    
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
        return probabilities, {}  # Empty winning_outcomes since tournament is over
    
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
    
    # Calculate base probability per outcome
    base_probability = 1.0 / total_possible
    
    # Simulate outcomes
    number_of_wins = {name: 0 for name in name_to_bracket.keys()}
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
                number_of_wins[name] += 1
                # Store this winning outcome with its probability
                if outcome not in raw_winning_outcomes[name]:
                    raw_winning_outcomes[name][outcome] = base_probability
                else:
                    # For Monte Carlo, might see same outcome multiple times
                    raw_winning_outcomes[name][outcome] += base_probability
    
    # Clear progress line
    print(f"\rProgress: {total_intervals}/{total_intervals} - Complete!          ")
    
    # Calculate probabilities
    win_probabilities = {}
    
    print("\nResults:")
    print("-" * 50)
    if use_monte_carlo:
        print(f"(Estimated from {num_simulations:,} Monte Carlo samples)")
    
    for name in sorted(name_to_bracket.keys(), key=lambda n: number_of_wins[n], reverse=True):
        prob = number_of_wins[name] / num_simulations
        avg_place = sum(places[name]) / len(places[name])
        win_probabilities[name] = prob
        num_raw = len(raw_winning_outcomes.get(name, {}))
        print(f"{name}: {prob*100:.2f}% win probability, avg place: {avg_place:.1f}, {num_raw} raw winning outcomes")
    
    # Process winning outcomes: merge similar ones and keep top N
    print("\nProcessing winning scenarios...")
    processed_outcomes = process_winning_outcomes(
        raw_winning_outcomes, 
        results_bracket, 
        remaining_games, 
        max_scenarios
    )
    
    return win_probabilities, processed_outcomes


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
    probabilities, winning_outcomes = calculate_win_probabilities(
        results_path=args.results,
        brackets_dir=args.brackets_dir,
        participants=participants,
        teams_file=args.teams or '',
        apply_seed_bonus=not args.no_seed_bonus,
        max_simulations=args.max_simulations,
        max_scenarios=args.max_scenarios
    )
    
    # Save to JSON (include both probabilities and winning scenarios)
    output_data = {
        'probabilities': probabilities,
        'winning_scenarios': winning_outcomes
    }
    
    with open(args.output, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"\nWin probabilities saved to {args.output}")


if __name__ == '__main__':
    main()