#!/usr/bin/env python3
"""
Validation script to compare fast methods against original methods.

This script runs both the original and fast implementations on the same
outcomes and compares the results to ensure they match.
"""

import sys
import os
import random
import json

# Add parent directory to path if needed
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from MarchMadnessProbabilities import (
    # Setup functions
    load_scoring_config,
    load_bracket,
    load_teams,
    find_remaining_games,
    compute_base_scores,
    get_team_name,
    get_winner_name,
    ROUND_KEYS,
    PROB_COLUMNS,
    
    # Original methods
    create_hypothetical_bracket,
    calculate_outcome_probability,
    compute_score_delta,
    
    # Fast methods - probability
    build_team_probability_matrix,
    compute_rounds_reached_topdown,
    calculate_probability_fast,
    
    # Fast methods - scoring
    precompute_participant_scoring_data,
    build_points_arrays,
    build_score_array_for_outcome,
    compute_score_xnor_v2,
    
    # Bitstring helpers
    build_decided_games_bits,
    build_remaining_games_bit_mapping,
    expand_to_full_bitstring,
)


def generate_random_outcomes(num_remaining: int, num_outcomes: int) -> list:
    """Generate random outcome strings."""
    outcomes = []
    for _ in range(num_outcomes):
        outcome = ''.join(str(random.randint(0, 1)) for _ in range(num_remaining))
        outcomes.append(outcome)
    return outcomes


def validate_probability_calculation(
    results_bracket: dict,
    teams_data: dict,
    remaining_games: list,
    num_tests: int = 100
) -> dict:
    """
    Validate fast probability calculation against original.
    
    Returns dict with validation results.
    """
    print("\n" + "=" * 60)
    print("VALIDATING PROBABILITY CALCULATION")
    print("=" * 60)
    
    num_remaining = len(remaining_games)
    outcomes = generate_random_outcomes(num_remaining, num_tests)
    
    # Build data for fast method
    prob_matrix, team_names = build_team_probability_matrix(results_bracket, teams_data)
    base_bits, _ = build_decided_games_bits(results_bracket)
    remaining_bit_positions = build_remaining_games_bit_mapping(remaining_games)
    
    matches = 0
    mismatches = []
    
    for i, outcome in enumerate(outcomes):
        # Original method
        hypo = create_hypothetical_bracket(results_bracket, remaining_games, outcome)
        original_prob = calculate_outcome_probability(hypo, teams_data)
        
        # Fast method
        full_bits = expand_to_full_bitstring(outcome, base_bits, remaining_bit_positions)
        outcome_int = int(full_bits, 2)
        fast_prob = calculate_probability_fast(outcome_int, prob_matrix)
        
        # Compare (allow small floating point differences)
        if abs(original_prob - fast_prob) < 1e-10:
            matches += 1
        else:
            rel_diff = abs(original_prob - fast_prob) / max(original_prob, fast_prob, 1e-20)
            mismatches.append({
                'outcome': outcome[:20] + '...' if len(outcome) > 20 else outcome,
                'original': original_prob,
                'fast': fast_prob,
                'abs_diff': abs(original_prob - fast_prob),
                'rel_diff': rel_diff
            })
        
        if (i + 1) % 20 == 0:
            print(f"  Tested {i + 1}/{num_tests} outcomes...")
    
    print(f"\nResults: {matches}/{num_tests} matched")
    
    if mismatches:
        print(f"\nMismatches ({len(mismatches)}):")
        for m in mismatches[:10]:  # Show first 10
            print(f"  Outcome: {m['outcome']}")
            print(f"    Original: {m['original']:.10e}")
            print(f"    Fast:     {m['fast']:.10e}")
            print(f"    Rel diff: {m['rel_diff']:.2%}")
    
    return {
        'total': num_tests,
        'matches': matches,
        'mismatches': len(mismatches),
        'mismatch_details': mismatches
    }


def validate_score_calculation(
    results_bracket: dict,
    teams_data: dict,
    name_to_bracket: dict,
    remaining_games: list,
    apply_seed_bonus: bool = True,
    num_tests: int = 100
) -> dict:
    """
    Validate fast score calculation against original.
    
    Returns dict with validation results.
    """
    print("\n" + "=" * 60)
    print("VALIDATING SCORE CALCULATION")
    print("=" * 60)
    
    num_remaining = len(remaining_games)
    outcomes = generate_random_outcomes(num_remaining, num_tests)
    
    # Build data for fast method
    base_bits, _ = build_decided_games_bits(results_bracket)
    remaining_bit_positions = build_remaining_games_bit_mapping(remaining_games)
    remaining_positions = set(remaining_bit_positions)
    
    scoring_data = precompute_participant_scoring_data(
        name_to_bracket, results_bracket, teams_data, apply_seed_bonus, remaining_positions
    )
    
    # We need base scores for computing full scores
    base_scores = compute_base_scores(results_bracket, name_to_bracket, teams_data, apply_seed_bonus, None)
    
    all_matches = 0
    all_tests = 0
    mismatches = []
    
    for i, outcome in enumerate(outcomes):
        # Original method - compute hypothetical bracket
        hypo = create_hypothetical_bracket(results_bracket, remaining_games, outcome)
        
        # Fast method - convert to full bitstring
        full_bits = expand_to_full_bitstring(outcome, base_bits, remaining_bit_positions)
        outcome_int = int(full_bits, 2)
        
        for name, bracket in name_to_bracket.items():
            # Original score delta - compute with breakdown
            original_base_pts = 0
            original_seed_bonus = 0
            
            for round_key, game_index in remaining_games:
                round_num = ROUND_KEYS.index(round_key) + 1
                hypo_game = hypo[round_key][game_index]
                picks_round = bracket.get(round_key, [])
                
                if game_index >= len(picks_round):
                    continue
                
                pick_game = picks_round[game_index]
                if not pick_game:
                    continue
                
                from MarchMadnessProbabilities import get_winner_name, get_team_seed, SCORE_FOR_ROUND, SEED_FACTOR
                hypo_winner = get_winner_name(hypo_game)
                pick_winner = get_winner_name(pick_game)
                
                if not hypo_winner or not pick_winner:
                    continue
                
                if hypo_winner == pick_winner:
                    original_base_pts += SCORE_FOR_ROUND[round_num]
                    
                    if apply_seed_bonus:
                        team1_seed = get_team_seed(hypo_game.get('team1'), teams_data)
                        team2_seed = get_team_seed(hypo_game.get('team2'), teams_data)
                        winner_seed = get_team_seed(hypo_game.get('winner'), teams_data)
                        
                        if team1_seed and team2_seed and winner_seed:
                            expected_winner_seed = min(team1_seed, team2_seed)
                            if winner_seed > expected_winner_seed:
                                upset_bonus = (winner_seed - expected_winner_seed) * SEED_FACTOR[round_num]
                                original_seed_bonus += upset_bonus
            
            original_delta = original_base_pts + original_seed_bonus
            
            # Fast score delta - compute with breakdown using new approach
            data = scoring_data[name]
            
            # Build score array for this outcome
            score_array = build_score_array_for_outcome(outcome_int)
            
            # Compute fast method breakdown
            from MarchMadnessProbabilities import TOTAL_BRACKET_BITS, ROUND_BIT_OFFSETS, GAMES_PER_ROUND, SCORE_FOR_ROUND
            xnor_result = ~(outcome_int ^ data['pick_int']) & ((1 << TOTAL_BRACKET_BITS) - 1)
            
            fast_base_pts = 0
            fast_seed_bonus = 0
            
            for string_pos in data['valid_positions']:
                bit_pos = 62 - string_pos
                
                if not (xnor_result & (1 << bit_pos)):
                    continue
                
                dep_mask = data['dependency_masks'][string_pos]
                if dep_mask == 0:
                    continue
                
                if (xnor_result & dep_mask) == dep_mask:
                    pts = score_array[string_pos]
                    
                    # Determine round from string_pos to get base points
                    round_num = None
                    for r_idx in range(len(ROUND_BIT_OFFSETS)):
                        offset = ROUND_BIT_OFFSETS[r_idx]
                        num_games = GAMES_PER_ROUND[r_idx]
                        if offset <= string_pos < offset + num_games:
                            round_num = r_idx + 1
                            break
                    
                    if round_num:
                        base_for_round = SCORE_FOR_ROUND[round_num]
                        fast_base_pts += base_for_round
                        fast_seed_bonus += (pts - base_for_round)
            
            fast_delta = fast_base_pts + fast_seed_bonus
            
            all_tests += 1
            if original_delta == fast_delta:
                all_matches += 1
            else:
                mismatches.append({
                    'outcome': outcome[:20] + '...' if len(outcome) > 20 else outcome,
                    'participant': name,
                    'original_delta': original_delta,
                    'original_base': original_base_pts,
                    'original_seed': original_seed_bonus,
                    'fast_delta': fast_delta,
                    'fast_base': fast_base_pts,
                    'fast_seed': fast_seed_bonus,
                    'diff': original_delta - fast_delta
                })
        
        if (i + 1) % 20 == 0:
            print(f"  Tested {i + 1}/{num_tests} outcomes...")
    
    print(f"\nResults: {all_matches}/{all_tests} matched")
    
    if mismatches:
        print(f"\nMismatches ({len(mismatches)}):")
        for m in mismatches[:10]:  # Show first 10
            print(f"  Outcome: {m['outcome']}, Participant: {m['participant']}")
            print(f"    Original: delta={m['original_delta']} (base={m['original_base']}, seed_bonus={m['original_seed']})")
            print(f"    Fast:     delta={m['fast_delta']} (base={m['fast_base']}, seed_bonus={m['fast_seed']})")
            print(f"    Difference: {m['diff']} (base_diff={m['original_base']-m['fast_base']}, seed_diff={m['original_seed']-m['fast_seed']})")
    
    return {
        'total': all_tests,
        'matches': all_matches,
        'mismatches': len(mismatches),
        'mismatch_details': mismatches
    }


def validate_rounds_reached(
    results_bracket: dict,
    remaining_games: list,
    num_tests: int = 50
) -> dict:
    """
    Validate that compute_rounds_reached_topdown correctly identifies
    how far each team made it.
    """
    print("\n" + "=" * 60)
    print("VALIDATING ROUNDS REACHED CALCULATION")
    print("=" * 60)
    
    num_remaining = len(remaining_games)
    outcomes = generate_random_outcomes(num_remaining, num_tests)
    
    # Build data for fast method
    base_bits, _ = build_decided_games_bits(results_bracket)
    remaining_bit_positions = build_remaining_games_bit_mapping(remaining_games)
    
    # Get team names from round 1
    round1 = results_bracket.get('round1', [])
    team_names = []
    for game in round1:
        if game:
            team_names.append(get_team_name(game.get('team1')))
            team_names.append(get_team_name(game.get('team2')))
        else:
            team_names.append(None)
            team_names.append(None)
    while len(team_names) < 64:
        team_names.append(None)
    
    matches = 0
    mismatches = []
    
    for i, outcome in enumerate(outcomes):
        # Create hypothetical bracket (original way)
        hypo = create_hypothetical_bracket(results_bracket, remaining_games, outcome)
        
        # Compute rounds reached using fast method
        full_bits = expand_to_full_bitstring(outcome, base_bits, remaining_bit_positions)
        outcome_int = int(full_bits, 2)
        fast_rounds = compute_rounds_reached_topdown(outcome_int)
        
        # Compute rounds reached from hypothetical bracket (ground truth)
        original_rounds = [1] * 64  # Default: lost in R1
        
        # Check each round for how far teams got
        for round_idx, round_key in enumerate(ROUND_KEYS):
            round_games = hypo.get(round_key, [])
            for game in round_games:
                if not game:
                    continue
                winner_name = get_winner_name(game)
                if winner_name:
                    # Find team index
                    try:
                        team_idx = team_names.index(winner_name)
                        # They made it past this round
                        original_rounds[team_idx] = round_idx + 2  # +2 because round 1 = lost in R1 = 1
                    except ValueError:
                        pass
        
        # Champion gets round 7
        champion = get_team_name(hypo.get('winner'))
        if champion:
            try:
                champ_idx = team_names.index(champion)
                original_rounds[champ_idx] = 7
            except ValueError:
                pass
        
        # Compare
        if original_rounds == fast_rounds:
            matches += 1
        else:
            # Find differences
            diffs = []
            for t_idx in range(64):
                if original_rounds[t_idx] != fast_rounds[t_idx]:
                    diffs.append({
                        'team_idx': t_idx,
                        'team_name': team_names[t_idx],
                        'original': original_rounds[t_idx],
                        'fast': fast_rounds[t_idx]
                    })
            mismatches.append({
                'outcome': outcome[:20] + '...' if len(outcome) > 20 else outcome,
                'differences': diffs
            })
        
        if (i + 1) % 10 == 0:
            print(f"  Tested {i + 1}/{num_tests} outcomes...")
    
    print(f"\nResults: {matches}/{num_tests} matched")
    
    if mismatches:
        print(f"\nMismatches ({len(mismatches)}):")
        for m in mismatches[:5]:  # Show first 5
            print(f"  Outcome: {m['outcome']}")
            for d in m['differences'][:5]:
                print(f"    Team {d['team_idx']} ({d['team_name']}): original={d['original']}, fast={d['fast']}")
    
    return {
        'total': num_tests,
        'matches': matches,
        'mismatches': len(mismatches)
    }


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Validate fast methods against original implementations')
    parser.add_argument('--results', required=True, help='Path to results bracket JSON file')
    parser.add_argument('--brackets-dir', required=True, help='Directory containing participant bracket JSON files')
    parser.add_argument('--teams', default=None, help='Path to teams JSON/CSV file')
    parser.add_argument('--config', default=None, help='Path to scoring-config.json')
    parser.add_argument('--num-tests', type=int, default=100, help='Number of random outcomes to test')
    parser.add_argument('--seed', type=int, default=42, help='Random seed for reproducibility')
    
    args = parser.parse_args()
    
    # Set random seed
    random.seed(args.seed)
    print(f"Using random seed: {args.seed}")
    
    # Load scoring config
    load_scoring_config(args.config)
    
    # Load data
    print("\nLoading data...")
    results_bracket = load_bracket(args.results)
    teams_data = load_teams(args.teams, results_bracket) if args.teams and os.path.exists(args.teams) else {}
    
    # Find remaining games
    remaining_games = find_remaining_games(results_bracket)
    print(f"Remaining games: {len(remaining_games)}")
    
    # Load participant brackets
    name_to_bracket = {}
    if os.path.isdir(args.brackets_dir):
        for filename in os.listdir(args.brackets_dir):
            if filename.endswith('.json'):
                name = filename.replace('.json', '').replace('-bracket', '')
                path = os.path.join(args.brackets_dir, filename)
                try:
                    name_to_bracket[name] = load_bracket(path)
                except:
                    pass
    print(f"Loaded {len(name_to_bracket)} participant brackets")
    
    # Check if we have probability data
    has_prob_data = False
    if teams_data:
        sample_team = next(iter(teams_data.values()))
        has_prob_data = any(col in sample_team for col in PROB_COLUMNS)
    print(f"Has probability data: {has_prob_data}")
    
    results = {}
    
    # Validate rounds reached calculation
    results['rounds_reached'] = validate_rounds_reached(
        results_bracket, remaining_games, num_tests=min(args.num_tests, 50)
    )
    
    # Validate probability calculation (only if we have prob data)
    if has_prob_data:
        results['probability'] = validate_probability_calculation(
            results_bracket, teams_data, remaining_games, num_tests=args.num_tests
        )
    else:
        print("\n(Skipping probability validation - no probability data)")
    
    # Validate score calculation (only if we have participants)
    if name_to_bracket:
        results['scoring'] = validate_score_calculation(
            results_bracket, teams_data, name_to_bracket, remaining_games,
            apply_seed_bonus=True, num_tests=args.num_tests
        )
    else:
        print("\n(Skipping score validation - no participant brackets)")
    
    # Summary
    print("\n" + "=" * 60)
    print("VALIDATION SUMMARY")
    print("=" * 60)
    
    all_passed = True
    for test_name, test_results in results.items():
        status = "PASS" if test_results['mismatches'] == 0 else "FAIL"
        if test_results['mismatches'] > 0:
            all_passed = False
        print(f"{test_name}: {status} ({test_results['matches']}/{test_results['total']} matched)")
    
    print("\n" + ("ALL VALIDATIONS PASSED!" if all_passed else "SOME VALIDATIONS FAILED!"))
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    sys.exit(main())