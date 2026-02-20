#!/usr/bin/env python3
"""
Debug script to trace through scoring calculation for a single outcome.
"""

import sys
import os
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from MarchMadnessProbabilities import (
    load_scoring_config,
    load_bracket,
    load_teams,
    find_remaining_games,
    compute_base_scores,
    get_team_name,
    get_winner_name,
    ROUND_KEYS,
    ROUND_BIT_OFFSETS,
    GAMES_PER_ROUND,
    TOTAL_BRACKET_BITS,
    SCORE_FOR_ROUND,
    
    create_hypothetical_bracket,
    compute_score_delta,
    
    build_participant_pick_bitstring,
    build_dependency_mask,
    build_all_dependency_masks,
    precompute_participant_scoring_data,
    build_points_arrays,
    compute_score_xnor,
    get_fixed_bit_position,
    
    build_decided_games_bits,
    build_remaining_games_bit_mapping,
    expand_to_full_bitstring,
)


def debug_scoring(results_bracket, participant_bracket, teams_data, remaining_games, outcome):
    """Debug scoring for a single outcome."""
    
    print("=" * 70)
    print("DEBUG SCORING")
    print("=" * 70)
    
    # Create hypothetical bracket
    hypo = create_hypothetical_bracket(results_bracket, remaining_games, outcome)
    
    # Original score delta
    original_delta = compute_score_delta(hypo, participant_bracket, teams_data, True, remaining_games)
    print(f"\nOriginal delta: {original_delta}")
    
    # Build data for fast method
    base_bits, _ = build_decided_games_bits(results_bracket)
    remaining_bit_positions = build_remaining_games_bit_mapping(remaining_games)
    full_bits = expand_to_full_bitstring(outcome, base_bits, remaining_bit_positions)
    outcome_int = int(full_bits, 2)
    
    print(f"\nOutcome string (short): {outcome}")
    print(f"Full bits: {full_bits}")
    print(f"Outcome int: {outcome_int}")
    
    # Build participant pick string
    pick_bits = build_participant_pick_bitstring(participant_bracket, results_bracket)
    pick_int = int(pick_bits.replace('?', '0'), 2)
    
    print(f"\nPick bits: {pick_bits}")
    print(f"Pick int: {pick_int}")
    
    # XNOR
    xnor_result = ~(outcome_int ^ pick_int) & ((1 << TOTAL_BRACKET_BITS) - 1)
    print(f"\nXNOR result: {bin(xnor_result)}")
    
    # Valid positions
    valid_positions = [i for i, c in enumerate(pick_bits) if c != '?']
    print(f"\nValid positions (string positions): {valid_positions}")
    
    # Build dependency masks
    dependency_masks = build_all_dependency_masks(participant_bracket)
    
    # Build points arrays
    points_team1, points_team2 = build_points_arrays(results_bracket, teams_data, True)
    
    # Trace through each remaining game
    print("\n" + "-" * 70)
    print("TRACING EACH REMAINING GAME")
    print("-" * 70)
    
    for i, (round_key, game_idx) in enumerate(remaining_games):
        round_num = ROUND_KEYS.index(round_key) + 1
        string_pos = get_fixed_bit_position(round_key, game_idx)
        int_bit_pos = 62 - string_pos
        
        # Get info from hypothetical bracket
        hypo_game = hypo[round_key][game_idx]
        hypo_winner = get_winner_name(hypo_game)
        hypo_team1 = get_team_name(hypo_game.get('team1'))
        hypo_team2 = get_team_name(hypo_game.get('team2'))
        
        # Get info from participant bracket
        picks_round = participant_bracket.get(round_key, [])
        if game_idx < len(picks_round) and picks_round[game_idx]:
            pick_game = picks_round[game_idx]
            pick_winner = get_winner_name(pick_game)
            pick_team1 = get_team_name(pick_game.get('team1'))
            pick_team2 = get_team_name(pick_game.get('team2'))
        else:
            pick_winner = None
            pick_team1 = None
            pick_team2 = None
        
        print(f"\n{round_key} game {game_idx} (string_pos={string_pos}, int_bit={int_bit_pos}):")
        print(f"  Hypo: {hypo_team1} vs {hypo_team2} -> winner: {hypo_winner}")
        print(f"  Pick: {pick_team1} vs {pick_team2} -> winner: {pick_winner}")
        
        # Outcome bit
        outcome_bit = (outcome_int >> int_bit_pos) & 1
        print(f"  Outcome bit: {outcome_bit} ({'team1 wins' if outcome_bit == 1 else 'team2 wins'})")
        
        # Pick bit
        pick_char = pick_bits[string_pos]
        print(f"  Pick char at string_pos {string_pos}: '{pick_char}'")
        
        # Original method scoring
        original_match = (pick_winner == hypo_winner) if pick_winner and hypo_winner else False
        original_points = SCORE_FOR_ROUND[round_num] if original_match else 0
        print(f"  Original: match={original_match}, points={original_points}")
        
        # XNOR method
        if string_pos in valid_positions:
            xnor_bit = (xnor_result >> int_bit_pos) & 1
            dep_mask = dependency_masks[string_pos]
            dep_satisfied = (xnor_result & dep_mask) == dep_mask
            
            print(f"  XNOR bit at int_bit {int_bit_pos}: {xnor_bit}")
            print(f"  Dependency mask: {bin(dep_mask)}")
            print(f"  Dependencies satisfied: {dep_satisfied}")
            
            if xnor_bit and dep_satisfied:
                if outcome_bit == 1:
                    xnor_points = points_team1[string_pos]
                else:
                    xnor_points = points_team2[string_pos]
                print(f"  XNOR points: {xnor_points}")
            else:
                print(f"  XNOR points: 0 (xnor_bit={xnor_bit}, dep_satisfied={dep_satisfied})")
        else:
            print(f"  Position {string_pos} not in valid_positions (no pick)")
    
    # Final XNOR calculation
    scoring_data = precompute_participant_scoring_data(
        {'test': participant_bracket}, results_bracket, teams_data, True
    )
    data = scoring_data['test']
    fast_delta = compute_score_xnor(
        outcome_int,
        data['pick_int'],
        data['valid_mask'],
        data['dependency_masks'],
        points_team1,
        points_team2,
        data['valid_positions']
    )
    
    print("\n" + "=" * 70)
    print(f"FINAL: Original delta = {original_delta}, Fast delta = {fast_delta}")
    print(f"MATCH: {original_delta == fast_delta}")
    print("=" * 70)
    
    return original_delta, fast_delta


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Debug scoring calculation')
    parser.add_argument('--results', required=True, help='Path to results bracket JSON file')
    parser.add_argument('--bracket', required=True, help='Path to a participant bracket JSON file')
    parser.add_argument('--teams', default=None, help='Path to teams JSON/CSV file')
    parser.add_argument('--config', default=None, help='Path to scoring-config.json')
    parser.add_argument('--seed', type=int, default=42, help='Random seed')
    
    args = parser.parse_args()
    
    random.seed(args.seed)
    
    load_scoring_config(args.config)
    
    results_bracket = load_bracket(args.results)
    participant_bracket = load_bracket(args.bracket)
    teams_data = load_teams(args.teams, results_bracket) if args.teams else {}
    
    remaining_games = find_remaining_games(results_bracket)
    print(f"Remaining games: {len(remaining_games)}")
    
    # Generate a random outcome
    outcome = ''.join(str(random.randint(0, 1)) for _ in range(len(remaining_games)))
    print(f"Random outcome: {outcome}")
    
    debug_scoring(results_bracket, participant_bracket, teams_data, remaining_games, outcome)


if __name__ == '__main__':
    main()