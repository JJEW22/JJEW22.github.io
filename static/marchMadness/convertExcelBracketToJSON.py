#!/usr/bin/env python3
"""
Convert March Madness bracket Excel files to JSON format.

This script reads Excel bracket files and exports them to a standardized JSON format
that can be used by both the Svelte frontend and Python win probability calculator.
"""

import os
import json
import argparse
import csv
from typing import Dict, List, Optional
from openpyxl import load_workbook


# Constants matching bracketStructure.js
REGION_ORDER = ['East', 'West', 'South', 'Midwest']

MATCHUP_PAIRS = [
    (1, 16), (8, 9), (5, 12), (4, 13),
    (6, 11), (3, 14), (7, 10), (2, 15)
]

# Excel cell mappings for reading brackets
CELL_MAPPINGS = {
    'East': {
        'side': 'left',
        'position': 'top',
        'r1_rows': [7, 11, 15, 19, 23, 27, 31, 35],
        'r2_rows': [8, 12, 16, 20, 24, 28, 32, 36],
        's16_rows': [10, 18, 26, 34],
        'e8_rows': [14, 30],
        'f4_row': 22,
        'seed_col': 'B',
        'team_col': 'C',
        'r2_col': 'E',
        's16_col': 'H',
        'e8_col': 'K',
        'f4_col': 'N',
        'r1_start_index': 0
    },
    'West': {
        'side': 'left',
        'position': 'bottom',
        'r1_rows': [42, 46, 50, 54, 58, 62, 66, 70],
        'r2_rows': [43, 47, 51, 55, 59, 63, 67, 71],
        's16_rows': [45, 53, 61, 69],
        'e8_rows': [49, 65],
        'f4_row': 57,
        'seed_col': 'B',
        'team_col': 'C',
        'r2_col': 'E',
        's16_col': 'H',
        'e8_col': 'K',
        'f4_col': 'N',
        'r1_start_index': 8
    },
    'South': {
        'side': 'right',
        'position': 'top',
        'r1_rows': [7, 11, 15, 19, 23, 27, 31, 35],
        'r2_rows': [8, 12, 16, 20, 24, 28, 32, 36],
        's16_rows': [10, 18, 26, 34],
        'e8_rows': [14, 30],
        'f4_row': 22,
        'seed_col': 'AM',
        'team_col': 'AL',
        'r2_col': 'AJ',
        's16_col': 'AG',
        'e8_col': 'AD',
        'f4_col': 'AA',
        'r1_start_index': 16
    },
    'Midwest': {
        'side': 'right',
        'position': 'bottom',
        'r1_rows': [42, 46, 50, 54, 58, 62, 66, 70],
        'r2_rows': [43, 47, 51, 55, 59, 63, 67, 71],
        's16_rows': [45, 53, 61, 69],
        'e8_rows': [49, 65],
        'f4_row': 57,
        'seed_col': 'AM',
        'team_col': 'AL',
        'r2_col': 'AJ',
        's16_col': 'AG',
        'e8_col': 'AD',
        'f4_col': 'AA',
        'r1_start_index': 24
    }
}

# Championship cells
CHAMPIONSHIP = {
    'left_f4_winner': ('O', 39),   # East/West winner
    'right_f4_winner': ('W', 39),  # South/Midwest winner
    'champion': ('R', 44)
}


def load_teams_from_csv(filepath: str) -> Dict[str, dict]:
    """Load teams from CSV file and return dict mapping name to team data."""
    teams = {}
    with open(filepath, 'r', encoding='utf-8-sig') as f:  # utf-8-sig handles BOM
        reader = csv.DictReader(f)
        for row in reader:
            # Handle different column name cases
            name = row.get('Team') or row.get('TEAM') or row.get('name')
            seed_str = row.get('Seed') or row.get('SEED') or row.get('seed', '0')
            region = row.get('Region') or row.get('REGION') or row.get('region', '')
            
            if name:
                seed = int(seed_str) if seed_str else 0
                teams[name] = {'name': name, 'seed': seed, 'region': region}
    return teams


def find_team(name: str, teams: Dict[str, dict]) -> Optional[dict]:
    """Find team by name with fuzzy matching."""
    if not name:
        return None
    
    name = str(name).strip()
    
    # Direct match
    if name in teams:
        return teams[name].copy()
    
    # Case-insensitive match
    name_lower = name.lower()
    for team_name, team_data in teams.items():
        if team_name.lower() == name_lower:
            return team_data.copy()
    
    # Partial match
    for team_name, team_data in teams.items():
        if name_lower in team_name.lower() or team_name.lower() in name_lower:
            return team_data.copy()
    
    # Return basic team if not found
    return {'name': name, 'seed': 0, 'region': ''}


def get_cell_value(sheet, col: str, row: int) -> Optional[str]:
    """Get cell value from Excel sheet."""
    cell = sheet[f'{col}{row}']
    value = cell.value
    
    if value is None:
        return None
    
    # Handle formula results
    if hasattr(value, 'result'):
        value = value.result
    
    if isinstance(value, str):
        return value.strip() if value.strip() else None
    
    return str(value).strip() if value else None


def create_empty_bracket() -> dict:
    """Create an empty bracket structure."""
    return {
        'round1': [None] * 32,
        'round2': [None] * 16,
        'round3': [None] * 8,
        'round4': [None] * 4,
        'round5': [None] * 2,
        'round6': [None] * 1,
        'winner': None
    }


def initialize_bracket_with_teams(teams: Dict[str, dict]) -> dict:
    """Initialize bracket with teams in correct positions."""
    bracket = create_empty_bracket()
    
    # Group teams by region
    regions = {region: [] for region in REGION_ORDER}
    for team_data in teams.values():
        region = team_data.get('region')
        if region in regions:
            regions[region].append(team_data)
    
    # Sort each region by seed
    for region in regions:
        regions[region].sort(key=lambda t: t.get('seed', 99))
    
    # Populate round 1
    game_index = 0
    for region_name in REGION_ORDER:
        region_teams = regions[region_name]
        
        for seed1, seed2 in MATCHUP_PAIRS:
            team1 = next((t for t in region_teams if t.get('seed') == seed1), None)
            team2 = next((t for t in region_teams if t.get('seed') == seed2), None)
            
            bracket['round1'][game_index] = {
                'team1': team1.copy() if team1 else None,
                'team2': team2.copy() if team2 else None,
                'winner': None,
                'region': region_name,
                'gameId': f'r1-{game_index}'
            }
            game_index += 1
    
    # Initialize later rounds with empty games
    for round_num in range(2, 7):
        round_key = f'round{round_num}'
        num_games = len(bracket[round_key])
        
        for i in range(num_games):
            bracket[round_key][i] = {
                'team1': None,
                'team2': None,
                'winner': None,
                'gameId': f'r{round_num}-{i}'
            }
    
    return bracket


def extract_bracket_from_excel(filepath: str, teams: Dict[str, dict]) -> dict:
    """Extract bracket data from Excel file."""
    workbook = load_workbook(filepath, data_only=True)
    
    # Try to find the bracket sheet
    sheet = None
    for sheet_name in ['madness', 'Bracket', 'Sheet1']:
        if sheet_name in workbook.sheetnames:
            sheet = workbook[sheet_name]
            break
    
    if sheet is None:
        sheet = workbook.active
    
    # Initialize bracket with teams
    bracket = initialize_bracket_with_teams(teams)
    
    # Extract winners from each region
    for region_name, config in CELL_MAPPINGS.items():
        extract_region_winners(sheet, bracket, region_name, config, teams)
    
    # Extract Final Four and Championship
    extract_final_four(sheet, bracket, teams)
    
    return bracket


def extract_region_winners(sheet, bracket: dict, region: str, config: dict, teams: Dict[str, dict]):
    """Extract winners for a region from Excel sheet."""
    start_idx = config['r1_start_index']
    
    # Round 1 winners (from R2 cells)
    for i, row in enumerate(config['r2_rows']):
        winner_name = get_cell_value(sheet, config['r2_col'], row)
        if winner_name:
            winner = find_team(winner_name, teams)
            if winner:
                game_idx = start_idx + i
                bracket['round1'][game_idx]['winner'] = winner
                
                # Populate round 2
                r2_idx = game_idx // 2
                if game_idx % 2 == 0:
                    bracket['round2'][r2_idx]['team1'] = winner
                else:
                    bracket['round2'][r2_idx]['team2'] = winner
    
    # Sweet 16 (Round 2 winners -> Round 3)
    r2_start = start_idx // 2
    for i, row in enumerate(config['s16_rows']):
        winner_name = get_cell_value(sheet, config['s16_col'], row)
        if winner_name:
            winner = find_team(winner_name, teams)
            if winner:
                r2_idx = r2_start + i
                bracket['round2'][r2_idx]['winner'] = winner
                
                # Populate round 3
                r3_idx = r2_idx // 2
                if r2_idx % 2 == 0:
                    bracket['round3'][r3_idx]['team1'] = winner
                else:
                    bracket['round3'][r3_idx]['team2'] = winner
    
    # Elite 8 (Round 3 winners -> Round 4)
    r3_start = start_idx // 4
    for i, row in enumerate(config['e8_rows']):
        winner_name = get_cell_value(sheet, config['e8_col'], row)
        if winner_name:
            winner = find_team(winner_name, teams)
            if winner:
                r3_idx = r3_start + i
                bracket['round3'][r3_idx]['winner'] = winner
                
                # Populate round 4
                r4_idx = r3_idx // 2
                if r3_idx % 2 == 0:
                    bracket['round4'][r4_idx]['team1'] = winner
                else:
                    bracket['round4'][r4_idx]['team2'] = winner
    
    # Final Four (Round 4 winner)
    r4_idx = start_idx // 8  # 0=East, 1=West, 2=South, 3=Midwest
    winner_name = get_cell_value(sheet, config['f4_col'], config['f4_row'])
    if winner_name:
        winner = find_team(winner_name, teams)
        if winner:
            bracket['round4'][r4_idx]['winner'] = winner
            
            # Populate round 5 (Final Four)
            r5_idx = r4_idx // 2
            if r4_idx % 2 == 0:
                bracket['round5'][r5_idx]['team1'] = winner
            else:
                bracket['round5'][r5_idx]['team2'] = winner


def extract_final_four(sheet, bracket: dict, teams: Dict[str, dict]):
    """Extract Final Four and Championship results."""
    # Left semifinal winner (East/West)
    left_winner_name = get_cell_value(sheet, *CHAMPIONSHIP['left_f4_winner'])
    if left_winner_name:
        winner = find_team(left_winner_name, teams)
        if winner:
            bracket['round5'][0]['winner'] = winner
            bracket['round6'][0]['team1'] = winner
    
    # Right semifinal winner (South/Midwest)
    right_winner_name = get_cell_value(sheet, *CHAMPIONSHIP['right_f4_winner'])
    if right_winner_name:
        winner = find_team(right_winner_name, teams)
        if winner:
            bracket['round5'][1]['winner'] = winner
            bracket['round6'][0]['team2'] = winner
    
    # Champion
    champion_name = get_cell_value(sheet, *CHAMPIONSHIP['champion'])
    if champion_name:
        champion = find_team(champion_name, teams)
        if champion:
            bracket['round6'][0]['winner'] = champion
            bracket['winner'] = champion


def convert_bracket_to_json(bracket: dict) -> dict:
    """Convert bracket to clean JSON-serializable format."""
    def clean_team(team):
        if not team:
            return None
        return {
            'name': team.get('name'),
            'seed': team.get('seed'),
            'region': team.get('region', '')
        }
    
    def clean_game(game):
        if not game:
            return None
        return {
            'team1': clean_team(game.get('team1')),
            'team2': clean_team(game.get('team2')),
            'winner': clean_team(game.get('winner')),
            'gameId': game.get('gameId', ''),
            'region': game.get('region', '')
        }
    
    return {
        'round1': [clean_game(g) for g in bracket['round1']],
        'round2': [clean_game(g) for g in bracket['round2']],
        'round3': [clean_game(g) for g in bracket['round3']],
        'round4': [clean_game(g) for g in bracket['round4']],
        'round5': [clean_game(g) for g in bracket['round5']],
        'round6': [clean_game(g) for g in bracket['round6']],
        'winner': clean_team(bracket.get('winner'))
    }


def convert_excel_to_json(excel_path: str, teams_path: str, output_path: str):
    """Convert a single Excel bracket to JSON."""
    # Load teams
    teams = load_teams_from_csv(teams_path)
    
    # Extract bracket from Excel
    bracket = extract_bracket_from_excel(excel_path, teams)
    
    # Convert to clean JSON format
    json_bracket = convert_bracket_to_json(bracket)
    
    # Save to JSON
    with open(output_path, 'w') as f:
        json.dump(json_bracket, f, indent=2)
    
    print(f"Converted: {excel_path} -> {output_path}")


def convert_directory(input_dir: str, output_dir: str, teams_path: str, pattern: str = '*.xlsx'):
    """Convert all Excel brackets in a directory to JSON."""
    import glob
    
    os.makedirs(output_dir, exist_ok=True)
    
    excel_files = glob.glob(os.path.join(input_dir, pattern))
    print('found files', excel_files)
    if not excel_files:
        print(f"No Excel files found matching {pattern} in {input_dir}")
        return
    
    # Load teams once
    print('teams path', teams_path)
    teams = load_teams_from_csv(teams_path)
    
    for excel_path in excel_files:
        filename = os.path.basename(excel_path)
        # Change extension to .json
        json_filename = os.path.splitext(filename)[0] + '.json'
        output_path = os.path.join(output_dir, json_filename)
        
        try:
            bracket = extract_bracket_from_excel(excel_path, teams)
            json_bracket = convert_bracket_to_json(bracket)
            
            with open(output_path, 'w') as f:
                json.dump(json_bracket, f, indent=2)
            
            print(f"✓ {filename} -> {json_filename}")
        except Exception as e:
            print(f"✗ {filename}: {e}")


def main():
    parser = argparse.ArgumentParser(description='Convert Excel brackets to JSON format')
    parser.add_argument('--input', '-i', required=True, 
                       help='Input Excel file or directory containing Excel files')
    parser.add_argument('--output', '-o', required=True,
                       help='Output JSON file or directory')
    parser.add_argument('--teams', '-t', required=True,
                       help='Path to teams CSV file')
    parser.add_argument('--pattern', '-p', default='*.xlsx',
                       help='File pattern when converting directory (default: *.xlsx)')
    
    args = parser.parse_args()
    
    if os.path.isdir(args.input):
        # Convert entire directory
        convert_directory(args.input, args.output, args.teams, args.pattern)
    else:
        # Convert single file
        convert_excel_to_json(args.input, args.teams, args.output)


if __name__ == '__main__':
    main()