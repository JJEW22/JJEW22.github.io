#!/usr/bin/env python3
"""
Compute star bonus awards for March Madness bracket competition.

This script reads starBonuses.json, determines which awards are eligible to be
computed based on the current tournament round, and runs solver functions for each.

Usage:
    python computeStarBonuses.py
    python computeStarBonuses.py --round 3          # Override auto-detected round
    python computeStarBonuses.py --halfway           # Also compute halfway awards for current round
    python computeStarBonuses.py --force             # Compute all awards regardless of round
    python computeStarBonuses.py --dry-run           # Print what would be computed without writing
"""

import json
import os
import sys
import re
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple

# Configuration
YEAR = 2026
BASE_PATH = Path(f"./{YEAR}")
STAR_BONUSES_FILE = BASE_PATH / "starBonuses.json"
RESULTS_BRACKET_FILE = BASE_PATH / f"results-bracket-march-madness-{YEAR}.json"
PARTICIPANTS_FILE = BASE_PATH / "participants.json"
BRACKETS_DIR = BASE_PATH / "brackets"
SCORING_CONFIG_FILE = BASE_PATH / "scoring-config.json"
TEAMS_FILE = BASE_PATH / f"ThisYearTeams{YEAR}.csv"
WIN_PROBABILITIES_DIR = BASE_PATH / "winProbabilities"
WIN_PROBABILITIES_FILE = BASE_PATH / "winProbabilities.json"

# Round keys matching bracket structure
ROUND_KEYS = ['round1', 'round2', 'round3', 'round4', 'round5', 'round6']


# =============================================================================
# Data Loading
# =============================================================================

def load_json(filepath: Path) -> Any:
    """Load a JSON file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(filepath: Path, data: Any):
    """Save data to a JSON file."""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    print(f"  Saved to {filepath}")


def load_results_bracket() -> dict:
    """Load the results bracket."""
    if not RESULTS_BRACKET_FILE.exists():
        print(f"Error: Results bracket not found at {RESULTS_BRACKET_FILE}")
        sys.exit(1)
    return load_json(RESULTS_BRACKET_FILE)


def load_participants() -> Dict[str, Optional[str]]:
    """
    Load participants. Supports both formats:
    - Array: ["alice", "bob"]
    - Object: {"alice": "Bracket Name", "bob": null}
    
    Returns dict of submitter_name -> display_name
    """
    if not PARTICIPANTS_FILE.exists():
        print(f"Error: Participants file not found at {PARTICIPANTS_FILE}")
        sys.exit(1)
    
    data = load_json(PARTICIPANTS_FILE)

    for name in EXCLUDED_NAMES:
        del data[name]

    if isinstance(data, list):
        return {name: name for name in data}
    elif isinstance(data, dict):
        return {name: display or name for name, display in data.items()}
    else:
        print(f"Error: Unexpected participants format")
        sys.exit(1)


def load_all_brackets(participants: Dict[str, str]) -> Dict[str, dict]:
    """
    Load all participant brackets. Tries multiple case variants.
    
    Returns dict of submitter_name -> bracket_data
    """
    brackets = {}
    
    for name in participants:
        bracket = load_bracket_for_participant(name)
        if bracket:
            brackets[name] = bracket
        else:
            print(f"  Warning: No bracket found for {name}")
    
    return brackets


def load_bracket_for_participant(name: str) -> Optional[dict]:
    """Load a bracket for a participant, trying case variants."""
    variants = [name]
    lower = name.lower()
    capitalized = name[0].upper() + name[1:].lower() if name else name
    
    if lower != name:
        variants.append(lower)
    if capitalized != name and capitalized != lower:
        variants.append(capitalized)
    
    for variant in variants:
        for title in ['bracket-march-madness', 'march-madness-bracket']:
            for ext in ['.json', '.xlsx']:
                filepath = BRACKETS_DIR / f"{variant}-{title}-{YEAR}{ext}"
                if filepath.exists():
                    if ext == '.json':
                        try:
                            return load_json(filepath)
                        except Exception as e:
                            print(f"  Error loading {filepath}: {e}")
                    elif ext == '.xlsx':
                        print(f"  Warning: Excel loading not implemented in this script for {filepath}")
                        # Could add openpyxl-based loading here
    
    return None


def load_scoring_config() -> dict:
    """Load the scoring configuration."""
    if not SCORING_CONFIG_FILE.exists():
        print(f"Warning: Scoring config not found at {SCORING_CONFIG_FILE}")
        return {}
    return load_json(SCORING_CONFIG_FILE)


def load_teams() -> List[dict]:
    """Load teams from CSV."""
    import csv
    teams = []
    if not TEAMS_FILE.exists():
        print(f"Warning: Teams file not found at {TEAMS_FILE}")
        return teams
    
    with open(TEAMS_FILE, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get('Team') or row.get('TEAM') or row.get('name')
            seed = row.get('Seed') or row.get('SEED') or row.get('seed', '0')
            region = row.get('Region') or row.get('REGION') or row.get('region', '')
            if name:
                teams.append({
                    'name': name,
                    'seed': int(seed) if seed else 0,
                    'region': region
                })
    return teams


def load_win_probabilities() -> dict:
    """
    Load the latest win probabilities data.
    Looks in winProbabilities directory for files named winProbabilities_X.json
    where X is a round number (0, 0.5, 1, 1.5, etc.)
    Falls back to single winProbabilities.json file.
    
    Returns dict with keys: win_probabilities, lose_probabilities,
    average_places, winning_scenarios, losing_scenarios, etc.
    """
    # Try directory first - find the highest numbered snapshot
    if WIN_PROBABILITIES_DIR.exists():
        json_files = sorted(WIN_PROBABILITIES_DIR.glob("winProbabilities_*.json"))
        if json_files:
            # Sort by the numeric suffix (handles 0, 0.5, 1, 1.5, etc.)
            def get_round_num(filepath):
                stem = filepath.stem  # e.g. "winProbabilities_1.5"
                parts = stem.split('_')
                try:
                    return float(parts[-1])
                except (ValueError, IndexError):
                    return -1
            
            json_files.sort(key=get_round_num)
            latest = json_files[-1]
            print(f"  Loading latest from {latest}")
            return load_json(latest)
    
    # Fall back to single file
    if WIN_PROBABILITIES_FILE.exists():
        print(f"  Loading from {WIN_PROBABILITIES_FILE}")
        return load_json(WIN_PROBABILITIES_FILE)
    
    print(f"  Warning: No win probabilities found")
    return {}


def load_all_win_probabilities() -> Dict[float, dict]:
    """
    Load all historical win probability snapshots from the directory.
    Files are named winProbabilities_X.json where X is the round number.
    
    Returns dict of round_number (float) -> probability data, sorted chronologically.
    """
    all_probs = {}
    
    if WIN_PROBABILITIES_DIR.exists():
        for json_file in sorted(WIN_PROBABILITIES_DIR.glob("winProbabilities_*.json")):
            try:
                stem = json_file.stem
                parts = stem.split('_')
                round_num = float(parts[-1])
                all_probs[round_num] = load_json(json_file)
            except (ValueError, IndexError) as e:
                print(f"  Warning: Could not parse round number from {json_file}: {e}")
            except Exception as e:
                print(f"  Warning: Could not load {json_file}: {e}")
    
    if not all_probs and WIN_PROBABILITIES_FILE.exists():
        all_probs[0.0] = load_json(WIN_PROBABILITIES_FILE)
    
    return dict(sorted(all_probs.items()))


# =============================================================================
# Round Detection
# =============================================================================

def detect_current_round(results_bracket: dict) -> Tuple[int, bool, Dict[int, Tuple[int, int]]]:
    """
    Detect the current round from the results bracket.
    
    Returns:
        Tuple of (completed_round, is_halfway, round_status)
        - completed_round: The highest round where ALL games have winners (0 if none complete)
        - is_halfway: True if any future round has at least 1 game decided
        - round_status: Dict of round_num -> (decided_games, total_games)
    """
    last_complete_round = 0
    next_round_partial = False
    round_status = {}
    
    for round_num in range(1, 7):
        round_key = f"round{round_num}"
        games = results_bracket.get(round_key, [])
        
        if not games:
            round_status[round_num] = (0, 0)
            continue
        
        total_games = len(games)
        decided_games = sum(1 for g in games if g and g.get('winner'))
        round_status[round_num] = (decided_games, total_games)
        
        if decided_games == total_games:
            last_complete_round = round_num
        elif decided_games > 0:
            next_round_partial = True
    
    return last_complete_round, next_round_partial, round_status


def is_award_eligible(award: dict, completed_round: int, round_status: Dict[int, Tuple[int, int]], force: bool = False) -> Tuple[bool, str]:
    """
    Check if an award is eligible to be computed.
    
    Args:
        award: The award dict from starBonuses.json
        completed_round: Highest fully completed round
        round_status: Dict of round_num -> (decided_games, total_games)
        force: If True, always eligible
    
    Returns:
        Tuple of (eligible, reason)
    """
    if force:
        return True, "forced"
    
    if award.get('manual', False):
        return False, "manual award"
    
    award_round = award.get('round', 0)
    has_halfway = award.get('halfway', False)
    
    # Handle "unknown" round awards - these can be computed at any point
    if award_round == "unknown":
        return True, "always eligible (unknown round)"
    
    # Round 0 awards are pre-tournament
    if award_round == 0:
        return True, "pre-tournament award"
    
    if isinstance(award_round, str):
        try:
            award_round = int(award_round)
        except ValueError:
            return True, f"non-numeric round '{award_round}'"
    
    if has_halfway:
        # Halfway awards: eligible when at least 1 game in that round has been decided
        decided, total = round_status.get(award_round, (0, 0))
        if decided > 0:
            return True, f"halfway through round {award_round} ({decided}/{total} games decided)"
        else:
            return False, f"round {award_round} not yet started (0 games decided, completed: {completed_round})"
    else:
        # Regular awards: eligible when the round is fully complete
        if completed_round >= award_round:
            return True, f"round {award_round} complete"
        else:
            return False, f"round {award_round} not yet complete (completed: {completed_round})"


# =============================================================================
# Solver Registry
# =============================================================================

def get_solver_name(award_name: str) -> str:
    """
    Convert an award name to a solver function name.
    e.g. "Golden Boy" -> "golden_boy_solver"
         "Dom/Sub" -> "dom_sub_solver"
         "Down/Left/Up/Right" -> "down_left_up_right_solver"
    """
    # Replace / with _
    name = award_name.replace('/', '_')
    # Replace spaces and non-alphanumeric chars with _
    name = re.sub(r'[^a-zA-Z0-9]', '_', name)
    # Collapse multiple underscores
    name = re.sub(r'_+', '_', name)
    # Strip leading/trailing underscores and lowercase
    name = name.strip('_').lower()
    return f"{name}_solver"


def find_solver(solver_name: str):
    """
    Look up a solver function by name in this module.
    Returns the function if found, None otherwise.
    """
    return globals().get(solver_name)


# =============================================================================
# Solver Helper Functions
# =============================================================================

def get_winner_name(game):
    """Get winner name from a game dict."""
    if not game or not game.get('winner'):
        return None
    return game['winner'].get('name')


def get_team_name(team):
    """Get team name from a team dict."""
    if not team:
        return None
    return team.get('name')


def get_team_seed(team):
    """Get team seed from a team dict."""
    if not team:
        return 0
    return team.get('seed', 0)


def get_game_region(game_index, round_num):
    """Determine which region a game belongs to based on index and round."""
    if round_num >= 5:
        return None  # Final Four and Championship are cross-region
    games_per_region = {1: 8, 2: 4, 3: 2, 4: 1}
    gpr = games_per_region.get(round_num, 8)
    region_idx = game_index // gpr
    # Region order: 0=topLeft, 1=bottomLeft, 2=topRight, 3=bottomRight
    return region_idx


def compute_advancement_score(bracket, team_name):
    """
    Compute advancement score for a team in a bracket.
    1 point for surviving round 1, +2 for round 2, +3 for round 3, etc.
    """
    score = 0
    for round_num in range(1, 7):
        round_key = f"round{round_num}"
        games = bracket.get(round_key, [])
        for game in games:
            if game and get_winner_name(game) == team_name:
                score += round_num
                break
    # Check if they're the overall winner
    if bracket.get('winner') and get_team_name(bracket['winner']) == team_name:
        pass  # Already counted in round 6
    return score


def compute_bracket_similarity(bracket_a, bracket_b):
    """
    Compute similarity between two brackets using weighted advancement score.
    For each of the 63 games, if both brackets have the same winner,
    add the round number (1-6) to the similarity score.
    """
    score = 0
    for round_num in range(1, 7):
        round_key = f"round{round_num}"
        games_a = bracket_a.get(round_key, [])
        games_b = bracket_b.get(round_key, [])
        for i in range(min(len(games_a), len(games_b))):
            winner_a = get_winner_name(games_a[i]) if games_a[i] else None
            winner_b = get_winner_name(games_b[i]) if games_b[i] else None
            if winner_a and winner_b and winner_a == winner_b:
                score += round_num
    return score


def compute_region_score(results_bracket, picks_bracket, teams, config, region_idx):
    """
    Compute a participant's score from games in a specific region only.
    Uses the actual scoring formula (base points + underdog bonus).
    region_idx: 0-3 mapping to the four regions.
    """
    score_for_round = config.get('scoreForRound', [0, 10, 20, 30, 50, 80, 130])
    seed_factor = config.get('seedFactor', [0, 1, 2, 3, 4, 5, 6])
    total = 0
    
    for round_num in range(1, 5):  # Regions only apply through round 4 (Elite 8)
        round_key = f"round{round_num}"
        results_games = results_bracket.get(round_key, [])
        picks_games = picks_bracket.get(round_key, [])
        
        games_per_region = {1: 8, 2: 4, 3: 2, 4: 1}
        gpr = games_per_region[round_num]
        start_idx = region_idx * gpr
        end_idx = start_idx + gpr
        
        for game_idx in range(start_idx, min(end_idx, len(results_games))):
            if game_idx >= len(picks_games):
                break
            result_game = results_games[game_idx]
            pick_game = picks_games[game_idx]
            
            if not result_game or not pick_game:
                continue
            if not result_game.get('winner') or not pick_game.get('winner'):
                continue
            
            if get_winner_name(result_game) == get_winner_name(pick_game):
                # Base points
                total += score_for_round[round_num]
                
                # Underdog bonus
                team1_seed = get_team_seed(result_game.get('team1'))
                team2_seed = get_team_seed(result_game.get('team2'))
                winner_seed = get_team_seed(result_game.get('winner'))
                expected_seed = min(team1_seed, team2_seed)
                if winner_seed > expected_seed:
                    total += (winner_seed - expected_seed) * seed_factor[round_num]
    
    return total


def count_correct_picks_in_round(results_bracket, picks_bracket, round_num):
    """Count how many correct picks a participant has in a specific round."""
    round_key = f"round{round_num}"
    results_games = results_bracket.get(round_key, [])
    picks_games = picks_bracket.get(round_key, [])
    
    correct = 0
    for i in range(min(len(results_games), len(picks_games))):
        r = results_games[i]
        p = picks_games[i]
        if r and p and get_winner_name(r) and get_winner_name(p):
            if get_winner_name(r) == get_winner_name(p):
                correct += 1
    return correct


def compute_total_score(results_bracket, picks_bracket, teams_list, config):
    """Compute total score for a bracket (base + underdog + star points not included here)."""
    score_for_round = config.get('scoreForRound', [0, 10, 20, 30, 50, 80, 130])
    seed_factor = config.get('seedFactor', [0, 1, 2, 3, 4, 5, 6])
    total = 0
    underdog = 0
    correct = 0
    
    for round_num in range(1, 7):
        round_key = f"round{round_num}"
        results_games = results_bracket.get(round_key, [])
        picks_games = picks_bracket.get(round_key, [])
        
        for i in range(min(len(results_games), len(picks_games))):
            r = results_games[i]
            p = picks_games[i]
            if r and p and get_winner_name(r) and get_winner_name(p):
                if get_winner_name(r) == get_winner_name(p):
                    total += score_for_round[round_num]
                    correct += 1
                    
                    team1_seed = get_team_seed(r.get('team1'))
                    team2_seed = get_team_seed(r.get('team2'))
                    winner_seed = get_team_seed(r.get('winner'))
                    expected_seed = min(team1_seed, team2_seed)
                    if winner_seed > expected_seed:
                        bonus = (winner_seed - expected_seed) * seed_factor[round_num]
                        total += bonus
                        underdog += bonus
    
    return total, underdog, correct


def compute_max_possible_score(picks_bracket, teams_list, config):
    """Compute the maximum possible score if all picks were correct."""
    score_for_round = config.get('scoreForRound', [0, 10, 20, 30, 50, 80, 130])
    seed_factor = config.get('seedFactor', [0, 1, 2, 3, 4, 5, 6])
    total = 0
    
    for round_num in range(1, 7):
        round_key = f"round{round_num}"
        games = picks_bracket.get(round_key, [])
        
        for game in games:
            if not game or not game.get('winner'):
                continue
            total += score_for_round[round_num]
            
            team1_seed = get_team_seed(game.get('team1'))
            team2_seed = get_team_seed(game.get('team2'))
            winner_seed = get_team_seed(game.get('winner'))
            expected_seed = min(team1_seed, team2_seed) if team1_seed and team2_seed else 0
            if winner_seed > expected_seed:
                total += (winner_seed - expected_seed) * seed_factor[round_num]
    
    return total


def compute_max_underdog_points(picks_bracket, config):
    """Compute the maximum possible underdog bonus points for a bracket."""
    seed_factor = config.get('seedFactor', [0, 1, 2, 3, 4, 5, 6])
    total = 0
    
    for round_num in range(1, 7):
        round_key = f"round{round_num}"
        games = picks_bracket.get(round_key, [])
        
        for game in games:
            if not game or not game.get('winner'):
                continue
            team1_seed = get_team_seed(game.get('team1'))
            team2_seed = get_team_seed(game.get('team2'))
            winner_seed = get_team_seed(game.get('winner'))
            expected_seed = min(team1_seed, team2_seed) if team1_seed and team2_seed else 0
            if winner_seed > expected_seed:
                total += (winner_seed - expected_seed) * seed_factor[round_num]
    
    return total


# =============================================================================
# Solver Functions
# =============================================================================

def golden_boy_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Golden Boy: person with the most possible points (max potential score) at the start."""
    scores = {}
    for name, bracket in participant_brackets.items():
        scores[name] = compute_max_possible_score(bracket, teams, config)
    
    if not scores:
        return None
    
    max_score = max(scores.values())
    winners = [name for name, s in scores.items() if s == max_score]
    return {'winners': winners, 'scores': scores}


def shortest_stick_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Shortest Stick: manual award."""
    return None


def nerd_or_loner_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Nerd or Loner: manual award."""
    return None


def best_friends_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Best Friends: pair of people with the most similar brackets (weighted by round)."""
    names = list(participant_brackets.keys())
    if len(names) < 2:
        return None
    
    best_sim = -1
    best_pair = None
    all_scores = {}
    
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            sim = compute_bracket_similarity(participant_brackets[names[i]], participant_brackets[names[j]])
            pair_key = f"{names[i]} & {names[j]}"
            all_scores[pair_key] = sim
            if sim > best_sim:
                best_sim = sim
                best_pair = [names[i], names[j]]
    
    return {'winners': best_pair, 'scores': all_scores}


def dom_sub_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Dom/Sub: person whose winning most implies someone else's losing.
    Uses winning/losing scenarios from win probabilities."""
    if not win_prob_data:
        print("    Need win probability data")
        return None
    
    win_probs = win_prob_data.get('win_probabilities', {})
    lose_probs = win_prob_data.get('lose_probabilities', {})
    winning_scenarios = win_prob_data.get('winning_scenarios', {})
    losing_scenarios = win_prob_data.get('losing_scenarios', {})
    
    if not winning_scenarios or not losing_scenarios:
        print("    Need winning and losing scenarios")
        return None
    
    # For each pair (A, B), compute: P(B loses | A wins)
    # = P(A wins AND B loses) / P(A wins)
    # Approximate by checking overlap in scenarios
    best_dom = None
    best_sub = None
    best_correlation = -1
    all_scores = {}
    
    names = list(participant_brackets.keys())
    for dom_name in names:
        dom_win_prob = win_probs.get(dom_name, 0)
        if dom_win_prob == 0:
            continue
        
        dom_scenarios = set()
        for s in winning_scenarios.get(dom_name, []):
            dom_scenarios.add(s.get('outcome', ''))
        
        for sub_name in names:
            if sub_name == dom_name:
                continue
            
            sub_lose_scenarios = set()
            for s in losing_scenarios.get(sub_name, []):
                sub_lose_scenarios.add(s.get('outcome', ''))
            
            # Overlap: scenarios where dom wins AND sub loses
            overlap = dom_scenarios & sub_lose_scenarios
            overlap_prob = sum(
                s.get('probability', 0) 
                for s in winning_scenarios.get(dom_name, []) 
                if s.get('outcome', '') in overlap
            )
            
            correlation = overlap_prob / dom_win_prob if dom_win_prob > 0 else 0
            all_scores[f"{dom_name} -> {sub_name}"] = correlation
            
            if correlation > best_correlation:
                best_correlation = correlation
                best_dom = dom_name
                best_sub = sub_name
    
    if best_dom and best_sub:
        return {'winners': [[best_dom], [best_sub]], 'scores': all_scores}
    return None


def fallen_from_grace_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Fallen From Grace: worst ratio of round 2 correct picks / round 1 correct picks."""
    scores = {}
    for name, bracket in participant_brackets.items():
        r1_correct = count_correct_picks_in_round(results_bracket, bracket, 1)
        r2_correct = count_correct_picks_in_round(results_bracket, bracket, 2)
        
        if r1_correct > 0:
            ratio = r2_correct / r1_correct
        else:
            ratio = 0  # Had no round 1 picks correct
        scores[name] = ratio
    
    if not scores:
        return None
    
    min_ratio = min(scores.values())
    winners = [name for name, s in scores.items() if s == min_ratio]
    return {'winners': winners, 'scores': scores}


def fortified_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Fortified: person whose win probability changed the least from round 0 to now."""
    if not win_prob_history:
        print("    Need win probability history")
        return None
    
    sorted_rounds = sorted(win_prob_history.keys())
    if len(sorted_rounds) < 2:
        print("    Need at least 2 win probability snapshots")
        return None
    
    first_probs = win_prob_history[sorted_rounds[0]].get('win_probabilities', {})
    latest_probs = win_prob_history[sorted_rounds[-1]].get('win_probabilities', {})
    
    scores = {}
    for name in participant_brackets:
        initial = first_probs.get(name, 0)
        current = latest_probs.get(name, 0)
        change = abs(current - initial)
        scores[name] = change
    
    if not scores:
        return None
    
    min_change = min(scores.values())
    winners = [name for name, s in scores.items() if s == min_change]
    return {'winners': winners, 'scores': scores}


def cheater_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Cheater: highest advancement score for Kansas + Arkansas minus Missouri."""
    target_positive = ['Kansas', 'Arkansas']
    target_negative = ['Missouri']
    
    scores = {}
    for name, bracket in participant_brackets.items():
        score = 0
        for team in target_positive:
            score += compute_advancement_score(bracket, team)
        for team in target_negative:
            score -= compute_advancement_score(bracket, team)
        scores[name] = score
    
    if not scores:
        return None
    
    max_score = max(scores.values())
    winners = [name for name, s in scores.items() if s == max_score]
    return {'winners': winners, 'scores': scores}


def more_than_fair_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """More than fair: manual award (all named brackets)."""
    return None


def balanced_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Balanced: person who got closest to 50% of first round picks correct (closest to 16 out of 32)."""
    scores = {}
    for name, bracket in participant_brackets.items():
        correct = count_correct_picks_in_round(results_bracket, bracket, 1)
        distance_from_half = abs(correct - 16)
        scores[name] = distance_from_half
    
    if not scores:
        return None
    
    min_distance = min(scores.values())
    winners = [name for name, s in scores.items() if s == min_distance]
    
    # Also report actual correct counts
    detail_scores = {name: count_correct_picks_in_round(results_bracket, participant_brackets[name], 1) 
                     for name in participant_brackets}
    return {'winners': winners, 'scores': detail_scores}


def unicorn_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Unicorn: manual award (submitted something that never happened historically)."""
    return None


def the_independent_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """The Independent: lowest absolute score difference between East+South and West+Midwest regions."""
    # Region indices: 0=topLeft(East), 1=bottomLeft(South), 2=topRight(West), 3=bottomRight(Midwest)
    # Left half = East(0) + South(1), Right half = West(2) + Midwest(3)
    scores = {}
    for name, bracket in participant_brackets.items():
        left_score = compute_region_score(results_bracket, bracket, teams, config, 0) + \
                     compute_region_score(results_bracket, bracket, teams, config, 1)
        right_score = compute_region_score(results_bracket, bracket, teams, config, 2) + \
                      compute_region_score(results_bracket, bracket, teams, config, 3)
        diff = abs(left_score - right_score)
        scores[name] = diff
    
    if not scores:
        return None
    
    min_diff = min(scores.values())
    winners = [name for name, s in scores.items() if s == min_diff]
    return {'winners': winners, 'scores': scores}


def lone_wolf_sheep_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Lone wolf/sheep: bracket most and least similar to everyone else (weighted)."""
    names = list(participant_brackets.keys())
    if len(names) < 2:
        return None
    
    avg_similarity = {}
    for name in names:
        total_sim = 0
        for other in names:
            if other != name:
                total_sim += compute_bracket_similarity(participant_brackets[name], participant_brackets[other])
        avg_similarity[name] = total_sim / (len(names) - 1)
    
    # Wolf = least similar (lowest avg), Sheep = most similar (highest avg)
    min_sim = min(avg_similarity.values())
    max_sim = max(avg_similarity.values())
    wolves = [name for name, s in avg_similarity.items() if s == min_sim]
    sheep = [name for name, s in avg_similarity.items() if s == max_sim]
    
    return {'winners': wolves + sheep, 'scores': avg_similarity}


def another_life_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Another Life: person who got the most total correct picks."""
    scores = {}
    for name, bracket in participant_brackets.items():
        total_correct = 0
        for round_num in range(1, 7):
            total_correct += count_correct_picks_in_round(results_bracket, bracket, round_num)
        scores[name] = total_correct
    
    if not scores:
        return None
    
    max_correct = max(scores.values())
    winners = [name for name, s in scores.items() if s == max_correct]
    return {'winners': winners, 'scores': scores}


def pants_coin_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Pants Coin: least total game score differential for correctly picked games."""
    scores = {}
    for name, bracket in participant_brackets.items():
        total_diff = 0
        for round_num in range(1, 7):
            round_key = f"round{round_num}"
            results_games = results_bracket.get(round_key, [])
            picks_games = bracket.get(round_key, [])
            
            for i in range(min(len(results_games), len(picks_games))):
                r = results_games[i]
                p = picks_games[i]
                if r and p and get_winner_name(r) and get_winner_name(p):
                    if get_winner_name(r) == get_winner_name(p):
                        # Get actual game score margin
                        score1 = r.get('score1')
                        score2 = r.get('score2')
                        if score1 is not None and score2 is not None:
                            total_diff += abs(score1 - score2)
        scores[name] = total_diff
    
    if not scores:
        return None
    
    min_diff = min(scores.values())
    winners = [name for name, s in scores.items() if s == min_diff]
    return {'winners': winners, 'scores': scores}


def joever_hard_hat_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Joever/hard hat: first person whose win probability hits 0% (joever) or lose probability hits 0% (hard hat).
    Checks historical win probability snapshots."""
    if not win_prob_history:
        print("    Need win probability history")
        return None
    
    sorted_rounds = sorted(win_prob_history.keys())
    
    # Track first person to hit 0% win prob and first to hit 0% lose prob
    first_eliminated_win = None  # Joever - can't win anymore
    first_eliminated_lose = None  # Hard hat - can't lose anymore
    eliminated_win_round = None
    eliminated_lose_round = None
    
    for round_num in sorted_rounds:
        probs = win_prob_history[round_num]
        win_probs = probs.get('win_probabilities', {})
        lose_probs = probs.get('lose_probabilities', {})
        
        if not first_eliminated_win:
            for name in participant_brackets:
                wp = win_probs.get(name)
                if wp is not None and wp == 0.0:
                    first_eliminated_win = name
                    eliminated_win_round = round_num
                    break
        
        if not first_eliminated_lose:
            for name in participant_brackets:
                lp = lose_probs.get(name)
                if lp is not None and lp == 0.0:
                    first_eliminated_lose = name
                    eliminated_lose_round = round_num
                    break
    
    winners = []
    score_info = {}
    if first_eliminated_win:
        winners.append(first_eliminated_win)
        score_info[f"joever ({first_eliminated_win})"] = f"round {eliminated_win_round}"
    if first_eliminated_lose:
        winners.append(first_eliminated_lose)
        score_info[f"hard hat ({first_eliminated_lose})"] = f"round {eliminated_lose_round}"
    
    if winners:
        return {'winners': winners, 'scores': score_info}
    return None


def flash_flash_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Flash/Flash: first and last to reach 750 total points.
    Checks score at each historical snapshot to determine order."""
    if not win_prob_history:
        print("    Need win probability history to determine score progression")
        return None
    
    TARGET = 750
    
    # Compute current scores
    current_scores = {}
    for name, bracket in participant_brackets.items():
        total, _, _ = compute_total_score(results_bracket, bracket, teams, config)
        current_scores[name] = total
    
    # Check who has reached 750
    reached = {name: score for name, score in current_scores.items() if score >= TARGET}
    
    if not reached:
        print(f"    No one has reached {TARGET} points yet")
        return None
    
    # For ordering, we'd need intermediate results brackets at each snapshot
    # For now, return all who reached it
    first = min(reached, key=reached.get)  # Lowest score = likely reached it first (just barely)
    last = max(reached, key=reached.get)   # Highest score = reached it with most margin
    
    return {'winners': [[first], [last]], 'scores': current_scores}


def well_duh_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Well duh: correctly predicted the most games decided by more than 10 points."""
    scores = {}
    for name, bracket in participant_brackets.items():
        count = 0
        for round_num in range(1, 7):
            round_key = f"round{round_num}"
            results_games = results_bracket.get(round_key, [])
            picks_games = bracket.get(round_key, [])
            
            for i in range(min(len(results_games), len(picks_games))):
                r = results_games[i]
                p = picks_games[i]
                if r and p and get_winner_name(r) and get_winner_name(p):
                    if get_winner_name(r) == get_winner_name(p):
                        score1 = r.get('score1')
                        score2 = r.get('score2')
                        if score1 is not None and score2 is not None:
                            if abs(score1 - score2) > 10:
                                count += 1
        scores[name] = count
    
    if not scores:
        return None
    
    max_count = max(scores.values())
    winners = [name for name, s in scores.items() if s == max_count]
    return {'winners': winners, 'scores': scores}


def scatt_er_gories_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Scatt er gories: only person to pick their champion to win it all."""
    # Count how many people picked each champion
    champion_picks = {}  # team_name -> list of participants who picked them
    for name, bracket in participant_brackets.items():
        champion = bracket.get('winner')
        if champion:
            champ_name = get_team_name(champion)
            if champ_name:
                if champ_name not in champion_picks:
                    champion_picks[champ_name] = []
                champion_picks[champ_name].append(name)
    
    # Find participants who were the ONLY person to pick their champion
    winners = []
    scores = {}
    for team, pickers in champion_picks.items():
        scores[team] = pickers
        if len(pickers) == 1:
            winners.append(pickers[0])
    
    if winners:
        return {'winners': winners, 'scores': {name: get_team_name(participant_brackets[name].get('winner')) for name in winners}}
    
    return {'winners': [], 'scores': scores}


def believer_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Believer (repeatable): correctly picked THE lowest seed to advance in each round.
    Returns all winners across all rounds where upsets occurred."""
    winners = []
    scores = {}
    
    for round_num in range(1, 7):
        round_key = f"round{round_num}"
        results_games = results_bracket.get(round_key, [])
        
        # Find the lowest (highest number) seed that won in this round
        lowest_seed_winner = None
        lowest_seed_num = 0
        
        for game in results_games:
            if not game or not game.get('winner'):
                continue
            winner_seed = get_team_seed(game.get('winner'))
            if winner_seed > lowest_seed_num:
                lowest_seed_num = winner_seed
                lowest_seed_winner = get_winner_name(game)
        
        if not lowest_seed_winner:
            continue
        
        # Find who correctly picked this team to win in this round
        round_winners = []
        for name, bracket in participant_brackets.items():
            picks_games = bracket.get(round_key, [])
            for i, game in enumerate(picks_games):
                if game and get_winner_name(game) == lowest_seed_winner:
                    # Verify it's the same game position
                    if i < len(results_games) and results_games[i]:
                        if get_winner_name(results_games[i]) == lowest_seed_winner:
                            round_winners.append(name)
                            break
        
        if round_winners:
            scores[f"Round {round_num}: {lowest_seed_winner} (seed {lowest_seed_num})"] = round_winners
            winners.extend(round_winners)
    
    if winners:
        return {'winners': winners, 'scores': scores}
    return None


def dustin_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Dustin: lowest ratio of underdog points earned / max possible underdog points."""
    scores = {}
    for name, bracket in participant_brackets.items():
        _, underdog_earned, _ = compute_total_score(results_bracket, bracket, teams, config)
        max_underdog = compute_max_underdog_points(bracket, config)
        
        if max_underdog > 0:
            ratio = underdog_earned / max_underdog
        else:
            ratio = 0
        scores[name] = ratio
    
    if not scores:
        return None
    
    min_ratio = min(scores.values())
    winners = [name for name, s in scores.items() if s == min_ratio]
    return {'winners': winners, 'scores': scores}


def husky_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Husky: best East region score minus South region score."""
    # Region indices: 0=East(topLeft), 1=South(bottomLeft), 2=West(topRight), 3=Midwest(bottomRight)
    scores = {}
    for name, bracket in participant_brackets.items():
        east_score = compute_region_score(results_bracket, bracket, teams, config, 0)
        south_score = compute_region_score(results_bracket, bracket, teams, config, 1)
        scores[name] = east_score - south_score
    
    if not scores:
        return None
    
    max_diff = max(scores.values())
    winners = [name for name, s in scores.items() if s == max_diff]
    return {'winners': winners, 'scores': scores}


def down_left_up_right_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Down/Left/Up/Right: best performance in each region.
    Down=South(1), Left=West(2), Up=Midwest(3), Right=East(0)"""
    region_map = {
        'Down (South)': 1,
        'Left (West)': 2, 
        'Up (Midwest)': 3,
        'Right (East)': 0
    }
    
    results = [[], [], [], []]  # Down, Left, Up, Right
    all_scores = {}
    
    for idx, (label, region_idx) in enumerate(region_map.items()):
        region_scores = {}
        for name, bracket in participant_brackets.items():
            score = compute_region_score(results_bracket, bracket, teams, config, region_idx)
            region_scores[name] = score
        
        if region_scores:
            max_score = max(region_scores.values())
            winners = [name for name, s in region_scores.items() if s == max_score]
            results[idx] = winners
            all_scores[label] = region_scores
    
    return {'winners': results, 'scores': all_scores}


def heartbreaker_heartbroken_solver(results_bracket, participant_brackets, participants, teams, config, award, win_prob_data=None, win_prob_history=None):
    """Heartbreaker/heartbroken: correctly/incorrectly had a game where they were the only one to pick a team.
    Only considers games before Final Four (rounds 1-4)."""
    heartbreakers = []  # Correctly picked a unique pick
    heartbroken = []    # Incorrectly picked a unique pick
    scores = {}
    
    for round_num in range(1, 5):  # Before Final Four
        round_key = f"round{round_num}"
        results_games = results_bracket.get(round_key, [])
        
        for game_idx, result_game in enumerate(results_games):
            if not result_game or not result_game.get('winner'):
                continue
            
            actual_winner = get_winner_name(result_game)
            team1 = get_team_name(result_game.get('team1'))
            team2 = get_team_name(result_game.get('team2'))
            
            # Count who picked each team for this game
            team1_pickers = []
            team2_pickers = []
            
            for name, bracket in participant_brackets.items():
                picks_games = bracket.get(round_key, [])
                if game_idx < len(picks_games) and picks_games[game_idx]:
                    pick_winner = get_winner_name(picks_games[game_idx])
                    if pick_winner == team1:
                        team1_pickers.append(name)
                    elif pick_winner == team2:
                        team2_pickers.append(name)
            
            # Check for unique picks
            for pickers, team in [(team1_pickers, team1), (team2_pickers, team2)]:
                if len(pickers) == 1:
                    person = pickers[0]
                    game_desc = f"R{round_num}G{game_idx}: {team1} vs {team2}"
                    if team == actual_winner:
                        heartbreakers.append(person)
                        scores[f"💔 {person} correctly picked {team} ({game_desc})"] = "heartbreaker"
                    else:
                        heartbroken.append(person)
                        scores[f"💔 {person} incorrectly picked {team} ({game_desc})"] = "heartbroken"
    
    if heartbreakers or heartbroken:
        return {'winners': heartbreakers + heartbroken, 'scores': scores}
    return None


# =============================================================================
# Main Processing
# =============================================================================

def process_awards(star_bonuses: list, results_bracket: dict, participant_brackets: Dict[str, dict],
                   participants: Dict[str, str], teams: list, config: dict,
                   win_prob_data: dict, all_win_prob_history: Dict[str, dict],
                   completed_round: int, round_status: Dict[int, Tuple[int, int]],
                   force: bool = False, dry_run: bool = False) -> list:
    """
    Process all awards, running solvers for eligible ones.
    
    Returns the updated star_bonuses list.
    """
    print(f"\n{'=' * 60}")
    print(f"PROCESSING STAR BONUSES")
    print(f"{'=' * 60}")
    print(f"Completed round: {completed_round}")
    print(f"Round status: {round_status}")
    print(f"Participants: {len(participants)}")
    print(f"Brackets loaded: {len(participant_brackets)}")
    print(f"Win probabilities loaded: {'yes' if win_prob_data else 'no'}")
    print(f"Win prob history snapshots: {len(all_win_prob_history)}")
    print(f"Awards to process: {len(star_bonuses)}")
    print()
    
    for i, award in enumerate(star_bonuses):
        name = award.get('name', f'Award {i}')
        solver_name = get_solver_name(name)
        is_repeatable = award.get('repeatable', False)
        
        eligible, reason = is_award_eligible(award, completed_round, round_status, force)
        
        # Check if already has winners
        has_winners = False
        winners = award.get('Winners', [])
        if isinstance(winners, list):
            if len(winners) > 0:
                # For split awards (list of lists), check if any sublist has entries
                if isinstance(winners[0], list):
                    has_winners = any(len(sublist) > 0 for sublist in winners)
                else:
                    has_winners = len(winners) > 0
        
        # Status line
        if has_winners and not is_repeatable:
            status_icon = "✅"
        elif eligible:
            status_icon = "🔄"
        else:
            status_icon = "⏳"
        
        print(f"{status_icon} [{i+1}/{len(star_bonuses)}] {name}")
        print(f"    Round: {award.get('round', '?')} | Eligible: {eligible} ({reason}) | Repeatable: {is_repeatable}")
        print(f"    Solver: {solver_name}")
        
        if has_winners and not is_repeatable:
            print(f"    Winners already set (not repeatable): {winners}")
            continue
        
        if has_winners and is_repeatable:
            print(f"    Repeatable award - re-running solver (current winners: {winners})")
        
        if not eligible:
            print(f"    Skipping - not yet eligible")
            continue
        
        if award.get('manual', False):
            print(f"    Skipping - manual award")
            continue
        
        # Find and run solver
        solver = find_solver(solver_name)
        
        if solver is None:
            print(f"    ⚠️  No solver function found: {solver_name}")
            continue
        
        if dry_run:
            print(f"    [DRY RUN] Would run {solver_name}")
            continue
        
        print(f"    Running {solver_name}...")
        try:
            result = solver(
                results_bracket, participant_brackets, participants, 
                teams, config, award,
                win_prob_data=win_prob_data,
                win_prob_history=all_win_prob_history
            )
            
            if result is not None:
                # Result can be:
                # - A list of winner names (simple award)
                # - A list of lists (split award)
                # - A dict with 'winners' and optionally 'scores'
                if isinstance(result, dict):
                    if 'winners' in result:
                        award['Winners'] = result['winners']
                    if 'scores' in result:
                        award['scores'] = result['scores']
                    print(f"    ✅ Result: Winners={result.get('winners')}, Scores={result.get('scores')}")
                elif isinstance(result, list):
                    award['Winners'] = result
                    print(f"    ✅ Result: {result}")
                else:
                    print(f"    ⚠️  Unexpected result type: {type(result)}")
            else:
                print(f"    ⏳ Solver returned None (no result yet)")
        except Exception as e:
            print(f"    ❌ Error in solver: {e}")
            import traceback
            traceback.print_exc()
        
        print()
    
    return star_bonuses


def main():
    parser = argparse.ArgumentParser(
        description='Compute star bonus awards for March Madness bracket competition',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python computeStarBonuses.py                  # Auto-detect round, compute eligible awards
    python computeStarBonuses.py --round 3        # Override to round 3 complete
    python computeStarBonuses.py --halfway        # Include halfway awards for current round
    python computeStarBonuses.py --force           # Compute all awards regardless of round
    python computeStarBonuses.py --dry-run         # Preview without writing
    python computeStarBonuses.py --list            # List all awards and their solvers
        """
    )
    
    parser.add_argument('--round', type=int, default=None,
                       help='Override the detected current round (1-6)')
    parser.add_argument('--halfway', action='store_true',
                       help='Treat the current round as halfway (for halfway awards)')
    parser.add_argument('--force', action='store_true',
                       help='Compute all awards regardless of round eligibility')
    parser.add_argument('--dry-run', action='store_true',
                       help='Print what would be computed without writing results')
    parser.add_argument('--list', action='store_true',
                       help='List all awards with solver status and exit')
    parser.add_argument('--base-path', default=None,
                       help=f'Base path for data files (default: ./{YEAR})')
    parser.add_argument('--exclude', default=None,
                       help=f'comma separated list of names to exclude')
    
    args = parser.parse_args()
    
    # Update base path if provided
    if args.base_path:
        global BASE_PATH, STAR_BONUSES_FILE, RESULTS_BRACKET_FILE, PARTICIPANTS_FILE
        global BRACKETS_DIR, SCORING_CONFIG_FILE, TEAMS_FILE, WIN_PROBABILITIES_DIR, WIN_PROBABILITIES_FILE
        BASE_PATH = Path(args.base_path)
        STAR_BONUSES_FILE = BASE_PATH / "starBonuses.json"
        RESULTS_BRACKET_FILE = BASE_PATH / f"results-bracket-march-madness-{YEAR}.json"
        PARTICIPANTS_FILE = BASE_PATH / "participants.json"
        BRACKETS_DIR = BASE_PATH / "brackets"
        SCORING_CONFIG_FILE = BASE_PATH / "scoring-config.json"
        TEAMS_FILE = BASE_PATH / f"ThisYearTeams{YEAR}.csv"
        WIN_PROBABILITIES_DIR = BASE_PATH / "winProbabilities"
        WIN_PROBABILITIES_FILE = BASE_PATH / "winProbabilities.json"

    global EXCLUDED_NAMES
    if args.exclude:
        global EXCLUDED_NAMES
        EXCLUDED_NAMES = args.exclude
        if EXCLUDED_NAMES == 'none':
            EXCLUDED_NAMES == []
        else:
            EXCLUDED_NAMES = EXCLUDED_NAMES.split(',')
    else:
        EXCLUDED_NAMES == []
    
    print('excluded', EXCLUDED_NAMES)
        
    
    # Load star bonuses
    print(f"Loading star bonuses from {STAR_BONUSES_FILE}")
    if not STAR_BONUSES_FILE.exists():
        print(f"Error: Star bonuses file not found at {STAR_BONUSES_FILE}")
        sys.exit(1)
    star_bonuses = load_json(STAR_BONUSES_FILE)
    print(f"  Found {len(star_bonuses)} awards")
    
    # List mode
    if args.list:
        print(f"\n{'=' * 60}")
        print("AWARD REGISTRY")
        print(f"{'=' * 60}\n")
        for i, award in enumerate(star_bonuses):
            name = award.get('name', f'Award {i}')
            solver_name = get_solver_name(name)
            solver = find_solver(solver_name)
            manual = award.get('manual', False)
            has_winners = bool(award.get('Winners') and 
                             (any(award['Winners']) if isinstance(award['Winners'][0], list) 
                              else len(award['Winners']) > 0)) if award.get('Winners') else False
            
            status = "✅ HAS WINNERS" if has_winners else ("🔧 MANUAL" if manual else ("✓ FOUND" if solver else "✗ MISSING"))
            print(f"  {i+1:2d}. {name:<30s} | Round {str(award.get('round', '?')):>7s} | {solver_name:<40s} | {status}")
        return
    
    # Load all data
    print(f"\nLoading results bracket from {RESULTS_BRACKET_FILE}")
    results_bracket = load_results_bracket()
    
    print(f"\nLoading participants from {PARTICIPANTS_FILE}")
    participants = load_participants()
    print(f"  Found {len(participants)} participants: {', '.join(participants.keys())}")
    
    print(f"\nLoading participant brackets from {BRACKETS_DIR}")
    participant_brackets = load_all_brackets(participants)
    print(f"  Loaded {len(participant_brackets)} brackets")
    
    print(f"\nLoading scoring config from {SCORING_CONFIG_FILE}")
    config = load_scoring_config()
    
    print(f"\nLoading teams from {TEAMS_FILE}")
    teams = load_teams()
    print(f"  Loaded {len(teams)} teams")
    
    # Load win probabilities
    print(f"\nLoading win probabilities...")
    win_prob_data = load_win_probabilities()
    if win_prob_data:
        wp = win_prob_data.get('win_probabilities', {})
        print(f"  Current win probs for {len(wp)} participants")
    
    print(f"\nLoading win probability history...")
    all_win_prob_history = load_all_win_probabilities()
    print(f"  Found {len(all_win_prob_history)} historical snapshots")
    
    # Detect current round
    auto_round, auto_halfway, round_status = detect_current_round(results_bracket)
    print(f"\nAuto-detected: Round {auto_round} complete, halfway={auto_halfway}")
    for rnd, (decided, total) in round_status.items():
        if total > 0:
            print(f"  Round {rnd}: {decided}/{total} games decided")
    
    completed_round = args.round if args.round is not None else auto_round
    
    if args.round is not None:
        print(f"Override: Using round {completed_round}")
        # Rebuild round_status to reflect override
        for r in range(1, completed_round + 1):
            decided, total = round_status.get(r, (0, 0))
            round_status[r] = (total, total)  # Mark as complete
    
    # Process awards
    updated_bonuses = process_awards(
        star_bonuses, results_bracket, participant_brackets,
        participants, teams, config,
        win_prob_data, all_win_prob_history,
        completed_round, round_status,
        force=args.force, dry_run=args.dry_run
    )
    
    # Save results
    if not args.dry_run:
        print(f"\nSaving updated star bonuses to {STAR_BONUSES_FILE}")
        save_json(STAR_BONUSES_FILE, updated_bonuses)
    else:
        print(f"\n[DRY RUN] Would save to {STAR_BONUSES_FILE}")
    
    print("\nDone!")


if __name__ == '__main__':
    main()