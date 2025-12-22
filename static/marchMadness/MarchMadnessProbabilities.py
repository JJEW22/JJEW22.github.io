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
import csv
import time
from typing import Dict, List, Optional, Set, Tuple

# Scoring constants - MUST be loaded from config file
SCORE_FOR_ROUND = None
SEED_FACTOR = None
START_BONUS = None

# Flag to track if config has been loaded
_config_loaded = False


def load_scoring_config(config_path: str = None) -> bool:
    """
    Load scoring configuration from JSON file.
    
    Args:
        config_path: Path to scoring-config.json. If None, tries to find it
                     relative to the script directory or in common locations.
    
    Returns:
        True if loaded successfully, False otherwise
        
    Raises:
        FileNotFoundError: If config file cannot be found
        ValueError: If config file is missing required fields
    """
    global SCORE_FOR_ROUND, SEED_FACTOR, START_BONUS, _config_loaded
    
    if _config_loaded:
        return True
    
    # Try to find config file
    search_paths = []
    if config_path:
        search_paths.append(config_path)
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    search_paths.extend([
        os.path.join(script_dir, 'scoring-config.json'),
        os.path.join(script_dir, '2026', 'scoring-config.json'),
        os.path.join(script_dir, '..', 'static', 'marchMadness', '2026', 'scoring-config.json'),
        'scoring-config.json',
    ])
    
    for path in search_paths:
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                
                # Validate required fields
                if 'scoreForRound' not in config or not isinstance(config['scoreForRound'], list):
                    raise ValueError(f"Config file {path} missing required 'scoreForRound' array")
                if 'seedFactor' not in config or not isinstance(config['seedFactor'], list):
                    raise ValueError(f"Config file {path} missing required 'seedFactor' array")
                
                SCORE_FOR_ROUND = config['scoreForRound']
                SEED_FACTOR = config['seedFactor']
                START_BONUS = config.get('startBonus', {})
                
                _config_loaded = True
                print(f"Loaded scoring config from {path}")
                print(f"  SCORE_FOR_ROUND: {SCORE_FOR_ROUND}")
                print(f"  SEED_FACTOR: {SEED_FACTOR}")
                if START_BONUS:
                    print(f"  START_BONUS: {START_BONUS}")
                return True
            except json.JSONDecodeError as e:
                print(f"Error: Invalid JSON in config file {path}: {e}")
                continue
            except ValueError as e:
                print(f"Error: {e}")
                continue
    
    # Config file is required - raise error if not found
    searched = "\n  ".join(search_paths)
    raise FileNotFoundError(
        f"Could not find scoring-config.json. Searched:\n  {searched}\n"
        f"Please ensure scoring-config.json exists with 'scoreForRound' and 'seedFactor' arrays."
    )


def load_star_bonuses(star_bonuses_path: str, scoring_config_path: str = None) -> Dict[str, int]:
    """
    Load star bonuses from JSON file and calculate total bonus points per participant.
    
    Args:
        star_bonuses_path: Path to starBonuses.json file
        scoring_config_path: Path to scoring-config.json (for starBonus points array)
        
    Returns:
        Dict mapping participant name (lowercase) to total star bonus points
    """
    if not os.path.exists(star_bonuses_path):
        print(f"No star bonuses file found at {star_bonuses_path}")
        return {}
    
    # Load star bonuses
    with open(star_bonuses_path, 'r', encoding='utf-8') as f:
        star_bonuses = json.load(f)
    
    # Load scoring config to get starBonus points array
    star_bonus_points = [25, 20, 15, 10, 5]  # Default values
    
    if scoring_config_path and os.path.exists(scoring_config_path):
        with open(scoring_config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
            if 'starBonus' in config:
                star_bonus_points = config['starBonus']
    
    # Calculate points per participant
    participant_points = {}
    
    for award in star_bonuses:
        winners = award.get('Winners', [])
        if not winners:
            continue
        
        # Check if this is a split award (name contains "/" and Winners[0] is an array)
        is_split = award.get('name', '').find('/') != -1 and isinstance(winners[0] if winners else None, list)
        
        if is_split:
            # Split award: total winners is sum of all sublists
            total_winners = sum(len(w) if isinstance(w, list) else 0 for w in winners)
            points_per_winner = star_bonus_points[min(total_winners - 1, len(star_bonus_points) - 1)] if total_winners > 0 else 0
            
            # Award points to each winner in each sublist
            for winner_list in winners:
                if isinstance(winner_list, list):
                    for winner in winner_list:
                        name_lower = winner.lower()
                        participant_points[name_lower] = participant_points.get(name_lower, 0) + points_per_winner
        else:
            # Regular award
            winner_count = len(winners)
            points_per_winner = star_bonus_points[min(winner_count - 1, len(star_bonus_points) - 1)] if winner_count > 0 else 0
            
            for winner in winners:
                name_lower = winner.lower()
                participant_points[name_lower] = participant_points.get(name_lower, 0) + points_per_winner
    
    if participant_points:
        print(f"Loaded star bonuses: {participant_points}")
    
    return participant_points


# Round keys in order
ROUND_KEYS = ['round1', 'round2', 'round3', 'round4', 'round5', 'round6']

# Games per round (total 63 games in tournament)
GAMES_PER_ROUND = [32, 16, 8, 4, 2, 1]  # R1=32, R2=16, R3=8, R4=4, R5=2, R6=1

# Fixed bit position offsets for each round in the 63-bit full bracket string
# Round 1: bits 0-31, Round 2: bits 32-47, Round 3: bits 48-55, etc.
ROUND_BIT_OFFSETS = [0, 32, 48, 56, 60, 62]  # Cumulative: [0, 32, 48, 56, 60, 62]

# Total bits in full bracket representation
TOTAL_BRACKET_BITS = 63

# Progress reporting interval (print progress every N simulations)
PROGRESS_INTERVAL = 1000

# Default number of top scenarios to keep per participant (for both winning and losing)
DEFAULT_MAX_SCENARIOS = 5

# Seed-based probability file (relative to this script's directory)
SEED_PROBABILITIES_FILE = "seed_probabilities.csv"

# Seed-based probability data (loaded from CSV)
# Maps seed -> {prob_column -> probability}
SEED_PROBABILITIES = {}
SEED_PROB_METHOD = "50/50"  # Will be updated when seed probabilities are loaded


def load_seed_probabilities(filepath: str = None) -> bool:
    """
    Load seed-based probability data from CSV file.
    
    Args:
        filepath: Path to the seed probabilities CSV file. 
                  If None, uses SEED_PROBABILITIES_FILE relative to script directory.
        
    Returns:
        True if loaded successfully, False otherwise
    """
    global SEED_PROBABILITIES, SEED_PROB_METHOD
    
    # Use default path if not specified
    if filepath is None:
        # Look for file relative to this script's directory
        script_dir = os.path.dirname(os.path.abspath(__file__))
        filepath = os.path.join(script_dir, SEED_PROBABILITIES_FILE)
    
    if not os.path.exists(filepath):
        print(f"Seed probabilities file not found: {filepath}")
        print("Using 50/50 probability method as fallback")
        SEED_PROB_METHOD = "50/50"
        return False
    
    try:
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                seed = int(row['seed'])
                SEED_PROBABILITIES[seed] = {
                    'prob_r32': float(row.get('prob_r32', 0.5)),
                    'prob_r16': float(row.get('prob_r16', 0.25)),
                    'prob_r8': float(row.get('prob_r8', 0.125)),
                    'prob_r4': float(row.get('prob_r4', 0.0625)),
                    'prob_r2': float(row.get('prob_r2', 0.03125)),
                    'prob_win': float(row.get('prob_win', 0.015625)),
                }
        print(f"Loaded seed probabilities from {filepath}")
        print("Using seed-based probability method")
        SEED_PROB_METHOD = "seed-based"
        return True
    except Exception as e:
        print(f"Error loading seed probabilities: {e}")
        print("Using 50/50 probability method as fallback")
        SEED_PROB_METHOD = "50/50"
        return False


def get_seed_probability(seed: int, prob_column: str) -> Optional[float]:
    """
    Get the probability for a seed reaching a specific round.
    
    Args:
        seed: The team's seed (1-16)
        prob_column: Column name (e.g., 'prob_r32', 'prob_r16', etc.)
        
    Returns:
        Probability value from seed data, or None if not available
    """
    if not SEED_PROBABILITIES:
        return None
    
    if seed in SEED_PROBABILITIES and prob_column in SEED_PROBABILITIES[seed]:
        return SEED_PROBABILITIES[seed][prob_column]
    
    return None


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
        Probability value from team data, seed-based fallback, or 50/50 fallback
    """
    global _warned_missing_prob_teams
    
    # Map prob_column to number of rounds needed from R64 (for 50/50 fallback)
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
        
        # Fallback to seed-based probability if available
        seed = team_data.get('seed')
        if seed:
            seed_prob = get_seed_probability(seed, prob_column)
            if seed_prob is not None:
                # Warn once per team
                warn_key = (team_name, prob_column)
                if warn_key not in _warned_missing_prob_teams:
                    _warned_missing_prob_teams.add(warn_key)
                    print(f"  Using seed-based probability for '{team_name}' (seed {seed}): {prob_column}={seed_prob:.6f}")
                return seed_prob
    
    # Ultimate fallback: 50/50
    r = rounds_needed.get(prob_column, 1)
    default_prob = (0.5) ** r
    
    # Warn once per team
    warn_key = (team_name, prob_column)
    if warn_key not in _warned_missing_prob_teams:
        _warned_missing_prob_teams.add(warn_key)
        print(f"  Warning: No data for '{team_name}', using 50/50 default {default_prob:.6f}")
    
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


def get_fixed_bit_position(round_key: str, game_index: int) -> int:
    """
    Get the fixed bit position (0-62) for a specific game in the 63-bit full bracket string.
    
    Mapping:
      Round 1 (32 games): bits 0-31
      Round 2 (16 games): bits 32-47
      Round 3 (8 games):  bits 48-55
      Round 4 (4 games):  bits 56-59
      Round 5 (2 games):  bits 60-61
      Round 6 (1 game):   bit 62
    """
    round_idx = ROUND_KEYS.index(round_key)
    return ROUND_BIT_OFFSETS[round_idx] + game_index


def get_game_from_bit_position(bit_position: int) -> Tuple[str, int]:
    """
    Get the (round_key, game_index) for a given bit position (0-62).
    Inverse of get_fixed_bit_position.
    """
    for round_idx in range(len(ROUND_KEYS) - 1, -1, -1):
        if bit_position >= ROUND_BIT_OFFSETS[round_idx]:
            game_index = bit_position - ROUND_BIT_OFFSETS[round_idx]
            return (ROUND_KEYS[round_idx], game_index)
    return (ROUND_KEYS[0], bit_position)  # Fallback to round 1


def build_decided_games_bits(results_bracket: dict) -> Tuple[str, List[int]]:
    """
    Build a partial 63-bit string with decided game results.
    Returns:
      - base_bits: 63-char string with '1'/'0' for decided games, '?' for undecided
      - decided_positions: list of bit positions that are decided
    """
    base_bits = ['?'] * TOTAL_BRACKET_BITS
    decided_positions = []
    
    for round_idx, round_key in enumerate(ROUND_KEYS):
        results_round = results_bracket.get(round_key, [])
        offset = ROUND_BIT_OFFSETS[round_idx]
        
        for game_idx, game in enumerate(results_round):
            if game:
                winner = get_winner_name(game)
                if winner:
                    # Game is decided - determine which team won
                    team1_name = get_team_name(game.get('team1'))
                    bit_pos = offset + game_idx
                    
                    if winner == team1_name:
                        base_bits[bit_pos] = '1'
                    else:
                        base_bits[bit_pos] = '0'
                    decided_positions.append(bit_pos)
    
    return ''.join(base_bits), decided_positions


def build_remaining_games_bit_mapping(remaining_games: List[Tuple[str, int]]) -> List[int]:
    """
    Build a mapping from short outcome string positions to full 63-bit positions.
    
    Returns:
      List where index i is the 63-bit position for remaining_games[i]
    """
    return [get_fixed_bit_position(round_key, game_index) 
            for round_key, game_index in remaining_games]


def expand_to_full_bitstring(short_outcome: str, base_bits: str, 
                              remaining_bit_positions: List[int]) -> str:
    """
    Expand a short outcome string (remaining games only) to a full 63-bit string.
    
    Args:
        short_outcome: Variable-length string for remaining games ('0'/'1')
        base_bits: 63-char string with decided games filled in ('1'/'0'/'?')
        remaining_bit_positions: Mapping from short_outcome positions to 63-bit positions
    
    Returns:
        Full 63-bit string with all games filled in
    """
    full_bits = list(base_bits)
    
    for i, bit_pos in enumerate(remaining_bit_positions):
        full_bits[bit_pos] = short_outcome[i]
    
    return ''.join(full_bits)


def expand_all_to_full_bitstrings(short_outcomes: List[str], base_bits: str,
                                   remaining_bit_positions: List[int]) -> List[str]:
    """
    Expand all short outcome strings to full 63-bit strings.
    
    Args:
        short_outcomes: List of variable-length outcome strings
        base_bits: 63-char string with decided games filled in
        remaining_bit_positions: Mapping from short positions to 63-bit positions
    
    Returns:
        List of full 63-bit strings
    """
    results = []
    total = len(short_outcomes)
    
    for i, short_outcome in enumerate(short_outcomes):
        results.append(expand_to_full_bitstring(short_outcome, base_bits, remaining_bit_positions))
        print_progress(i, total, "  Expanding to full bitstrings")
    
    return results


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


def find_remaining_teams(results_bracket: dict) -> List[str]:
    """
    Find all teams that are still alive (not eliminated).
    A team is eliminated if they lost a game.
    """
    # Collect all teams that have lost
    eliminated = set()
    
    for round_key in ROUND_KEYS:
        results_round = results_bracket.get(round_key, [])
        for game in results_round:
            if not game:
                continue
            winner = get_team_name(game.get('winner'))
            if winner:
                team1 = get_team_name(game.get('team1'))
                team2 = get_team_name(game.get('team2'))
                if team1 and team1 != winner:
                    eliminated.add(team1)
                if team2 and team2 != winner:
                    eliminated.add(team2)
    
    # Collect all teams still in the bracket
    remaining = set()
    for round_key in ROUND_KEYS:
        results_round = results_bracket.get(round_key, [])
        for game in results_round:
            if not game:
                continue
            # Check team1 and team2 - if they're set and not eliminated, they're remaining
            team1 = get_team_name(game.get('team1'))
            team2 = get_team_name(game.get('team2'))
            if team1 and team1 not in eliminated:
                remaining.add(team1)
            if team2 and team2 not in eliminated:
                remaining.add(team2)
    
    return list(remaining)


def compute_base_scores(results_bracket: dict, name_to_bracket: dict, teams_data: dict,
                        apply_seed_bonus: bool, bonus_stars: Optional[Dict[str, int]] = None) -> Dict[str, int]:
    """
    Compute the base score for each participant from already-decided games.
    This is the score locked in before any remaining games are simulated.
    """
    base_scores = {}
    
    for name, bracket in name_to_bracket.items():
        score, _, _ = compute_score(results_bracket, bracket, teams_data, apply_seed_bonus)
        if bonus_stars and name in bonus_stars:
            score += bonus_stars[name]
        base_scores[name] = score
    
    return base_scores


def compute_score_delta(hypothetical_bracket: dict, picks_bracket: dict, teams_data: dict,
                        apply_seed_bonus: bool, remaining_games: List[Tuple[str, int]]) -> int:
    """
    Compute only the score delta from remaining games (faster than full score computation).
    """
    delta = 0
    
    for round_key, game_index in remaining_games:
        round_num = ROUND_KEYS.index(round_key) + 1
        
        hypo_game = hypothetical_bracket[round_key][game_index]
        picks_round = picks_bracket.get(round_key, [])
        
        if game_index >= len(picks_round):
            continue
        
        pick_game = picks_round[game_index]
        if not pick_game:
            continue
        
        hypo_winner = get_winner_name(hypo_game)
        pick_winner = get_winner_name(pick_game)
        
        if not hypo_winner or not pick_winner:
            continue
        
        if hypo_winner == pick_winner:
            points = SCORE_FOR_ROUND[round_num]
            delta += points
            
            # Apply upset bonus
            if apply_seed_bonus:
                team1_seed = get_team_seed(hypo_game.get('team1'), teams_data)
                team2_seed = get_team_seed(hypo_game.get('team2'), teams_data)
                winner_seed = get_team_seed(hypo_game.get('winner'), teams_data)
                
                if team1_seed and team2_seed and winner_seed:
                    expected_winner_seed = min(team1_seed, team2_seed)
                    if winner_seed > expected_winner_seed:
                        upset_bonus = (winner_seed - expected_winner_seed) * SEED_FACTOR[round_num]
                        delta += upset_bonus
    
    return delta


def generate_champion_stratified_outcomes(results_bracket: dict, remaining_games: List[Tuple[str, int]],
                                          remaining_teams: List[str], num_per_team: int) -> List[str]:
    """
    Generate outcomes stratified by champion - ensure each remaining team wins in some outcomes.
    For each team, we generate outcomes where that team wins the championship by:
    1. Making that team win all their games
    2. Randomizing other games
    """
    import copy
    outcomes = []
    num_games = len(remaining_games)
    
    for team_name in remaining_teams:
        for _ in range(num_per_team):
            # Start with random outcome
            outcome_list = [random.randint(0, 1) for _ in range(num_games)]
            
            # Now force this team to win all their games
            # We need to trace through the bracket to find which games this team plays in
            hypo = copy.deepcopy(results_bracket)
            
            for i, (round_key, game_index) in enumerate(remaining_games):
                game = hypo[round_key][game_index]
                team1 = get_team_name(game.get('team1'))
                team2 = get_team_name(game.get('team2'))
                
                # Determine winner based on current outcome
                if outcome_list[i] == 1:
                    winner_name = team1
                    winner = game.get('team1')
                else:
                    winner_name = team2
                    winner = game.get('team2')
                
                # If our target team is in this game, force them to win
                if team1 == team_name:
                    outcome_list[i] = 1
                    winner = game.get('team1')
                elif team2 == team_name:
                    outcome_list[i] = 0
                    winner = game.get('team2')
                
                # Apply winner
                game['winner'] = winner
                
                # Propagate to next round
                parent_info = get_parent_game_info(round_key, game_index)
                if parent_info:
                    parent_round, parent_index, slot = parent_info
                    if parent_round in hypo and parent_index < len(hypo[parent_round]):
                        parent_game = hypo[parent_round][parent_index]
                        if slot == 0:
                            parent_game['team1'] = winner
                        else:
                            parent_game['team2'] = winner
            
            outcomes.append(''.join(str(b) for b in outcome_list))
    
    return outcomes


def generate_next_game_stratified_outcomes(results_bracket: dict, remaining_games: List[Tuple[str, int]],
                                           next_games: List[Tuple[str, int]], num_outcomes: int) -> List[str]:
    """
    Generate outcomes stratified by next game results.
    If we can enumerate all 2^N combinations for N next games, do that.
    Otherwise, sample uniformly across next game combinations.
    """
    num_next = len(next_games)
    num_remaining = len(remaining_games)
    
    # Find indices of next games within remaining games
    next_game_indices = []
    for ng in next_games:
        try:
            idx = remaining_games.index(ng)
            next_game_indices.append(idx)
        except ValueError:
            pass
    
    outcomes = []
    total_next_combos = 2 ** num_next
    
    if total_next_combos <= num_outcomes:
        # Enumerate all combinations of next game outcomes
        outcomes_per_combo = max(1, num_outcomes // total_next_combos)
        
        for combo_idx in range(total_next_combos):
            next_game_bits = format(combo_idx, f'0{num_next}b')
            
            for _ in range(outcomes_per_combo):
                # Generate random outcome
                outcome_list = [random.randint(0, 1) for _ in range(num_remaining)]
                
                # Override with the specific next game combination
                for i, ng_idx in enumerate(next_game_indices):
                    outcome_list[ng_idx] = int(next_game_bits[i])
                
                outcomes.append(''.join(str(b) for b in outcome_list))
    else:
        # Sample uniformly across next game combinations
        for _ in range(num_outcomes):
            # Generate random outcome for all games
            outcome_list = [random.randint(0, 1) for _ in range(num_remaining)]
            outcomes.append(''.join(str(b) for b in outcome_list))
    
    return outcomes


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


def merge_outcomes(outcomes_with_probs: Dict[str, float], 
                   remaining_games: List[Tuple[str, int]] = None) -> Dict[str, float]:
    """
    Merge outcomes by processing rounds in order (earliest first).
    Exhaustively merges all pairs that differ by exactly 1 position at each round level
    before moving to the next round.
    
    This approach guarantees maximal simplification due to the bracket's hierarchical structure.
    
    Args:
        outcomes_with_probs: Dict mapping outcome strings to their probabilities
        remaining_games: List of (round_key, game_index) tuples indicating which games 
                        each position in the outcome string represents
        
    Returns:
        Dict of merged outcomes with combined probabilities
    """
    if len(outcomes_with_probs) <= 1:
        return dict(outcomes_with_probs)
    
    current_outcomes = dict(outcomes_with_probs)
    outcome_length = len(next(iter(current_outcomes)))
    
    # If no remaining_games provided, fall back to merging all positions together
    if remaining_games is None:
        positions_by_round = {1: list(range(outcome_length))}
    else:
        # Group positions by round number
        positions_by_round = {}
        for pos, (round_key, game_idx) in enumerate(remaining_games):
            round_num = int(round_key.replace('round', ''))
            if round_num not in positions_by_round:
                positions_by_round[round_num] = []
            positions_by_round[round_num].append(pos)
    
    total_merge_count = 0
    
    # Process rounds in order (1, 2, 3, 4, 5, 6)
    for round_num in sorted(positions_by_round.keys()):
        positions = positions_by_round[round_num]
        round_merge_count = 0
        
        # Exhaustively merge at positions in this round until no more merges possible
        changed = True
        while changed:
            changed = False
            new_outcomes = {}
            merged_away = set()  # Track outcomes that got merged
            
            # Build groups for positions in this round
            # groups[pos][key] = list of outcomes that share this merge key at position pos
            groups = {pos: {} for pos in positions}
            
            for outcome in current_outcomes:
                if outcome in merged_away:
                    continue
                for pos in positions:
                    if outcome[pos] in ('X', 'D'):
                        continue  # Skip already merged positions
                    key = get_merge_key(outcome, pos)
                    if key not in groups[pos]:
                        groups[pos][key] = []
                    groups[pos][key].append(outcome)
            
            # Find and perform all valid merges at this round level
            for pos in positions:
                for key, members in groups[pos].items():
                    if len(members) < 2:
                        continue
                    
                    # Find pairs that can actually merge (differ only at this position)
                    # Group by their pattern excluding this position
                    i = 0
                    while i < len(members) - 1:
                        out1 = members[i]
                        if out1 in merged_away:
                            i += 1
                            continue
                        
                        # Look for a merge partner
                        found_partner = False
                        for j in range(i + 1, len(members)):
                            out2 = members[j]
                            if out2 in merged_away:
                                continue
                            
                            # Check if they can merge (differ only at pos)
                            merge_pos = can_merge_outcomes(out1, out2)
                            if merge_pos == pos:
                                # Perform the merge
                                merged = merge_two_outcomes(out1, out2, pos)
                                prob1 = current_outcomes.get(out1, 0)
                                prob2 = current_outcomes.get(out2, 0)
                                
                                # Add to new outcomes (accumulate if already exists)
                                if merged in new_outcomes:
                                    new_outcomes[merged] += prob1 + prob2
                                elif merged in current_outcomes and merged not in merged_away:
                                    new_outcomes[merged] = current_outcomes[merged] + prob1 + prob2
                                    merged_away.add(merged)  # Will be replaced
                                else:
                                    new_outcomes[merged] = prob1 + prob2
                                
                                merged_away.add(out1)
                                merged_away.add(out2)
                                round_merge_count += 1
                                changed = True
                                found_partner = True
                                break
                        
                        if not found_partner:
                            i += 1
                        else:
                            i += 1
            
            # Update current_outcomes: keep unmerged, add newly merged
            updated_outcomes = {}
            for outcome, prob in current_outcomes.items():
                if outcome not in merged_away:
                    updated_outcomes[outcome] = prob
            for outcome, prob in new_outcomes.items():
                if outcome in updated_outcomes:
                    updated_outcomes[outcome] += prob
                else:
                    updated_outcomes[outcome] = prob
            
            current_outcomes = updated_outcomes
        
        if round_merge_count > 0:
            total_merge_count += round_merge_count
    
    if total_merge_count > 0:
        print(f"    Merged {total_merge_count} outcome pairs")
    
    return current_outcomes


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
        
        if outcome_char == 'D':
            # Dead path - this game doesn't matter and participant has no stake
            game_results.append({
                'round': ROUND_KEYS.index(round_key) + 1,
                'roundKey': round_key,
                'gameIndex': game_index,
                'team1': get_combined_name(team1),
                'team2': get_combined_name(team2),
                'winner': 'dead',
                'dead': True,
                'either': False,
                'team1Seed': get_combined_seed(team1),
                'team2Seed': get_combined_seed(team2),
                'team1IsEither': team1_is_either,
                'team2IsEither': team2_is_either,
            })
            
            # For dead paths, just propagate team1 - it doesn't matter since
            # downstream games will also be dead
            winner = team1
        elif outcome_char == 'X':
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


def process_outcomes(
    raw_outcomes: Dict[str, Dict[str, float]],  # name -> {outcome: probability}
    results_bracket: dict,
    remaining_games: List[Tuple[str, int]],
    max_scenarios: int,
    outcome_type: str = "winning"
) -> Dict[str, List[dict]]:
    """
    Process raw outcomes: merge similar ones and keep top N.
    
    Args:
        raw_outcomes: Dict mapping participant name to {outcome_string: probability}
        results_bracket: The results bracket for decoding games
        remaining_games: List of remaining games
        max_scenarios: Maximum scenarios to keep per participant
        outcome_type: Type of outcome for logging ("winning" or "losing")
        
    Returns:
        Dict mapping participant name to list of scenario dicts with probability
    """
    processed = {}
    
    for name, outcomes in raw_outcomes.items():
        if not outcomes:
            processed[name] = []
            continue
        
        print(f"  Processing {name}: {len(outcomes)} raw {outcome_type} outcomes")
        
        # Merge similar outcomes (using round-by-round approach)
        merged = merge_outcomes(outcomes, remaining_games)
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
    raw_outcomes: Dict[str, Dict[str, float]],
    remaining_games: List[Tuple[str, int]],
    next_games: List[Tuple[str, int, dict, dict]],
    results_bracket: dict,
    outcome_type: str = "winning"
) -> Dict[str, dict]:
    """
    Compute conditional probabilities for each participant given each next game outcome.
    
    For winning outcomes: P(participant wins | team X wins this game)
    For losing outcomes: P(participant loses | team X wins this game)
    
    Args:
        raw_outcomes: Dict of {participant: {outcome_string: probability}}
        remaining_games: List of (round_key, game_index) tuples for all remaining games
        next_games: List of (round_key, game_index, team1, team2) for next games
        results_bracket: The results bracket
        outcome_type: "winning" or "losing" - for logging purposes
        
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
        
        # First pass: collect numerators for each participant
        # numerator = sum of prob of participant's outcomes where team X wins
        participant_team1_probs = {}  # name -> P(name wins/loses AND team1 wins)
        participant_team2_probs = {}  # name -> P(name wins/loses AND team2 wins)
        
        for name, outcomes in raw_outcomes.items():
            if not outcomes:
                participant_team1_probs[name] = 0.0
                participant_team2_probs[name] = 0.0
                continue
            
            team1_prob = 0.0  # outcome char '1' means team1 wins
            team2_prob = 0.0  # outcome char '0' means team2 wins
            
            for outcome_str, prob in outcomes.items():
                if position < len(outcome_str):
                    if outcome_str[position] == '1':
                        team1_prob += prob
                    else:  # '0'
                        team2_prob += prob
            
            participant_team1_probs[name] = team1_prob
            participant_team2_probs[name] = team2_prob
        
        # Second pass: compute denominators (sum across all participants)
        # P(team1 wins) = sum of all participants' outcomes where team1 wins
        total_team1_prob = sum(participant_team1_probs.values())
        total_team2_prob = sum(participant_team2_probs.values())
        
        # Third pass: compute conditional probabilities
        # P(name wins/loses | team1 wins) = P(name wins/loses AND team1 wins) / P(team1 wins)
        for name in raw_outcomes.keys():
            if total_team1_prob > 0 or total_team2_prob > 0:
                team1_cond = participant_team1_probs[name] / total_team1_prob if total_team1_prob > 0 else 0.0
                team2_cond = participant_team2_probs[name] / total_team2_prob if total_team2_prob > 0 else 0.0
                game_prefs["preferences"][name] = {
                    "team1": team1_cond,
                    "team2": team2_cond
                }
            else:
                game_prefs["preferences"][name] = None
        
        preferences[game_key] = game_prefs
    
    return preferences


# =============================================================================
# BATCHED SIMULATION FUNCTIONS
# =============================================================================

def print_progress(current: int, total: int, prefix: str = "  Progress"):
    """Print a progress indicator."""
    if total < 1000:
        # For small totals, don't bother with progress
        return
    
    # Update every 1% or every 10000, whichever is more frequent
    interval = max(1, min(total // 100, 10000))
    if current % interval == 0 or current == total - 1:
        pct = (current + 1) / total * 100
        print(f"\r{prefix}: {current + 1:,}/{total:,} ({pct:.1f}%)", end='', flush=True)
        if current == total - 1:
            print()  # Newline at end


def generate_all_outcome_strings(
    num_remaining: int,
    use_monte_carlo: bool,
    all_outcomes_stratified: Optional[List[str]],
    num_simulations: int
) -> List[str]:
    """
    Generate all outcome strings for simulation.
    
    Args:
        num_remaining: Number of remaining games
        use_monte_carlo: Whether using Monte Carlo sampling
        all_outcomes_stratified: Pre-generated stratified outcomes (if Monte Carlo)
        num_simulations: Total number of simulations to run
        
    Returns:
        List of outcome strings (each string is num_remaining bits, '0' or '1')
    """
    if use_monte_carlo and all_outcomes_stratified is not None:
        return all_outcomes_stratified
    else:
        # Exhaustive enumeration
        results = []
        for i in range(num_simulations):
            results.append(format(i, f'0{num_remaining}b'))
            print_progress(i, num_simulations, "  Generating")
        return results


def calculate_all_outcome_probabilities(
    outcome_strings: List[str],
    results_bracket: dict,
    remaining_games: List[Tuple[str, int]],
    teams_data: dict,
    has_prob_data: bool,
    base_probability: float
) -> List[float]:
    """
    Calculate the probability of each outcome.
    Creates hypothetical brackets on the fly to avoid memory overhead.
    
    Args:
        outcome_strings: List of outcome strings
        results_bracket: The current results bracket
        remaining_games: List of (round_key, game_index) for remaining games
        teams_data: Team data with probability columns
        has_prob_data: Whether probability data is available
        base_probability: Uniform probability (1/total_outcomes) for fallback
        
    Returns:
        List of probabilities (one per outcome)
    """
    if has_prob_data:
        results = []
        total = len(outcome_strings)
        for i, outcome in enumerate(outcome_strings):
            # Create bracket on the fly, compute probability, let it be garbage collected
            hypo = create_hypothetical_bracket(results_bracket, remaining_games, outcome)
            results.append(calculate_outcome_probability(hypo, teams_data))
            print_progress(i, total, "  Calculating probs")
        return results
    else:
        return [base_probability] * len(outcome_strings)


def calculate_all_scores_batched(
    outcome_strings: List[str],
    results_bracket: dict,
    remaining_games: List[Tuple[str, int]],
    name_to_bracket: Dict[str, dict],
    teams_data: dict,
    apply_seed_bonus: bool,
    base_scores: Dict[str, int]
) -> Dict[str, List[int]]:
    """
    Calculate scores for all participants across all outcomes.
    Creates hypothetical brackets on the fly to avoid memory overhead.
    
    Args:
        outcome_strings: List of outcome strings
        results_bracket: The current results bracket
        remaining_games: List of (round_key, game_index) for remaining games
        name_to_bracket: Dict mapping participant name to their bracket
        teams_data: Team data for seed bonuses
        apply_seed_bonus: Whether to apply upset bonuses
        base_scores: Pre-computed base scores for each participant
        
    Returns:
        Dict mapping participant name to list of scores (one per outcome)
    """
    all_scores = {name: [] for name in name_to_bracket.keys()}
    total = len(outcome_strings)
    
    for i, outcome in enumerate(outcome_strings):
        # Create bracket on the fly, compute scores, let it be garbage collected
        hypo = create_hypothetical_bracket(results_bracket, remaining_games, outcome)
        for name, bracket in name_to_bracket.items():
            delta = compute_score_delta(hypo, bracket, teams_data, apply_seed_bonus, remaining_games)
            score = base_scores[name] + delta
            all_scores[name].append(score)
        print_progress(i, total, "  Scoring outcomes")
    
    return all_scores


def determine_winners_and_losers(
    all_scores: Dict[str, List[int]],
    num_outcomes: int
) -> Tuple[List[str], List[str], List[List[Tuple[str, int]]]]:
    """
    Determine who won and who lost each outcome.
    
    Args:
        all_scores: Dict mapping participant name to list of scores
        num_outcomes: Number of outcomes
        
    Returns:
        Tuple of:
        - winners: List of winner names (one per outcome)
        - losers: List of loser names (one per outcome)
        - all_sorted_scores: List of sorted [(name, score), ...] for each outcome
    """
    participants = list(all_scores.keys())
    winners = []
    losers = []
    all_sorted_scores = []
    
    for i in range(num_outcomes):
        # Get scores for this outcome
        scores_for_outcome = [(name, all_scores[name][i]) for name in participants]
        
        # Sort by score descending
        sorted_scores = sorted(scores_for_outcome, key=lambda x: x[1], reverse=True)
        
        winners.append(sorted_scores[0][0])  # First place
        losers.append(sorted_scores[-1][0])  # Last place
        all_sorted_scores.append(sorted_scores)
        print_progress(i, num_outcomes, "  Sorting outcomes")
    
    return winners, losers, all_sorted_scores


def accumulate_results(
    outcome_strings: List[str],
    outcome_probabilities: List[float],
    winners: List[str],
    losers: List[str],
    all_sorted_scores: List[List[Tuple[str, int]]],
    participants: List[str]
) -> Tuple[
    float,  # total_probability_sum
    Dict[str, float],  # win_probability_sum
    Dict[str, float],  # lose_probability_sum
    Dict[str, float],  # place_probability_sum
    Dict[str, Dict[str, float]],  # raw_winning_outcomes
    Dict[str, Dict[str, float]]   # raw_losing_outcomes
]:
    """
    Accumulate results from all simulations.
    
    Args:
        outcome_strings: List of outcome strings
        outcome_probabilities: List of probabilities
        winners: List of winner names per outcome
        losers: List of loser names per outcome
        all_sorted_scores: Sorted scores for each outcome
        participants: List of participant names
        
    Returns:
        Tuple of accumulated results
    """
    total_probability_sum = 0.0
    win_probability_sum = {name: 0.0 for name in participants}
    lose_probability_sum = {name: 0.0 for name in participants}
    place_probability_sum = {name: 0.0 for name in participants}
    raw_winning_outcomes = {name: {} for name in participants}
    raw_losing_outcomes = {name: {} for name in participants}
    
    num_outcomes = len(outcome_strings)
    
    for i, (outcome, prob) in enumerate(zip(outcome_strings, outcome_probabilities)):
        total_probability_sum += prob
        
        # Record winner
        winner = winners[i]
        win_probability_sum[winner] += prob
        if outcome not in raw_winning_outcomes[winner]:
            raw_winning_outcomes[winner][outcome] = prob
        else:
            raw_winning_outcomes[winner][outcome] += prob
        
        # Record loser
        loser = losers[i]
        lose_probability_sum[loser] += prob
        if outcome not in raw_losing_outcomes[loser]:
            raw_losing_outcomes[loser][outcome] = prob
        else:
            raw_losing_outcomes[loser][outcome] += prob
        
        # Record places for average calculation
        sorted_scores = all_sorted_scores[i]
        for place, (name, score) in enumerate(sorted_scores):
            place_probability_sum[name] += (place + 1) * prob
        
        print_progress(i, num_outcomes, "  Accumulating")
    
    return (
        total_probability_sum,
        win_probability_sum,
        lose_probability_sum,
        place_probability_sum,
        raw_winning_outcomes,
        raw_losing_outcomes
    )


def calculate_win_probabilities(
    results_path: str,
    brackets_dir: str,
    participants: List[str],
    teams_file: str,
    apply_seed_bonus: bool = True,
    max_simulations: Optional[int] = None,
    bonus_stars: Optional[Dict[str, int]] = None,
    max_scenarios: int = DEFAULT_MAX_SCENARIOS,
    enable_timing: bool = False
) -> Tuple[Dict[str, float], Dict[str, float], Dict[str, float], Dict[str, List], Dict[str, List], Dict, Dict, Optional[Dict]]:
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
        max_scenarios: Maximum number of scenarios to keep per participant (for both winning and losing)
        enable_timing: Whether to track timing of each step
    
    Returns:
        Tuple of (win_probabilities, lose_probabilities, average_places, winning_scenarios, losing_scenarios, next_game_prefs, next_game_lose_prefs, timing_data)
        timing_data is None if enable_timing is False
    """
    # Initialize timing data
    timing_data = {} if enable_timing else None
    
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
        loser = sorted_scores[-1][0]
        win_probabilities = {name: (1.0 if name == winner else 0.0) for name in name_to_bracket.keys()}
        lose_probabilities = {name: (1.0 if name == loser else 0.0) for name in name_to_bracket.keys()}
        average_places = {name: float(i + 1) for i, (name, _) in enumerate(sorted_scores)}
        return win_probabilities, lose_probabilities, average_places, {}, {}, {}, {}, None  # Empty scenarios and prefs since tournament is over
    
    # Determine simulation approach
    total_possible = 2 ** num_remaining
    use_monte_carlo = max_simulations is not None and total_possible > max_simulations
    
    # Find next games (games where both teams are known) using existing function
    next_games_full = find_next_games(results_bracket)  # Returns (round_key, game_index, team1, team2)
    next_games_list = [(rk, gi) for rk, gi, _, _ in next_games_full]  # Just need (round_key, game_index)
    num_next_games = len(next_games_list)
    
    # Find remaining teams (for champion stratification)
    remaining_teams = find_remaining_teams(results_bracket)
    num_remaining_teams = len(remaining_teams)
    
    print(f"Next games (ready to play): {num_next_games}")
    for rk, gi, t1, t2 in next_games_full:
        t1_name = get_team_name(t1) if t1 else "TBD"
        t2_name = get_team_name(t2) if t2 else "TBD"
        print(f"  {rk} game {gi}: {t1_name} vs {t2_name}")
    print(f"Remaining teams: {num_remaining_teams}")
    print(f"  {remaining_teams}")
    
    if use_monte_carlo:
        num_simulations = max_simulations
        print(f"Total possible outcomes: {total_possible:,}")
        print(f"Using Monte Carlo sampling with {num_simulations:,} simulations")
        
        # Determine stratification approach
        total_next_combos = 2 ** num_next_games
        min_next_stratified = int(num_simulations * 0.25)  # Always at least 25%
        
        if total_next_combos < min_next_stratified:
            # Few next-game combos - multiple simulations per combo to reach 25%
            # Next game stratified: 25% of M (multiple sims per combo)
            # Champion stratified: 12.5% of M (half of next game)
            # Random: 62.5% of M
            num_next_stratified = min_next_stratified
            num_champion_stratified = min_next_stratified // 2
            num_random = num_simulations - num_next_stratified - num_champion_stratified
            sims_per_combo = num_next_stratified // total_next_combos
            print(f"Stratification: {sims_per_combo} sims per next-game combo ({total_next_combos} combos)")
        elif total_next_combos < 2 * num_simulations:
            # Can enumerate all next-game combinations (one per combo)
            # Next game stratified: 2^N outcomes (one per combination)
            # Champion stratified: 2^N / 2 outcomes
            # Random: remainder
            num_next_stratified = total_next_combos
            num_champion_stratified = total_next_combos // 2
            num_random = max(0, num_simulations - num_next_stratified - num_champion_stratified)
            print(f"Stratification: enumerate all {total_next_combos} next-game combos (1 sim each)")
        else:
            # Too many next-game combinations to enumerate
            # Use percentage-based stratification: 25% next-game, 15% champion, 60% random
            num_next_stratified = int(num_simulations * 0.25)
            num_champion_stratified = int(num_simulations * 0.15)
            num_random = num_simulations - num_next_stratified - num_champion_stratified
            print(f"Stratification: sampling (too many next-game combos: {total_next_combos:,})")
        
        print(f"  Next-game stratified: {num_next_stratified:,}")
        print(f"  Champion stratified: {num_champion_stratified:,}")
        print(f"  Random: {num_random:,}")
        
        # Store stratification params for Step 1
        stratification_params = {
            'num_champion_stratified': num_champion_stratified,
            'num_next_stratified': num_next_stratified,
            'num_random': num_random,
            'num_per_team': max(1, num_champion_stratified // num_remaining_teams) if num_remaining_teams > 0 else 0,
            'remaining_teams': remaining_teams,
            'next_games_list': next_games_list,
        }
        
    else:
        num_simulations = total_possible
        stratification_params = None  # Will generate sequentially
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
    
    # Precompute base scores for each participant (scores from already-decided games)
    print("Precomputing base scores...")
    base_scores = compute_base_scores(results_bracket, name_to_bracket, teams_data, apply_seed_bonus, bonus_stars)
    for name, score in base_scores.items():
        print(f"  {name}: {score} points (locked in)")
    
    # ==========================================================================
    # BATCHED SIMULATION
    # ==========================================================================
    
    participants = list(name_to_bracket.keys())
    
    # Step 1: Generate all outcome strings
    print("\nStep 1: Generating outcome strings...")
    t_start = time.time()
    
    if use_monte_carlo and stratification_params:
        # Generate stratified outcomes
        print("  Generating stratified outcomes...")
        
        # Champion stratified outcomes
        num_per_team = stratification_params['num_per_team']
        champion_outcomes = generate_champion_stratified_outcomes(
            results_bracket, remaining_games, stratification_params['remaining_teams'], num_per_team
        ) if num_per_team > 0 else []
        print(f"    Champion stratified: {len(champion_outcomes):,} outcomes")
        
        # Next-game stratified outcomes
        next_game_outcomes = generate_next_game_stratified_outcomes(
            results_bracket, remaining_games, stratification_params['next_games_list'], 
            stratification_params['num_next_stratified']
        ) if stratification_params['num_next_stratified'] > 0 else []
        print(f"    Next-game stratified: {len(next_game_outcomes):,} outcomes")
        
        # Random outcomes
        num_random = stratification_params['num_random']
        random_outcomes = [generate_random_outcome(num_remaining) for _ in range(num_random)]
        print(f"    Random: {len(random_outcomes):,} outcomes")
        
        # Combine all outcomes
        outcome_strings = champion_outcomes + next_game_outcomes + random_outcomes
        num_simulations = len(outcome_strings)
        print(f"  Total after stratification: {num_simulations:,}")
    else:
        # Exhaustive enumeration
        outcome_strings = generate_all_outcome_strings(
            num_remaining, use_monte_carlo, None, num_simulations
        )
    
    # Build mapping for full 63-bit expansion
    print("  Building full bitstring mapping...")
    base_bits, decided_positions = build_decided_games_bits(results_bracket)
    remaining_bit_positions = build_remaining_games_bit_mapping(remaining_games)
    print(f"    Decided games: {len(decided_positions)} bits, Remaining games: {len(remaining_bit_positions)} bits")
    
    # Expand to full 63-bit strings
    print("  Expanding to full 63-bit strings...")
    full_outcome_strings = expand_all_to_full_bitstrings(
        outcome_strings, base_bits, remaining_bit_positions
    )
    
    t_step1 = time.time() - t_start
    print(f"  Generated {len(outcome_strings):,} short + {len(full_outcome_strings):,} full outcome strings in {t_step1:.2f}s")
    if enable_timing:
        timing_data['step1_generate_outcomes'] = t_step1
    
    # Step 2: Calculate probability of each outcome
    # (creates hypothetical brackets on the fly to save memory)
    print("Step 2: Calculating outcome probabilities...")
    t_start = time.time()
    outcome_probabilities = calculate_all_outcome_probabilities(
        outcome_strings, results_bracket, remaining_games,
        teams_data, has_prob_data, base_probability
    )
    t_step2 = time.time() - t_start
    print(f"  Calculated {len(outcome_probabilities):,} probabilities")
    if enable_timing:
        timing_data['step2_calculate_probabilities'] = t_step2
    
    # Step 3: Calculate scores for all participants across all outcomes
    # (creates hypothetical brackets on the fly to save memory)
    print("Step 3: Calculating all scores...")
    t_start = time.time()
    all_scores = calculate_all_scores_batched(
        outcome_strings, results_bracket, remaining_games,
        name_to_bracket, teams_data, apply_seed_bonus, base_scores
    )
    t_step3 = time.time() - t_start
    print(f"  Calculated scores for {len(all_scores)} participants across {len(outcome_strings):,} outcomes")
    if enable_timing:
        timing_data['step3_calculate_scores'] = t_step3
    
    # Step 4: Determine winners and losers
    print("Step 4: Determining winners and losers...")
    t_start = time.time()
    winners, losers, all_sorted_scores = determine_winners_and_losers(
        all_scores, len(outcome_strings)
    )
    t_step4 = time.time() - t_start
    print(f"  Processed {len(winners):,} outcomes")
    if enable_timing:
        timing_data['step4_determine_winners'] = t_step4
    
    # Step 5: Accumulate results
    print("Step 5: Accumulating results...")
    t_start = time.time()
    (
        total_probability_sum,
        win_probability_sum,
        lose_probability_sum,
        place_probability_sum,
        raw_winning_outcomes,
        raw_losing_outcomes
    ) = accumulate_results(
        outcome_strings, outcome_probabilities, winners, losers, 
        all_sorted_scores, participants
    )
    t_step5 = time.time() - t_start
    print(f"  Total probability sum: {total_probability_sum:.6f}")
    if enable_timing:
        timing_data['step5_accumulate_results'] = t_step5
        timing_data['num_simulations'] = len(outcome_strings)
    
    # Normalize probabilities (they should sum to 1, but might not due to floating point)
    if total_probability_sum > 0:
        normalization_factor = 1.0 / total_probability_sum
    else:
        normalization_factor = 1.0
    
    # Calculate win/lose probabilities and average places
    win_probabilities = {}
    lose_probabilities = {}
    average_places = {}
    
    print("\nResults:")
    print("-" * 70)
    if use_monte_carlo:
        print(f"(Estimated from {num_simulations:,} Monte Carlo samples)")
    if has_prob_data:
        print(f"(Weighted by team probability data, total prob sum: {total_probability_sum:.6f})")
    
    for name in sorted(name_to_bracket.keys(), key=lambda n: win_probability_sum[n], reverse=True):
        win_prob = win_probability_sum[name] * normalization_factor
        lose_prob = lose_probability_sum[name] * normalization_factor
        avg_place = place_probability_sum[name] * normalization_factor  # Weighted average
        
        win_probabilities[name] = win_prob
        lose_probabilities[name] = lose_prob
        average_places[name] = avg_place
        
        num_win_raw = len(raw_winning_outcomes.get(name, {}))
        num_lose_raw = len(raw_losing_outcomes.get(name, {}))
        print(f"{name}: {win_prob*100:.2f}% win, {lose_prob*100:.2f}% lose, avg place: {avg_place:.2f}, "
              f"{num_win_raw} win/{num_lose_raw} lose outcomes")
    
    # Normalize raw outcome probabilities too
    for name in raw_winning_outcomes:
        for outcome in raw_winning_outcomes[name]:
            raw_winning_outcomes[name][outcome] *= normalization_factor
    for name in raw_losing_outcomes:
        for outcome in raw_losing_outcomes[name]:
            raw_losing_outcomes[name][outcome] *= normalization_factor
    
    # Compute next game preferences (before merging)
    print("\nComputing next game preferences...")
    next_games = find_next_games(results_bracket)
    print(f"  Found {len(next_games)} next games")
    
    # Compute win preferences
    next_game_prefs = compute_next_game_preferences(
        raw_winning_outcomes,
        remaining_games,
        next_games,
        results_bracket,
        outcome_type="winning"
    )
    
    # Compute lose preferences
    next_game_lose_prefs = compute_next_game_preferences(
        raw_losing_outcomes,
        remaining_games,
        next_games,
        results_bracket,
        outcome_type="losing"
    )
    
    # Step 6: Process/merge outcomes and generate final brackets
    print("\nStep 6: Merging and generating final brackets...")
    t_start = time.time()
    
    # Process winning outcomes: merge similar ones and keep top N
    print("  Processing winning scenarios...")
    processed_winning = process_outcomes(
        raw_winning_outcomes, 
        results_bracket, 
        remaining_games, 
        max_scenarios,
        outcome_type="winning"
    )
    
    # Process losing outcomes: merge similar ones and keep top N
    print("  Processing losing scenarios...")
    processed_losing = process_outcomes(
        raw_losing_outcomes, 
        results_bracket, 
        remaining_games, 
        max_scenarios,
        outcome_type="losing"
    )
    
    t_step6 = time.time() - t_start
    if enable_timing:
        timing_data['step6_merge_and_generate'] = t_step6
    
    return win_probabilities, lose_probabilities, average_places, processed_winning, processed_losing, next_game_prefs, next_game_lose_prefs, timing_data


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
    parser.add_argument('--max-scenarios', type=int, default=DEFAULT_MAX_SCENARIOS,
                       help=f'Maximum scenarios to keep per participant (for both winning and losing). Default: {DEFAULT_MAX_SCENARIOS}')
    parser.add_argument('--seed', type=int, default=None, help='Random seed for reproducible results')
    parser.add_argument('--config', default=None, help='Path to scoring-config.json file')
    parser.add_argument('--star-bonuses', default=None, help='Path to starBonuses.json file')
    parser.add_argument('--timing', action='store_true', help='Enable timing profiling of simulation steps')
    parser.add_argument('--timing-output', default='timing_results.csv', help='Output CSV file for timing results')
    
    args = parser.parse_args()
    
    # Load scoring configuration
    load_scoring_config(args.config)
    
    # Set random seed if provided
    if args.seed is not None:
        random.seed(args.seed)
        print(f"Using random seed: {args.seed}")
    
    # Load seed probabilities from default location
    load_seed_probabilities()
    print(f"Probability method: {SEED_PROB_METHOD}")
    
    # Load star bonuses if provided
    bonus_stars = {}
    if args.star_bonuses:
        bonus_stars = load_star_bonuses(args.star_bonuses, args.config)
    else:
        # Try to find starBonuses.json in same directory as results
        results_dir = os.path.dirname(args.results)
        default_star_path = os.path.join(results_dir, 'starBonuses.json')
        if os.path.exists(default_star_path):
            bonus_stars = load_star_bonuses(default_star_path, args.config)
    
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
    
    print(f"\nCalculating win probabilities for {len(participants)} participants...")
    print(f"Participants: {participants}")
    
    # Convert bonus_stars keys to match participant names (case-insensitive lookup)
    participant_bonuses = {}
    for name in participants:
        name_lower = name.lower()
        if name_lower in bonus_stars:
            participant_bonuses[name] = bonus_stars[name_lower]
    
    if participant_bonuses:
        print(f"Star bonuses applied: {participant_bonuses}")
    
    # Calculate probabilities
    (win_probabilities, lose_probabilities, average_places, 
     winning_scenarios, losing_scenarios, next_game_prefs, next_game_lose_prefs, timing_data) = calculate_win_probabilities(
        results_path=args.results,
        brackets_dir=args.brackets_dir,
        participants=participants,
        teams_file=args.teams or '',
        apply_seed_bonus=not args.no_seed_bonus,
        max_simulations=args.max_simulations,
        max_scenarios=args.max_scenarios,
        bonus_stars=participant_bonuses,
        enable_timing=args.timing
    )
    
    # Save to JSON (include all probabilities, scenarios, and preferences)
    output_data = {
        'win_probabilities': win_probabilities,
        'lose_probabilities': lose_probabilities,
        'average_places': average_places,
        'winning_scenarios': winning_scenarios,
        'losing_scenarios': losing_scenarios,
        'next_game_preferences': next_game_prefs,
        'next_game_lose_preferences': next_game_lose_prefs
    }
    
    with open(args.output, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"\nResults saved to {args.output}")
    
    # Write timing results if enabled
    if args.timing and timing_data:
        num_sims = timing_data.get('num_simulations', 1)
        
        # Calculate totals
        step_times = {
            'step1_generate_outcomes': timing_data.get('step1_generate_outcomes', 0),
            'step2_calculate_probabilities': timing_data.get('step2_calculate_probabilities', 0),
            'step3_calculate_scores': timing_data.get('step3_calculate_scores', 0),
            'step4_determine_winners': timing_data.get('step4_determine_winners', 0),
            'step5_accumulate_results': timing_data.get('step5_accumulate_results', 0),
            'step6_merge_and_generate': timing_data.get('step6_merge_and_generate', 0),
        }
        total_time = sum(step_times.values())
        
        # Prepare CSV rows
        step_names = {
            'step1_generate_outcomes': 'generate_all_outcome_strings',
            'step2_calculate_probabilities': 'calculate_all_outcome_probabilities',
            'step3_calculate_scores': 'calculate_all_scores_batched',
            'step4_determine_winners': 'determine_winners_and_losers',
            'step5_accumulate_results': 'accumulate_results',
            'step6_merge_and_generate': 'merge_and_generate_final_brackets',
        }
        
        rows = []
        for step_key, func_name in step_names.items():
            step_num = step_key.split('_')[0].replace('step', '')
            t = step_times[step_key]
            avg_ms = (t / num_sims) * 1000 if num_sims > 0 else 0
            pct = (t / total_time * 100) if total_time > 0 else 0
            rows.append({
                'Step': step_num,
                'Function': func_name,
                'Total Time (s)': f'{t:.4f}',
                'Avg Time/Sim (ms)': f'{avg_ms:.6f}',
                '% of Total': f'{pct:.1f}%'
            })
        
        # Add total row
        avg_total_ms = (total_time / num_sims) * 1000 if num_sims > 0 else 0
        rows.append({
            'Step': 'Total',
            'Function': '',
            'Total Time (s)': f'{total_time:.4f}',
            'Avg Time/Sim (ms)': f'{avg_total_ms:.6f}',
            '% of Total': '100.0%'
        })
        
        # Write CSV
        with open(args.timing_output, 'w', newline='') as f:
            fieldnames = ['Step', 'Function', 'Total Time (s)', 'Avg Time/Sim (ms)', '% of Total']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        
        print(f"Timing results saved to {args.timing_output}")
        
        # Also print timing summary
        print("\n" + "=" * 70)
        print("TIMING SUMMARY")
        print("=" * 70)
        print(f"{'Step':<6} {'Function':<40} {'Time (s)':<12} {'Avg (ms)':<12} {'%':<8}")
        print("-" * 70)
        for row in rows:
            print(f"{row['Step']:<6} {row['Function']:<40} {row['Total Time (s)']:<12} {row['Avg Time/Sim (ms)']:<12} {row['% of Total']:<8}")
        print("=" * 70)


if __name__ == '__main__':
    main()