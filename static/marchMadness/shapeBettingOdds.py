#!/usr/bin/env python3
"""
Shape betting odds into team probability CSV.

This script takes raw betting odds (from fetchBettingOdds.py) and applies
seed-based shaping to estimate round-by-round probabilities.

Usage:
    python shapeBettingOdds.py --input raw_odds.json --output teams_with_odds.csv
    
    # With base teams CSV for seed/region info
    python shapeBettingOdds.py --input raw_odds.json --base-teams ThisYearTeams.csv --output teams_with_odds.csv
    
    # With results bracket to track tournament progress
    python shapeBettingOdds.py --input raw_odds.json --results results-bracket.json --output teams_with_odds.csv
    
    # Strict validation mode (error on mismatches)
    python shapeBettingOdds.py --input raw_odds.json --base-teams teams.csv --validation strict
"""

import argparse
import csv
import json
import math
import os
import sys
from typing import Dict, List, Optional, Tuple

# Probability columns
PROB_COLUMNS = ['prob_r32', 'prob_r16', 'prob_r8', 'prob_r4', 'prob_r2', 'prob_win']

# Round keys matching the bracket structure
ROUND_KEYS = ['round1', 'round2', 'round3', 'round4', 'round5', 'round6']

# Seed probability data (loaded from CSV)
SEED_PROBABILITIES = {}
SEED_PROB_FILE = "seed_probabilities.csv"

# Bracket groupings for normalization (by seed matchups within a region)
SEED_GROUPS = {
    'prob_r32': [[1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]],
    'prob_r16': [[1, 16, 8, 9], [5, 12, 4, 13], [6, 11, 3, 14], [7, 10, 2, 15]],
    'prob_r8': [[1, 16, 8, 9, 5, 12, 4, 13], [6, 11, 3, 14, 7, 10, 2, 15]],
    'prob_r4': [list(range(1, 17))],  # Entire region
    'prob_r2': [list(range(1, 17))],  # Two regions combine (handled specially)
    'prob_win': [list(range(1, 17))], # All four regions (handled specially)
}

# Which regions play each other in Final Four (prob_r2)
REGION_PAIRS_FINAL_FOUR = [
    ['South', 'West'],      # One semifinal
    ['East', 'Midwest'],    # Other semifinal
]


def validate_team_names(
    odds_teams: List[str],
    base_teams: Dict[str, dict],
    validation_mode: str = "warning"
) -> Tuple[Dict[str, str], bool]:
    """
    Validate and match team names between odds data and base teams.
    
    Args:
        odds_teams: List of team names from betting odds
        base_teams: Dict of team_name -> {seed, region} from base teams CSV
        validation_mode: "strict" (error on mismatch) or "warning" (warn and continue)
    
    Returns:
        Tuple of:
        - name_mapping: Dict mapping odds team name -> base team name (for matched teams)
        - success: True if validation passed (no errors in strict mode)
    """
    base_team_names = set(base_teams.keys())
    odds_team_names = set(odds_teams)
    
    # Find exact matches
    exact_matches = base_team_names & odds_team_names
    
    # Teams in odds but not in base teams
    odds_only = odds_team_names - base_team_names
    
    # Teams in base teams but not in odds
    base_only = base_team_names - odds_team_names
    
    # Build name mapping (start with exact matches)
    name_mapping = {name: name for name in exact_matches}
    
    # Try fuzzy matching for unmatched teams
    unmatched_odds = []
    for odds_name in odds_only:
        matched = False
        odds_lower = odds_name.lower()
        
        for base_name in base_only:
            base_lower = base_name.lower()
            
            # Check various matching strategies
            if (odds_lower == base_lower or
                odds_lower in base_lower or
                base_lower in odds_lower or
                # Handle common variations
                odds_lower.replace("state", "st.") == base_lower or
                odds_lower.replace("st.", "state") == base_lower or
                odds_lower.replace("university", "") == base_lower.replace("university", "") or
                # Handle "North Carolina" vs "UNC" etc.
                (len(odds_lower) <= 4 and odds_lower in base_lower)):
                
                name_mapping[odds_name] = base_name
                base_only.discard(base_name)
                matched = True
                print(f"  Fuzzy match: '{odds_name}' -> '{base_name}'")
                break
        
        if not matched:
            unmatched_odds.append(odds_name)
    
    # Report results
    has_errors = False
    
    if unmatched_odds:
        print(f"\n{'ERROR' if validation_mode == 'strict' else 'WARNING'}: Teams in odds but not in base teams:")
        for name in sorted(unmatched_odds):
            print(f"  - {name}")
        if validation_mode == "strict":
            has_errors = True
    
    if base_only:
        print(f"\n{'ERROR' if validation_mode == 'strict' else 'WARNING'}: Teams in base teams but not in odds:")
        for name in sorted(base_only):
            print(f"  - {name}")
        if validation_mode == "strict":
            has_errors = True
    
    # Summary
    print(f"\nTeam name validation summary:")
    print(f"  Exact matches: {len(exact_matches)}")
    print(f"  Fuzzy matches: {len(name_mapping) - len(exact_matches)}")
    print(f"  Unmatched (odds): {len(unmatched_odds)}")
    print(f"  Unmatched (base): {len(base_only)}")
    
    if has_errors:
        print(f"\nValidation FAILED (strict mode)")
        return name_mapping, False
    elif unmatched_odds or base_only:
        print(f"\nValidation passed with warnings")
    else:
        print(f"\nValidation passed - all teams matched!")
    
    return name_mapping, True


def merge_first_four_teams(
    championship_probs: Dict[str, float],
    base_teams: Dict[str, dict],
    game_odds: Optional[List[dict]] = None
) -> Tuple[Dict[str, float], int]:
    """
    Merge First Four combo teams (names containing '/') in the odds data.
    
    For base teams like "Prairie View A&M/Lehigh", finds both component teams
    in the odds data, sums their probabilities, and creates a single entry
    under the combo name.
    
    Args:
        championship_probs: Dict of team_name -> probability (modified in place)
        base_teams: Dict of team_name -> {seed, region} from base teams CSV
        game_odds: Optional list of game odds dicts (modified in place)
    
    Returns:
        Tuple of (updated championship_probs, number of merges performed)
    """
    merges = 0
    
    # Find all combo teams in base_teams
    combo_teams = {name: info for name, info in base_teams.items() if '/' in name}
    
    if not combo_teams:
        return championship_probs, 0
    
    print(f"\nMerging First Four combo teams ({len(combo_teams)} found):")
    
    for combo_name, info in combo_teams.items():
        components = [c.strip() for c in combo_name.split('/')]
        
        # Look up each component in championship_probs
        component_probs = []
        found_components = []
        missing_components = []
        
        for component in components:
            if component in championship_probs:
                component_probs.append(championship_probs[component])
                found_components.append(component)
            else:
                # Try case-insensitive lookup
                matched = False
                for odds_name in list(championship_probs.keys()):
                    if odds_name.lower() == component.lower():
                        component_probs.append(championship_probs[odds_name])
                        found_components.append(odds_name)
                        matched = True
                        break
                if not matched:
                    component_probs.append(0.0)
                    missing_components.append(component)
        
        # Sum probabilities
        merged_prob = sum(component_probs)
        
        # Report
        prob_details = ', '.join(
            f"{comp}={prob:.6f}" 
            for comp, prob in zip(components, component_probs)
        )
        print(f"  {combo_name}: {prob_details} -> {merged_prob:.6f}")
        if missing_components:
            print(f"    (not found in odds, using 0: {', '.join(missing_components)})")
        
        # Remove individual entries and add combo entry
        for comp in found_components:
            championship_probs.pop(comp, None)
        championship_probs[combo_name] = merged_prob
        
        # Handle game_odds if present
        if game_odds:
            for game in game_odds:
                for comp in found_components:
                    if game.get('home_team') == comp:
                        game['home_team'] = combo_name
                    if game.get('away_team') == comp:
                        game['away_team'] = combo_name
        
        merges += 1
    
    print(f"  Merged {merges} combo teams")
    return championship_probs, merges


def load_seed_probabilities(filepath: str = None) -> bool:
    """Load seed probability data from CSV file."""
    global SEED_PROBABILITIES
    
    if filepath is None:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        filepath = os.path.join(script_dir, SEED_PROB_FILE)
    
    if not os.path.exists(filepath):
        print(f"Seed probabilities file not found: {filepath}")
        return False
    
    try:
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                seed = int(row['seed'])
                SEED_PROBABILITIES[seed] = {
                    'prob_r32': float(row['prob_r32']),
                    'prob_r16': float(row['prob_r16']),
                    'prob_r8': float(row['prob_r8']),
                    'prob_r4': float(row['prob_r4']),
                    'prob_r2': float(row['prob_r2']),
                    'prob_win': float(row['prob_win']),
                }
        print(f"Loaded seed probabilities from {filepath}")
        return True
    except Exception as e:
        print(f"Error loading seed probabilities: {e}")
        return False


def load_team_status_from_results(results_path: str) -> Tuple[Dict[str, int], Dict[str, bool]]:
    """
    Load team status from a results bracket JSON.
    
    Returns:
        Tuple of:
        - team_current_rounds: Dict mapping team name to their current round (1-6)
        - team_eliminated: Dict mapping team name to whether they're eliminated
    """
    if not os.path.exists(results_path):
        return {}, {}
    
    with open(results_path, 'r') as f:
        results = json.load(f)
    
    team_rounds = {}
    team_eliminated = {}
    
    def get_team_name(team):
        if not team:
            return None
        if isinstance(team, dict):
            return team.get('name')
        return team
    
    def get_winner_name(game):
        if not game or not game.get('winner'):
            return None
        winner = game['winner']
        if isinstance(winner, dict):
            return winner.get('name')
        return winner
    
    for round_idx, round_key in enumerate(ROUND_KEYS):
        round_num = round_idx + 1
        
        if round_key not in results:
            continue
        
        for game in results[round_key]:
            if not game:
                continue
            
            team1 = get_team_name(game.get('team1'))
            team2 = get_team_name(game.get('team2'))
            winner = get_winner_name(game)
            
            for team in [team1, team2]:
                if team:
                    team_rounds[team] = max(team_rounds.get(team, 0), round_num)
            
            if winner:
                loser = team2 if winner == team1 else team1
                if loser:
                    team_eliminated[loser] = True
                if winner:
                    team_rounds[winner] = max(team_rounds.get(winner, 0), round_num + 1)
    
    team_current_rounds = {}
    for team, highest_round in team_rounds.items():
        team_current_rounds[team] = highest_round
    
    return team_current_rounds, team_eliminated


def interpolate_exponential(start_scale: float, end_scale: float, 
                            position: int, total_steps: int) -> float:
    """
    Exponential (geometric) interpolation between scales.
    """
    if total_steps <= 0:
        return end_scale
    if position <= 0:
        return start_scale
    if position >= total_steps:
        return end_scale
    
    if start_scale <= 0 or end_scale <= 0:
        t = position / total_steps
        return start_scale + t * (end_scale - start_scale)
    
    t = position / total_steps
    return start_scale * ((end_scale / start_scale) ** t)


def estimate_round_probabilities_geometric(prob_win: float, current_round: int = 1) -> Dict[str, float]:
    """
    Estimate probabilities using geometric method (fallback).
    """
    if prob_win <= 0:
        return {col: 0.0 for col in PROB_COLUMNS}
    
    games_from_round = {1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 6: 1}
    round_to_prob_col = {1: 'prob_r32', 2: 'prob_r16', 3: 'prob_r8', 
                         4: 'prob_r4', 5: 'prob_r2', 6: 'prob_win'}
    
    games_remaining = games_from_round.get(current_round, 6)
    p_per_round = prob_win ** (1 / games_remaining)
    
    result = {}
    
    for r in range(1, current_round):
        col = round_to_prob_col.get(r)
        if col:
            result[col] = 1.0
    
    cumulative_games = 1
    for r in range(current_round, 7):
        col = round_to_prob_col.get(r)
        if col:
            result[col] = p_per_round ** cumulative_games
            cumulative_games += 1
    
    return result


def estimate_round_probabilities_shaped(
    seed: int,
    anchors: Dict[str, float],
    current_round: int = 1,
    interpolation: str = "exponential"
) -> Dict[str, float]:
    """
    Estimate round probabilities using seed-based shape with multi-anchor interpolation.
    
    Uses confidence-dampened scaling: when seed base probabilities are very small
    (less trustworthy), the scale factor is dampened to avoid extreme values.
    """
    if not SEED_PROBABILITIES:
        load_seed_probabilities()
    
    if seed not in SEED_PROBABILITIES:
        prob_win = anchors.get('prob_win', 0.01)
        return estimate_round_probabilities_geometric(prob_win, current_round)
    
    seed_probs = SEED_PROBABILITIES[seed]
    prob_columns_ordered = ['prob_r32', 'prob_r16', 'prob_r8', 'prob_r4', 'prob_r2', 'prob_win']
    
    # Round-dependent confidence thresholds
    # Below these thresholds, we trust the seed data less and dampen the scale factor
    CONFIDENCE_THRESHOLDS = {
        'prob_r32': 0.05,    # 5% - even 16-seeds have ~1.3%
        'prob_r16': 0.01,    # 1% - most seeds have >1%
        'prob_r8':  0.005,   # 0.5% - getting sparser
        'prob_r4':  0.001,   # 0.1% - only top seeds have real data
        'prob_r2':  0.0005,  # 0.05% - very sparse
        'prob_win': 0.0001,  # 0.01% - extremely sparse
    }
    
    # Build anchor points with confidence-dampened scales
    anchor_points = []
    for i, col in enumerate(prob_columns_ordered):
        if col in anchors and anchors[col] is not None and anchors[col] > 0:
            if seed_probs[col] > 0:
                raw_scale = anchors[col] / seed_probs[col]
                
                # Apply confidence dampening
                threshold = CONFIDENCE_THRESHOLDS.get(col, 0.001)
                confidence = max(1.0, threshold / seed_probs[col])
                
                # Dampen the scale: scale = raw_scale^(1/confidence)
                # When confidence=1, scale=raw_scale (no dampening)
                # When confidence>1, scale is pulled toward 1.0
                if raw_scale > 0:
                    dampened_scale = raw_scale ** (1.0 / confidence)
                else:
                    dampened_scale = raw_scale
                
                anchor_points.append((i, dampened_scale))
    
    if not anchor_points:
        prob_win = anchors.get('prob_win', 0.01)
        return estimate_round_probabilities_geometric(prob_win, current_round)
    
    anchor_points.sort(key=lambda x: x[0])
    
    # Calculate scale factors by interpolating between anchors
    scale_factors = {}
    
    for i, col in enumerate(prob_columns_ordered):
        left_anchor = None
        right_anchor = None
        
        for anchor_idx, anchor_scale in anchor_points:
            if anchor_idx <= i:
                left_anchor = (anchor_idx, anchor_scale)
            if anchor_idx >= i and right_anchor is None:
                right_anchor = (anchor_idx, anchor_scale)
        
        if left_anchor is None and right_anchor is None:
            scale_factors[col] = 1.0
        elif left_anchor is None:
            scale_factors[col] = right_anchor[1]
        elif right_anchor is None:
            scale_factors[col] = left_anchor[1]
        elif left_anchor[0] == right_anchor[0]:
            scale_factors[col] = left_anchor[1]
        else:
            left_idx, left_scale = left_anchor
            right_idx, right_scale = right_anchor
            position = i - left_idx
            total_steps = right_idx - left_idx
            scale_factors[col] = interpolate_exponential(left_scale, right_scale, position, total_steps)
    
    # Apply scale factors (no cap - renormalization will handle bringing into valid range)
    result = {}
    for col in prob_columns_ordered:
        scaled_prob = seed_probs[col] * scale_factors[col]
        result[col] = max(0.0, scaled_prob)  # Only floor at 0, no cap at 1.0
    
    # Set past rounds to 1.0
    round_to_col = {1: 'prob_r32', 2: 'prob_r16', 3: 'prob_r8', 4: 'prob_r4', 5: 'prob_r2', 6: 'prob_win'}
    for r in range(1, current_round):
        col = round_to_col.get(r)
        if col:
            result[col] = 1.0
    
    return result


def renormalize_probabilities_within_groups(
    team_probs: Dict[str, Dict[str, float]],
    team_info: Dict[str, dict]
) -> Dict[str, Dict[str, float]]:
    """
    Renormalize team probabilities within bracket groups.
    """
    # Group teams by region
    teams_by_region = {}
    for team_name, info in team_info.items():
        region = info.get('region', 'Unknown')
        if region not in teams_by_region:
            teams_by_region[region] = []
        teams_by_region[region].append((team_name, info.get('seed', 0)))
    
    # For prob_r32 through prob_r4: normalize within region and seed group
    for col in ['prob_r32', 'prob_r16', 'prob_r8', 'prob_r4']:
        seed_groups = SEED_GROUPS[col]
        
        for region, teams in teams_by_region.items():
            for seed_group in seed_groups:
                group_teams = [(name, seed) for name, seed in teams if seed in seed_group]
                
                if not group_teams:
                    continue
                
                total = sum(team_probs.get(name, {}).get(col, 0) for name, _ in group_teams)
                
                if total > 0:
                    for name, _ in group_teams:
                        if name in team_probs and col in team_probs[name]:
                            team_probs[name][col] /= total
    
    # For prob_r2: normalize within paired regions
    # Each region pair produces 1 championship game participant, so each pair sums to 1.0
    # Total across all teams should be 2.0 (2 teams in championship game)
    for region_pair in REGION_PAIRS_FINAL_FOUR:
        pair_teams = []
        for region in region_pair:
            if region in teams_by_region:
                pair_teams.extend([(name, seed) for name, seed in teams_by_region[region]])
        
        if not pair_teams:
            continue
        
        total = sum(team_probs.get(name, {}).get('prob_r2', 0) for name, _ in pair_teams)
        
        if total > 0:
            for name, _ in pair_teams:
                if name in team_probs and 'prob_r2' in team_probs[name]:
                    team_probs[name]['prob_r2'] = team_probs[name]['prob_r2'] / total
    
    # For prob_win: normalize across all teams
    all_teams = list(team_probs.keys())
    total = sum(team_probs.get(name, {}).get('prob_win', 0) for name in all_teams)
    
    if total > 0:
        for name in all_teams:
            if name in team_probs and 'prob_win' in team_probs[name]:
                team_probs[name]['prob_win'] /= total
    
    return team_probs


def create_probability_csv(
    championship_probs: Dict[str, float],
    output_path: str,
    base_teams_csv: str = None,
    estimation_method: str = "shaped",
    game_odds: List[dict] = None,
    team_current_rounds: Dict[str, int] = None,
    team_eliminated: Dict[str, bool] = None,
    eliminated_team_probs: Dict[str, Dict[str, float]] = None
):
    """
    Create a CSV file with team probabilities.
    """
    # Load seed probabilities for shaped method
    if estimation_method == "shaped":
        load_seed_probabilities()
    
    # Load base teams if provided
    base_teams = {}
    if base_teams_csv and os.path.exists(base_teams_csv):
        print(f"\nLoading base team info from {base_teams_csv}")
        with open(base_teams_csv, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get('TEAM') or row.get('Team') or row.get('name')
                if name:
                    seed_val = row.get('SEED') or row.get('Seed') or row.get('seed', '')
                    try:
                        seed_int = int(seed_val) if seed_val else 0
                    except ValueError:
                        seed_int = 0
                    base_teams[name] = {
                        'seed': seed_int,
                        'region': row.get('Region') or row.get('region', ''),
                    }
        print(f"  Loaded {len(base_teams)} teams from base CSV")
    
    # Build lookup for first game win probability
    first_game_probs = {}
    if game_odds:
        for game in game_odds:
            home_team = game.get('home_team')
            away_team = game.get('away_team')
            if home_team:
                first_game_probs[home_team] = game.get('home_prob', 0.5)
            if away_team:
                first_game_probs[away_team] = game.get('away_prob', 0.5)
        print(f"  Found first-game odds for {len(first_game_probs)} teams")
    
    if team_current_rounds is None:
        team_current_rounds = {}
    if team_eliminated is None:
        team_eliminated = {}
    
    # First pass: estimate probabilities
    team_probs = {}
    team_info = {}
    output_rows = []
    
    for team_name, prob_win in championship_probs.items():
        base_info = base_teams.get(team_name, {})
        seed = base_info.get('seed', 0)
        region = base_info.get('region', '')
        
        team_info[team_name] = {'seed': seed, 'region': region}
        
        if team_eliminated.get(team_name, False):
            current_round = team_current_rounds.get(team_name, 1)
            round_probs = {}
            round_to_col = {1: 'prob_r32', 2: 'prob_r16', 3: 'prob_r8', 
                          4: 'prob_r4', 5: 'prob_r2', 6: 'prob_win'}
            for r in range(1, 7):
                col = round_to_col.get(r)
                if col:
                    if r < current_round:
                        round_probs[col] = 1.0
                    else:
                        round_probs[col] = 0.0
        else:
            prob_first_game = first_game_probs.get(team_name)
            current_round = team_current_rounds.get(team_name, 1)
            
            if estimation_method == "shaped" and seed > 0:
                # Skip estimation for assumed-lost teams (prob_win effectively 0)
                if prob_win <= 1e-9:
                    round_probs = {col: 0.0 for col in PROB_COLUMNS}
                else:
                    anchors = {'prob_win': prob_win}
                    
                    if prob_first_game is not None:
                        round_to_col = {1: 'prob_r32', 2: 'prob_r16', 3: 'prob_r8', 
                                      4: 'prob_r4', 5: 'prob_r2', 6: 'prob_win'}
                        first_game_col = round_to_col.get(current_round)
                        if first_game_col and first_game_col != 'prob_win':
                            anchors[first_game_col] = prob_first_game
                    
                    round_probs = estimate_round_probabilities_shaped(
                        seed=seed,
                        anchors=anchors,
                        current_round=current_round,
                        interpolation="exponential"
                    )
            else:
                if prob_win <= 1e-9:
                    round_probs = {col: 0.0 for col in PROB_COLUMNS}
                else:
                    round_probs = estimate_round_probabilities_geometric(prob_win, current_round)
        
        team_probs[team_name] = round_probs
        
        row = {
            'TEAM': team_name,
            'SEED': seed if seed > 0 else '',
            'Region': region,
        }
        row.update(round_probs)
        output_rows.append(row)
    
    # Second pass: renormalize
    if estimation_method == "shaped":
        print("\nRenormalizing probabilities within bracket groups...")
        team_probs = renormalize_probabilities_within_groups(team_probs, team_info)
        
        for row in output_rows:
            team_name = row['TEAM']
            if team_name in team_probs:
                for col in PROB_COLUMNS:
                    if col in team_probs[team_name]:
                        row[col] = team_probs[team_name][col]
    
    # Add eliminated teams back with exact 1/0 probabilities
    if eliminated_team_probs:
        print(f"\nAdding {len(eliminated_team_probs)} eliminated teams with exact probabilities")
        for team_name, probs in eliminated_team_probs.items():
            info = base_teams.get(team_name, {})
            seed = info.get('seed', 0)
            region = info.get('region', '')
            row = {
                'TEAM': team_name,
                'SEED': seed if seed > 0 else '',
                'Region': region,
            }
            row.update(probs)
            output_rows.append(row)
    
    # Sort by prob_win descending
    output_rows.sort(key=lambda x: x['prob_win'], reverse=True)
    
    # Write CSV
    fieldnames = ['TEAM', 'SEED', 'Region'] + PROB_COLUMNS
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in output_rows:
            for col in PROB_COLUMNS:
                row[col] = f"{row[col]:.8f}"
            writer.writerow(row)
    
    print(f"\nWrote {len(output_rows)} teams to {output_path}")
    
    # Verify sums (threshold: 0.1% of expected value)
    print("\nProbability column sums (should match expected values):")
    for col in PROB_COLUMNS:
        total = sum(float(r[col]) for r in output_rows)
        expected = {'prob_r32': 32, 'prob_r16': 16, 'prob_r8': 8, 
                   'prob_r4': 4, 'prob_r2': 2, 'prob_win': 1}[col]
        tolerance = expected * 0.001  # 0.1% of expected value
        if abs(total - expected) <= tolerance:
            status = "✓"
        else:
            status = f"✗ (off by {abs(total-expected):.4f}, tolerance: {tolerance:.4f})"
        print(f"  {col}: {total:.4f} (expected {expected}) {status}")


def main():
    parser = argparse.ArgumentParser(
        description='Shape betting odds into team probability CSV',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Basic usage with raw odds JSON
    python shapeBettingOdds.py --input raw_odds.json --output teams_with_odds.csv
    
    # With base teams CSV for seed/region info
    python shapeBettingOdds.py --input raw_odds.json --base-teams ThisYearTeams.csv --output teams_with_odds.csv
    
    # With results bracket to track tournament progress
    python shapeBettingOdds.py --input raw_odds.json --results results-bracket.json --output teams_with_odds.csv
    
    # Using geometric method instead of shaped
    python shapeBettingOdds.py --input raw_odds.json --method geometric --output teams_with_odds.csv
    
    # Strict validation (error if team names don't match)
    python shapeBettingOdds.py --input raw_odds.json --base-teams teams.csv --validation strict
    
    # Warning validation (warn but continue if team names don't match)
    python shapeBettingOdds.py --input raw_odds.json --base-teams teams.csv --validation warning
        """
    )
    
    parser.add_argument('--input', '-i', required=True,
                       help='Input JSON file with raw odds (from fetchBettingOdds.py)')
    parser.add_argument('--output', '-o',
                       default='teams_with_odds.csv',
                       help='Output CSV path')
    parser.add_argument('--base-teams',
                       help='Base teams CSV (to get seed/region info)')
    parser.add_argument('--results',
                       help='Results bracket JSON (to determine current tournament state)')
    parser.add_argument('--method',
                       choices=['geometric', 'shaped'],
                       default='shaped',
                       help='Method for estimating round probabilities (default: shaped)')
    parser.add_argument('--seed-probs',
                       help='Path to seed probabilities CSV (default: seed_probabilities.csv in script dir)')
    parser.add_argument('--validation',
                       choices=['strict', 'warning', 'none', 'assumedLost'],
                       default='strict',
                       help='Team name validation mode: strict (error on mismatch, default), warning (warn and continue), none (skip validation), assumedLost (teams not in odds assumed eliminated with 0 probability)')
    parser.add_argument('--name-map',
                       help='Path to a JSON file mapping odds team names to base team names. Format: {"odds name": "base name", ...}')
    
    args = parser.parse_args()
    
    # Load raw odds
    if not os.path.exists(args.input):
        print(f"Error: Input file not found: {args.input}")
        sys.exit(1)
    
    print(f"Loading raw odds from {args.input}")
    with open(args.input, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)
    
    championship_probs = raw_data.get('championship_probs', {})
    game_odds = raw_data.get('game_odds')
    
    if not championship_probs:
        print("Error: No championship probabilities found in input file")
        sys.exit(1)
    
    print(f"  Found {len(championship_probs)} teams with championship odds")
    if game_odds:
        print(f"  Found {len(game_odds)} games with odds")
    
    # Check if validation requires base-teams
    if args.validation != 'none' and not args.base_teams:
        print(f"\nError: --base-teams is required when validation mode is '{args.validation}'")
        print("Either provide --base-teams or use --validation none to skip validation")
        sys.exit(1)
    
    # Load base teams if provided (needed for validation and seed/region info)
    base_teams = {}
    if args.base_teams and os.path.exists(args.base_teams):
        print(f"\nLoading base team info from {args.base_teams}")
        with open(args.base_teams, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get('TEAM') or row.get('Team') or row.get('name')
                if name:
                    seed_val = row.get('SEED') or row.get('Seed') or row.get('seed', '')
                    try:
                        seed_int = int(seed_val) if seed_val else 0
                    except ValueError:
                        seed_int = 0
                    base_teams[name] = {
                        'seed': seed_int,
                        'region': row.get('Region') or row.get('region', ''),
                    }
        print(f"  Loaded {len(base_teams)} teams from base CSV")
    elif args.base_teams and not os.path.exists(args.base_teams):
        print(f"\nError: Base teams file not found: {args.base_teams}")
        sys.exit(1)
    
    # Apply manual name mappings if provided (before validation)
    if args.name_map:
        if not os.path.exists(args.name_map):
            print(f"Error: Name map file not found: {args.name_map}")
            sys.exit(1)
        
        with open(args.name_map, 'r', encoding='utf-8') as f:
            manual_map = json.load(f)
        
        print(f"\nApplying {len(manual_map)} manual name mappings:")
        applied = 0
        for odds_name, base_name in manual_map.items():
            if odds_name in championship_probs:
                championship_probs[base_name] = championship_probs.pop(odds_name)
                applied += 1
                print(f"  '{odds_name}' -> '{base_name}'")
            
            # Also apply to game_odds
            if game_odds:
                for game in game_odds:
                    if game.get('home_team') == odds_name:
                        game['home_team'] = base_name
                    if game.get('away_team') == odds_name:
                        game['away_team'] = base_name
        
        print(f"  Applied {applied} of {len(manual_map)} mappings to championship odds")
    
    # Load team status from results bracket EARLY so we can exclude eliminated teams
    team_current_rounds = {}
    team_eliminated = {}
    eliminated_team_probs = {}  # team_name -> {prob_r32: ..., ...} exact 1/0 values
    
    if args.results:
        print(f"\nLoading tournament state from {args.results}")
        team_current_rounds, team_eliminated = load_team_status_from_results(args.results)
        if team_current_rounds:
            round_counts = {}
            for team, round_num in team_current_rounds.items():
                if not team_eliminated.get(team, False):
                    round_counts[round_num] = round_counts.get(round_num, 0) + 1
            print(f"  Teams still in tournament by round:")
            for r in sorted(round_counts.keys()):
                round_names = {1: 'R64', 2: 'R32', 3: 'S16', 4: 'E8', 5: 'F4', 6: 'Championship'}
                print(f"    {round_names.get(r, f'Round {r}')}: {round_counts[r]} teams")
        
        # Build exact probabilities for eliminated teams
        # A team that reached round R has prob=1.0 for all rounds up to R, and 0.0 after
        prob_columns_ordered = ['prob_r32', 'prob_r16', 'prob_r8', 'prob_r4', 'prob_r2', 'prob_win']
        # prob_r32 corresponds to reaching round 2 (surviving R1), etc.
        round_to_col_index = {2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5}  # round_reached -> column index
        
        eliminated_names = [team for team, elim in team_eliminated.items() if elim]
        if eliminated_names:
            print(f"\n  Removing {len(eliminated_names)} eliminated teams from odds processing:")
            for team in sorted(eliminated_names):
                highest_round = team_current_rounds.get(team, 1)
                probs = {}
                for col_idx, col in enumerate(prob_columns_ordered):
                    # col_idx 0 = prob_r32 = reached round 2
                    # A team that reached round R has 1.0 for columns where round <= R
                    required_round = col_idx + 2  # prob_r32 needs round >= 2
                    if highest_round >= required_round:
                        probs[col] = 1.0
                    else:
                        probs[col] = 0.0
                eliminated_team_probs[team] = probs
                
                # Remove from championship_probs so they don't affect validation/renormalization
                championship_probs.pop(team, None)
                
                round_names = {1: 'R64', 2: 'R32', 3: 'S16', 4: 'E8', 5: 'F4', 6: 'Finals', 7: 'Champion'}
                print(f"    {team}: reached {round_names.get(highest_round, f'R{highest_round}')}")
    
    # Validate and preprocess if base teams provided and validation not disabled
    name_mapping = {}
    if base_teams and args.validation != 'none':
        # Remove eliminated teams from base_teams for validation purposes
        active_base_teams = {k: v for k, v in base_teams.items() if k not in eliminated_team_probs}
        
        print(f"\nValidating team names (mode: {args.validation})...")
        if eliminated_team_probs:
            print(f"  ({len(eliminated_team_probs)} eliminated teams excluded from validation)")
        
        # First, check that championship_probs sum to 1.0 (within tolerance)
        probs_sum = sum(championship_probs.values())
        tolerance = 0.001  # 0.1%
        if abs(probs_sum - 1.0) > tolerance:
            if args.validation == 'strict':
                print(f"\nError: Championship probabilities sum to {probs_sum:.6f}, expected 1.0 (tolerance: {tolerance})")
                print("Aborting due to validation error (strict mode)")
                sys.exit(1)
            else:
                print(f"\nWarning: Championship probabilities sum to {probs_sum:.6f}, expected 1.0")
        else:
            print(f"  Championship probs sum: {probs_sum:.6f} ✓")
        
        # Expand First Four combo teams for validation
        # e.g. "Texas/NC State" -> "Texas" and "NC State" as separate entries
        expanded_base_teams = {}
        combo_team_map = {}  # component_name -> combo_name
        for team_name, info in active_base_teams.items():
            if '/' in team_name:
                components = [c.strip() for c in team_name.split('/')]
                for component in components:
                    expanded_base_teams[component] = info
                    combo_team_map[component] = team_name
            else:
                expanded_base_teams[team_name] = info
        
        if combo_team_map:
            combo_names = set(combo_team_map.values())
            print(f"\n  Expanded {len(combo_names)} First Four combo teams into {len(combo_team_map)} individual teams for matching")
        
        # Validate team names against the EXPANDED list (68 individual teams)
        name_mapping, validation_passed = validate_team_names(
            list(championship_probs.keys()),
            expanded_base_teams,
            args.validation
        )
        
        if not validation_passed and args.validation == 'strict':
            print("\nAborting due to validation errors (strict mode)")
            sys.exit(1)
        
        # Apply name mapping to championship_probs
        if name_mapping:
            mapped_probs = {}
            for odds_name, prob in championship_probs.items():
                if odds_name in name_mapping:
                    mapped_probs[name_mapping[odds_name]] = prob
                # Note: unmatched teams are NOT kept (they'll be filtered out)
            championship_probs = mapped_probs
            
            # Also apply mapping to game_odds if present
            if game_odds:
                for game in game_odds:
                    if game.get('home_team') in name_mapping:
                        game['home_team'] = name_mapping[game['home_team']]
                    if game.get('away_team') in name_mapping:
                        game['away_team'] = name_mapping[game['away_team']]
        
        # Merge First Four combo teams back together (after fuzzy matching)
        # Now "Texas" and "NC State" are properly matched, merge into "Texas/NC State"
        if combo_team_map:
            championship_probs, num_merges = merge_first_four_teams(
                championship_probs, active_base_teams, game_odds
            )
        
        # Filter to only active teams in base_teams (eliminated already removed)
        filtered_probs = {name: prob for name, prob in championship_probs.items() 
                         if name in active_base_teams}
        
        if len(filtered_probs) < len(championship_probs):
            removed_count = len(championship_probs) - len(filtered_probs)
            print(f"\n  Filtered out {removed_count} teams not in base-teams")
        
        # Add missing active teams (in active_base_teams but not in odds)
        missing_teams = set(active_base_teams.keys()) - set(filtered_probs.keys())
        if missing_teams and args.validation == 'assumedLost':
            # Assumed lost mode: all missing teams get 0 probability (tiny epsilon for computation)
            print(f"\n  Adding {len(missing_teams)} missing teams as eliminated (assumed lost):")
            for team_name in sorted(missing_teams):
                filtered_probs[team_name] = 1e-10  # Effectively 0
                print(f"    {team_name}: 0 (eliminated)")
        elif missing_teams and args.validation not in ('strict',):
            # Warning mode: use seed base probabilities
            if not SEED_PROBABILITIES:
                if args.seed_probs:
                    load_seed_probabilities(args.seed_probs)
                else:
                    load_seed_probabilities()
            
            if SEED_PROBABILITIES:
                print(f"\n  Adding {len(missing_teams)} missing teams with seed base probabilities:")
                for team_name in sorted(missing_teams):
                    seed = base_teams[team_name].get('seed', 0)
                    if seed > 0 and seed in SEED_PROBABILITIES:
                        base_prob = SEED_PROBABILITIES[seed]['prob_win']
                        filtered_probs[team_name] = base_prob
                        print(f"    {team_name} (seed {seed}): {base_prob:.6f}")
                    else:
                        # Use a small default probability if seed not found
                        default_prob = 0.001
                        filtered_probs[team_name] = default_prob
                        print(f"    {team_name} (seed {seed}, unknown): {default_prob:.6f}")
            else:
                print(f"\n  Warning: Cannot add missing teams - seed probabilities not loaded")
        
        # Renormalize after filtering and adding
        if filtered_probs:
            total = sum(filtered_probs.values())
            if total > 0:
                filtered_probs = {name: prob / total for name, prob in filtered_probs.items()}
                print(f"  Renormalized {len(filtered_probs)} teams (sum: {sum(filtered_probs.values()):.6f})")
        
        championship_probs = filtered_probs
        
        # Also filter game_odds to only include teams in base_teams
        if game_odds:
            game_odds = [g for g in game_odds 
                        if g.get('home_team') in base_teams and g.get('away_team') in base_teams]
    
    # Load seed probabilities if using shaped method (may already be loaded from above)
    if args.method == "shaped" and not SEED_PROBABILITIES:
        if args.seed_probs:
            load_seed_probabilities(args.seed_probs)
        else:
            load_seed_probabilities()
    
    # Create probability CSV (pass base_teams directly since we already loaded it)
    create_probability_csv(
        championship_probs,
        args.output,
        args.base_teams,
        args.method,
        game_odds=game_odds,
        team_current_rounds=team_current_rounds,
        team_eliminated=team_eliminated,
        eliminated_team_probs=eliminated_team_probs
    )
    
    print(f"\nDone! CSV saved to {args.output}")
    
    if args.method == 'shaped':
        print("\nShaped method explanation:")
        print("  - Uses historical seed performance data to determine probability 'shape'")
        print("  - prob_win: Anchored to championship futures (most reliable)")
        print("  - prob_first_game: Anchored to h2h moneylines if available")
        print("  - Intermediate rounds: Interpolated using exponential scaling between anchors")
        print("  - Probabilities renormalized within bracket groups to ensure consistency")
    else:
        print("\nGeometric method explanation:")
        print("  - Assumes equal win probability each round")
        print("  - prob_win = p^6, so p = prob_win^(1/6) per round")


if __name__ == '__main__':
    main()