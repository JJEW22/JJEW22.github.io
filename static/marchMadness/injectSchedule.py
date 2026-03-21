#!/usr/bin/env python3
"""
Inject game schedule data from betting odds into the results bracket.

Reads commence_time from the raw betting odds JSON and matches games
to the results bracket by team names. Adds scheduledTime field to
matching games in the results bracket.

Usage:
    python injectSchedule.py --odds raw_betting_odds.json --results results-bracket-march-madness-2026.json
    python injectSchedule.py --odds raw_betting_odds.json --results results-bracket.json --name-map name_map_2026.json
    python injectSchedule.py --odds raw_betting_odds.json --results results-bracket.json --name-map name_map_2026.json --dry-run
"""

import json
import argparse
import os
import sys
from typing import Dict, List, Optional, Tuple
from difflib import SequenceMatcher


def get_team_name(team):
    """Extract team name from a team object or string."""
    if not team:
        return None
    if isinstance(team, dict):
        return team.get('name')
    return str(team)


def normalize_name(name: str) -> str:
    """Normalize a team name for fuzzy matching."""
    if not name:
        return ''
    return name.lower().strip().replace('.', '').replace("'", '').replace('-', ' ')


def fuzzy_match(name1: str, name2: str) -> float:
    """Compute similarity ratio between two names."""
    return SequenceMatcher(None, normalize_name(name1), normalize_name(name2)).ratio()


def find_best_match(odds_name: str, bracket_names: List[str], threshold: float = 0.6) -> Optional[str]:
    """Find the best matching bracket name for an odds team name."""
    # Try exact match first
    for bn in bracket_names:
        if normalize_name(odds_name) == normalize_name(bn):
            return bn
    
    # Try substring match (odds names often have mascot appended)
    odds_lower = normalize_name(odds_name)
    for bn in bracket_names:
        bn_lower = normalize_name(bn)
        if bn_lower in odds_lower or odds_lower in bn_lower:
            return bn
    
    # Fuzzy match
    best_score = 0
    best_match = None
    for bn in bracket_names:
        score = fuzzy_match(odds_name, bn)
        if score > best_score:
            best_score = score
            best_match = bn
    
    if best_score >= threshold:
        return best_match
    return None


def load_name_map(name_map_path: str) -> Dict[str, str]:
    """Load manual name mappings from JSON file."""
    if not name_map_path or not os.path.exists(name_map_path):
        return {}
    with open(name_map_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def get_all_bracket_team_names(results_bracket: dict) -> List[str]:
    """Extract all unique team names from the results bracket."""
    names = set()
    round_keys = ['round1', 'round2', 'round3', 'round4', 'round5', 'round6']
    for rk in round_keys:
        for game in results_bracket.get(rk, []):
            if not game:
                continue
            t1 = get_team_name(game.get('team1'))
            t2 = get_team_name(game.get('team2'))
            if t1:
                names.add(t1)
            if t2:
                names.add(t2)
    return list(names)


def match_odds_game_to_bracket(
    odds_game: dict,
    results_bracket: dict,
    name_map: Dict[str, str],
    bracket_names: List[str]
) -> Optional[Tuple[str, int]]:
    """
    Match an odds game to a bracket game.
    
    Returns (round_key, game_index) or None if no match found.
    """
    odds_home = odds_game.get('home_team', '')
    odds_away = odds_game.get('away_team', '')
    
    # Apply name map
    mapped_home = name_map.get(odds_home, odds_home)
    mapped_away = name_map.get(odds_away, odds_away)
    
    # Try to find matching bracket names
    bracket_home = find_best_match(mapped_home, bracket_names)
    bracket_away = find_best_match(mapped_away, bracket_names)
    
    if not bracket_home or not bracket_away:
        return None
    
    # Search through bracket games
    round_keys = ['round1', 'round2', 'round3', 'round4', 'round5', 'round6']
    for rk in round_keys:
        for i, game in enumerate(results_bracket.get(rk, [])):
            if not game:
                continue
            t1 = get_team_name(game.get('team1'))
            t2 = get_team_name(game.get('team2'))
            
            if not t1 or not t2:
                continue
            
            # Check both orderings
            if (t1 == bracket_home and t2 == bracket_away) or \
               (t1 == bracket_away and t2 == bracket_home):
                return (rk, i)
    
    return None


def main():
    parser = argparse.ArgumentParser(description='Inject schedule data from odds into results bracket')
    parser.add_argument('--odds', required=True, help='Path to raw_betting_odds.json')
    parser.add_argument('--results', required=True, help='Path to results bracket JSON')
    parser.add_argument('--name-map', help='Path to name mapping JSON (odds name -> bracket name)')
    parser.add_argument('--output', help='Output path (default: overwrite results bracket)')
    parser.add_argument('--dry-run', action='store_true', help='Print matches without modifying files')
    
    args = parser.parse_args()
    
    # Load odds
    if not os.path.exists(args.odds):
        print(f"Error: Odds file not found: {args.odds}")
        sys.exit(1)
    
    with open(args.odds, 'r', encoding='utf-8') as f:
        odds_data = json.load(f)
    
    # Extract game odds (handle both formats: direct list or nested under 'game_odds')
    if isinstance(odds_data, list):
        game_odds = odds_data
    elif isinstance(odds_data, dict):
        game_odds = odds_data.get('game_odds', odds_data.get('games', []))
    else:
        game_odds = []
    
    print(f"Loaded {len(game_odds)} games from odds file")
    
    # Load results bracket
    if not os.path.exists(args.results):
        print(f"Error: Results bracket not found: {args.results}")
        sys.exit(1)
    
    with open(args.results, 'r', encoding='utf-8') as f:
        results_bracket = json.load(f)
    
    # Load name map
    name_map = load_name_map(args.name_map)
    if name_map:
        print(f"Loaded {len(name_map)} name mappings")
    
    # Get all bracket team names for matching
    bracket_names = get_all_bracket_team_names(results_bracket)
    print(f"Found {len(bracket_names)} teams in bracket")
    
    # Match and inject
    matched = 0
    unmatched = 0
    already_scheduled = 0
    
    for odds_game in game_odds:
        commence_time = odds_game.get('commence_time')
        if not commence_time:
            continue
        
        odds_home = odds_game.get('home_team', '?')
        odds_away = odds_game.get('away_team', '?')
        
        match = match_odds_game_to_bracket(odds_game, results_bracket, name_map, bracket_names)
        
        if match:
            rk, gi = match
            game = results_bracket[rk][gi]
            t1 = get_team_name(game.get('team1'))
            t2 = get_team_name(game.get('team2'))
            
            if game.get('scheduledTime'):
                already_scheduled += 1
                if args.dry_run:
                    print(f"  [SKIP] {odds_home} vs {odds_away} -> {rk}[{gi}] ({t1} vs {t2}) - already has schedule")
                continue
            
            if args.dry_run:
                print(f"  [MATCH] {odds_home} vs {odds_away} -> {rk}[{gi}] ({t1} vs {t2}) @ {commence_time}")
            else:
                game['scheduledTime'] = commence_time
            matched += 1
        else:
            unmatched += 1
            if args.dry_run:
                print(f"  [NO MATCH] {odds_home} vs {odds_away}")
    
    print(f"\nResults:")
    print(f"  Matched: {matched}")
    print(f"  Already scheduled: {already_scheduled}")
    print(f"  Unmatched: {unmatched}")
    
    if not args.dry_run and matched > 0:
        output_path = args.output or args.results
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(results_bracket, f, indent=2)
        print(f"\nUpdated results bracket saved to {output_path}")
    elif args.dry_run:
        print(f"\n(Dry run - no files modified)")


if __name__ == '__main__':
    main()