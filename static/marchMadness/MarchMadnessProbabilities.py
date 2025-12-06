#!/usr/bin/env python3
"""
Calculate win probabilities for March Madness bracket competition.

This script simulates all possible outcomes for remaining games and calculates
the probability of each participant winning the competition.
"""

import pandas as pd
import numpy as np
import os
import json
import argparse

# Constants
CHOSEN_TEAM = 'Chosen Winner'
CHOSEN_TEAM_COL = 'Chosen winner col'
CHOSEN_TEAM_ROW = 'Chosen winner row'
CHOSEN_UPPER = 'Chosen Upper'
UPPER_TEAM_ROW = 'Upper team row'
UPPER_TEAM_COL = 'Upper team col'
CHOSEN_LOWER = 'Chosen Lower'
LOWER_TEAM_ROW = 'Lower team row'
LOWER_TEAM_COL = 'Lower team col'
REGION = 'Region'
ROUND = 'Round'
SEED = 'SEED'
END_TOKEN = 'END'
IS_PARENT_UPPER = 'ParentIsUpper'
PARENT = 'Parent_id'

SCORE_FOR_ROUND = [0, 10, 20, 30, 50, 80, 130]
SEED_FACTOR = [0, 1, 2, 3, 4, 5, 6]

# Default configuration
DEFAULT_BRACKET_SHEET_NAME = 'madness'


def letter_to_number(letter):
    """Convert Excel column letter to 0-indexed number."""
    list_letters = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','al', 'aj', 'ag', 'ad', 'aa']
    list_numbers = list(range(0,26)) + [37, 35, 32, 29, 26]
    dictionary_thing = dict(map(lambda i,j : (i,j), list_letters, list_numbers))
    lower_letter = letter.lower()
    return dictionary_thing[lower_letter]


def extract_from_bracket(bracket_structure, bracket):
    """Extract bracket picks from an Excel bracket using the bracket structure."""
    main_dictionary = dict()
    for index, data_row in bracket_structure.iterrows():
        row_info = dict()
        col = letter_to_number(data_row[CHOSEN_TEAM_COL])
        row = data_row[CHOSEN_TEAM_ROW] - 2
        
        row_info[CHOSEN_TEAM] = bracket.iloc[row, col]
        row_info[ROUND] = data_row[ROUND]
        row_info[REGION] = data_row[REGION]
        row_info[CHOSEN_UPPER] = bracket.iloc[data_row[UPPER_TEAM_ROW] - 2, letter_to_number(data_row[UPPER_TEAM_COL])]
        row_info[CHOSEN_LOWER] = bracket.iloc[data_row[LOWER_TEAM_ROW] - 2, letter_to_number(data_row[LOWER_TEAM_COL])]
        row_info[PARENT] = data_row[PARENT]
        row_info[IS_PARENT_UPPER] = data_row[IS_PARENT_UPPER]
        
        main_dictionary[index] = row_info
    
    return main_dictionary


def load_teams(teams_file):
    """Load teams from CSV file and create seed lookup."""
    teams_df = pd.read_csv(teams_file)
    seed_dict = {}
    for _, row in teams_df.iterrows():
        seed_dict[row['Team']] = row['Seed']
    return seed_dict


def seed_for_team(team_name, seed_dict):
    """Get the seed for a team, returning 0 if not found."""
    if pd.isna(team_name):
        return 0
    return seed_dict.get(team_name, 0)


def compute_current_score(results_bracket, other_bracket, seed_dict, 
                          scoring_vector=None, rounds=None, regions=None, 
                          apply_seed_bonus=True):
    """Compute the score for a bracket against results."""
    if scoring_vector is None:
        scoring_vector = SCORE_FOR_ROUND
    if rounds is None:
        rounds = {1, 2, 3, 4, 5, 6}
    if regions is None:
        regions = {'East', 'West', 'South', 'Midwest', 'Finals'}
    
    total_score = 0
    for index, row_data in other_bracket.iterrows():
        results_row = results_bracket.loc[index]
        
        if (results_row[CHOSEN_TEAM] == row_data[CHOSEN_TEAM] and 
            results_row[ROUND] in rounds and 
            results_row[REGION] in regions):
            # Score for correct pick
            total_score += scoring_vector[results_row[ROUND]]
            
            # Points for upset bonus
            if apply_seed_bonus:
                top_seed = seed_for_team(results_row[CHOSEN_UPPER], seed_dict)
                bottom_seed = seed_for_team(results_row[CHOSEN_LOWER], seed_dict)
                seed_factor = SEED_FACTOR[results_row[ROUND]]
                upset_score = (top_seed - bottom_seed) * (1 - 2 * (results_row[CHOSEN_LOWER] == row_data[CHOSEN_TEAM]))
                total_score += max(0, seed_factor * upset_score)
    
    return total_score


def create_hypothetical_bracket(current_bracket, games, victory_string):
    """Create a hypothetical bracket by simulating game outcomes."""
    new_bracket = current_bracket.copy()
    
    for index in range(len(games)):
        game = games[index]
        victory = victory_string[index]
        
        if victory == '1':
            chosen_winner = new_bracket.loc[game, CHOSEN_UPPER]
        else:
            chosen_winner = new_bracket.loc[game, CHOSEN_LOWER]
        
        new_bracket.loc[game, CHOSEN_TEAM] = chosen_winner
        
        # Propagate winner to parent game
        if new_bracket.loc[game, PARENT] != END_TOKEN:
            parent_id = new_bracket.loc[game, PARENT]
            if new_bracket.loc[game, IS_PARENT_UPPER]:
                new_bracket.loc[parent_id, CHOSEN_UPPER] = chosen_winner
            else:
                new_bracket.loc[parent_id, CHOSEN_LOWER] = chosen_winner
    
    return new_bracket


def find_remaining_games(results_bracket):
    """Find all games that haven't been decided yet."""
    remaining_games = []
    for game_id, row in results_bracket.iterrows():
        if pd.isnull(row[CHOSEN_TEAM]):
            remaining_games.append(game_id)
    return remaining_games


def generate_random_outcome(num_games):
    """Generate a random outcome string (e.g., '101001' for 6 games)."""
    return ''.join(str(np.random.randint(0, 2)) for _ in range(num_games))


def calculate_win_probabilities(
    bracket_structure_path,
    results_bracket_path,
    brackets_dir,
    participants,
    teams_file,
    bracket_sheet_name=DEFAULT_BRACKET_SHEET_NAME,
    apply_seed_bonus=True,
    bonus_stars=None,
    max_simulations=None
):
    """
    Calculate win probabilities for all participants.
    
    Args:
        bracket_structure_path: Path to Excel file with bracket structure (SelectionsSheets)
        results_bracket_path: Path to Excel file with current results
        brackets_dir: Directory containing participant bracket files
        participants: List of participant names
        teams_file: Path to CSV file with team seeds
        bracket_sheet_name: Name of the sheet in bracket Excel files
        apply_seed_bonus: Whether to apply upset bonus points
        bonus_stars: Optional dict of {name: bonus_points} for bonus stars
        max_simulations: Maximum number of outcomes to simulate. If None or if total
                        outcomes is less than this, all outcomes are simulated.
                        Otherwise, random sampling (Monte Carlo) is used.
    
    Returns:
        Dict of {participant_name: win_probability}
    """
    # Load bracket structure
    bracket_structure = pd.read_excel(bracket_structure_path, sheet_name='SelectionsSheets', index_col='Game_id')
    
    # Load teams/seeds
    seed_dict = load_teams(teams_file)
    
    # Load results bracket
    results_excel = pd.read_excel(results_bracket_path, sheet_name=bracket_sheet_name)
    results_bracket_dict = extract_from_bracket(bracket_structure, results_excel)
    results_bracket = pd.DataFrame(results_bracket_dict).transpose()
    
    # Load all participant brackets
    name_to_bracket = {}
    for name in participants:
        bracket_path = os.path.join(brackets_dir, f'{name}-bracket-march-madness-{get_year_from_path(results_bracket_path)}.xlsx')
        if os.path.exists(bracket_path):
            bracket_excel = pd.read_excel(bracket_path, sheet_name=bracket_sheet_name)
            bracket_dict = extract_from_bracket(bracket_structure, bracket_excel)
            name_to_bracket[name] = pd.DataFrame(bracket_dict).transpose()
        else:
            print(f"Warning: Bracket not found for {name} at {bracket_path}")
    
    # Find remaining games
    remaining_games = find_remaining_games(results_bracket)
    num_remaining = len(remaining_games)
    print(f"Found {num_remaining} remaining games")
    
    # Handle case where tournament is over
    if num_remaining == 0:
        scores = []
        for name, bracket in name_to_bracket.items():
            score = compute_current_score(results_bracket, bracket, seed_dict,
                                         apply_seed_bonus=apply_seed_bonus)
            if bonus_stars and name in bonus_stars:
                score += bonus_stars[name]
            scores.append((name, score))
        
        sorted_scores = sorted(scores, key=lambda x: x[1], reverse=True)
        winner = sorted_scores[0][0]
        return {name: (1.0 if name == winner else 0.0) for name in name_to_bracket.keys()}
    
    # Determine whether to use exhaustive or Monte Carlo simulation
    total_possible_outcomes = 2 ** num_remaining
    use_monte_carlo = max_simulations is not None and total_possible_outcomes > max_simulations
    
    if use_monte_carlo:
        num_simulations = max_simulations
        print(f"Total possible outcomes: {total_possible_outcomes:,}")
        print(f"Using Monte Carlo sampling with {num_simulations:,} random simulations")
    else:
        num_simulations = total_possible_outcomes
        if max_simulations is not None:
            print(f"Total outcomes ({total_possible_outcomes:,}) <= max_simulations ({max_simulations:,})")
        print(f"Simulating all {num_simulations:,} possible outcomes...")
    
    # Simulate outcomes
    number_of_wins = {name: 0 for name in name_to_bracket.keys()}
    places = {name: [] for name in name_to_bracket.keys()}
    
    for i in range(num_simulations):
        if (i + 1) % 10000 == 0:
            print(f"  Processed {i + 1:,}/{num_simulations:,} outcomes...")
        
        # Generate outcome - either sequential (exhaustive) or random (Monte Carlo)
        if use_monte_carlo:
            outcome = generate_random_outcome(num_remaining)
        else:
            outcome = format(i, f'0{num_remaining}b')
        
        # Create hypothetical results
        hypothetical_results = create_hypothetical_bracket(results_bracket, remaining_games, outcome)
        
        # Compute score for each participant
        all_scores = []
        for name, bracket in name_to_bracket.items():
            score = compute_current_score(hypothetical_results, bracket, seed_dict,
                                         apply_seed_bonus=apply_seed_bonus)
            if bonus_stars and name in bonus_stars:
                score += bonus_stars[name]
            all_scores.append((name, score))
        
        # Sort by score
        sorted_scores = sorted(all_scores, key=lambda x: x[1], reverse=True)
        
        # Record places
        for place, (name, score) in enumerate(sorted_scores):
            places[name].append(place + 1)
            if place == 0:
                number_of_wins[name] += 1
    
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
        print(f"{name}: {prob*100:.2f}% win probability, avg place: {avg_place:.1f}")
    
    return win_probabilities


def get_year_from_path(path):
    """Extract year from a bracket path."""
    import re
    match = re.search(r'20\d{2}', path)
    if match:
        return match.group()
    return '2026'


def main():
    parser = argparse.ArgumentParser(description='Calculate March Madness win probabilities')
    parser.add_argument('--year', default='2026', help='Tournament year')
    parser.add_argument('--base-dir', default='.', help='Base directory for bracket files')
    parser.add_argument('--output', default='winProbabilities.json', help='Output JSON file')
    parser.add_argument('--participants', nargs='+', help='List of participant names')
    parser.add_argument('--participants-file', help='JSON file with list of participants')
    parser.add_argument('--no-seed-bonus', action='store_true', help='Disable upset bonus')
    parser.add_argument('--max-simulations', type=int, default=100000,
                       help='Maximum number of simulations. If total outcomes exceeds this, '
                            'Monte Carlo sampling is used. Default: 100000')
    parser.add_argument('--seed', type=int, default=None,
                       help='Random seed for reproducible Monte Carlo results')
    
    args = parser.parse_args()
    
    # Set random seed if provided
    if args.seed is not None:
        np.random.seed(args.seed)
        print(f"Using random seed: {args.seed}")
    
    # Set up paths
    year = args.year
    base_dir = args.base_dir
    
    bracket_structure_path = os.path.join(base_dir, 'brackets', 'bracket-structure.xlsx')
    results_path = os.path.join(base_dir, f'results-bracket-march-madness-{year}.xlsx')
    brackets_dir = os.path.join(base_dir, f'brackets')
    teams_file = os.path.join(base_dir, f'ThisYearTeams{year}.csv')
    participants_path = os.path.join(base_dir, 'participants.json')
    
    # Get participants
    if args.participants:
        participants = args.participants
    elif args.participants_file:
        with open(args.participants_file) as f:
            participants = json.load(f)
    elif os.path.exists(participants_path):
        with open(participants_path, 'r') as file:
            participants = json.load(file)
    else:
        # Try to find participants from bracket files
        participants = []
        if os.path.exists(brackets_dir):
            for f in os.listdir(brackets_dir):
                if f.endswith(f'-bracket-march-madness-{year}.xlsx'):
                    name = f.replace(f'-bracket-march-madness-{year}.xlsx', '')
                    participants.append(name)
        
        if not participants:
            print("Error: No participants specified. Use --participants or --participants-file")
            return
    
    print(f"Calculating win probabilities for {len(participants)} participants...")
    print(f"Participants: {participants}")
    
    # Calculate probabilities
    probabilities = calculate_win_probabilities(
        bracket_structure_path=bracket_structure_path,
        results_bracket_path=results_path,
        brackets_dir=brackets_dir,
        participants=participants,
        teams_file=teams_file,
        apply_seed_bonus=not args.no_seed_bonus,
        max_simulations=args.max_simulations
    )
    
    # Save to JSON
    output_path = os.path.join(base_dir, args.output)
    with open(output_path, 'w') as f:
        json.dump(probabilities, f, indent=2)
    
    print(f"\nWin probabilities saved to {output_path}")


if __name__ == '__main__':
    main()