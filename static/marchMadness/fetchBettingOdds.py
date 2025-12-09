#!/usr/bin/env python3
"""
Fetch betting odds from The Odds API and convert to probability CSV format.

This script fetches:
1. Championship winner futures (outrights) -> prob_win
2. Individual game moneylines (during tournament) -> game-by-game probabilities

Then calculates round-by-round probabilities for each team.

Usage:
    python fetch_betting_odds.py --api-key YOUR_API_KEY --output teams_with_odds.csv
    
    # Or set environment variable
    export ODDS_API_KEY=YOUR_API_KEY
    python fetch_betting_odds.py --output teams_with_odds.csv

Get a free API key at: https://the-odds-api.com/
"""

import argparse
import csv
import json
import os
import sys
from typing import Dict, List, Optional, Tuple
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

import json

PATH_TO_SECRETS = '../../secrets.json'
with open(PATH_TO_SECRETS) as f:
    secrets = json.load(f)
api_key = secrets['ODDS_API_KEY']


# API Configuration
BASE_URL = "https://api.the-odds-api.com/v4"
SPORT_KEY_GAMES = "basketball_ncaab"
SPORT_KEY_FUTURES = "basketball_ncaab_championship_winner"

# Probability columns
PROB_COLUMNS = ['prob_r32', 'prob_r16', 'prob_r8', 'prob_r4', 'prob_r2', 'prob_win']

# Round keys matching the bracket structure
ROUND_KEYS = ['round1', 'round2', 'round3', 'round4', 'round5', 'round6']


def load_team_status_from_results(results_path: str) -> Tuple[Dict[str, int], Dict[str, bool]]:
    """
    Load team status from a results bracket JSON.
    
    Returns:
        Tuple of:
        - team_current_rounds: Dict mapping team name to their current round (1-6)
        - team_eliminated: Dict mapping team name to whether they're eliminated
    """
    import json
    
    if not os.path.exists(results_path):
        return {}, {}
    
    with open(results_path, 'r') as f:
        results = json.load(f)
    
    team_rounds = {}  # team -> highest round reached
    team_eliminated = {}  # team -> True if eliminated
    
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
            
            # Both teams reached this round
            for team in [team1, team2]:
                if team:
                    team_rounds[team] = max(team_rounds.get(team, 0), round_num)
            
            # If game is decided, loser is eliminated, winner advances
            if winner:
                loser = team2 if winner == team1 else team1
                if loser:
                    team_eliminated[loser] = True
                if winner:
                    # Winner advances to next round
                    team_rounds[winner] = max(team_rounds.get(winner, 0), round_num + 1)
    
    # For teams still in tournament, their current round is the highest they've reached
    # For eliminated teams, they're stuck at their elimination round
    team_current_rounds = {}
    for team, highest_round in team_rounds.items():
        if team_eliminated.get(team, False):
            # Eliminated teams - their "current round" doesn't matter much
            # but we set it to where they were eliminated
            team_current_rounds[team] = highest_round
        else:
            # Still in tournament - current round is where they're playing next
            team_current_rounds[team] = highest_round
    
    return team_current_rounds, team_eliminated


def american_odds_to_probability(odds: float) -> float:
    """
    Convert American betting odds to implied probability.
    
    Args:
        odds: American odds value (e.g., -150, +200)
    
    Returns:
        Implied probability as a decimal (0.0 to 1.0)
    """
    if odds < 0:
        return abs(odds) / (abs(odds) + 100)
    else:
        return 100 / (odds + 100)


def normalize_probabilities(probs: Dict[str, float]) -> Dict[str, float]:
    """
    Normalize probabilities to sum to 1.0 (removes the vig/juice).
    """
    total = sum(probs.values())
    if total == 0:
        return probs
    return {k: v / total for k, v in probs.items()}


def fetch_api(url: str, api_key: str) -> Tuple[Optional[dict], dict]:
    """
    Fetch data from The Odds API.
    
    Returns:
        Tuple of (data, headers) where headers contains rate limit info
    """
    full_url = f"{url}&apiKey={api_key}" if "?" in url else f"{url}?apiKey={api_key}"
    
    try:
        request = Request(full_url)
        with urlopen(request) as response:
            data = json.loads(response.read().decode())
            headers = {
                'requests_remaining': response.headers.get('x-requests-remaining'),
                'requests_used': response.headers.get('x-requests-used'),
            }
            return data, headers
    except HTTPError as e:
        print(f"HTTP Error {e.code}: {e.reason}")
        if e.code == 401:
            print("Invalid API key. Get a free key at https://the-odds-api.com/")
        elif e.code == 429:
            print("Rate limit exceeded. Try again later or upgrade your plan.")
        return None, {}
    except URLError as e:
        print(f"URL Error: {e.reason}")
        return None, {}


def fetch_championship_futures(api_key: str, regions: str = "us") -> Dict[str, float]:
    """
    Fetch NCAA Championship winner futures odds.
    
    Returns:
        Dict mapping team name to championship win probability (normalized, no vig)
    """
    url = f"{BASE_URL}/sports/{SPORT_KEY_FUTURES}/odds?regions={regions}&markets=outrights&oddsFormat=american"
    
    print(f"Fetching championship futures from {SPORT_KEY_FUTURES}...")
    data, headers = fetch_api(url, api_key)
    
    if headers.get('requests_remaining'):
        print(f"  API requests remaining: {headers['requests_remaining']}")
    
    if not data:
        print("  No futures data returned. The market may not be available yet.")
        return {}
    
    # Collect odds from all bookmakers and average them
    team_odds = {}  # team -> list of odds from different bookmakers
    
    for event in data:
        for bookmaker in event.get('bookmakers', []):
            for market in bookmaker.get('markets', []):
                if market.get('key') == 'outrights':
                    for outcome in market.get('outcomes', []):
                        team_name = outcome.get('name')
                        price = outcome.get('price')
                        if team_name and price:
                            if team_name not in team_odds:
                                team_odds[team_name] = []
                            team_odds[team_name].append(price)
    
    if not team_odds:
        print("  No championship odds found in response.")
        return {}
    
    # Convert to probabilities (average across bookmakers, then normalize)
    raw_probs = {}
    for team, odds_list in team_odds.items():
        avg_odds = sum(odds_list) / len(odds_list)
        raw_probs[team] = american_odds_to_probability(avg_odds)
    
    # Normalize to remove vig
    normalized = normalize_probabilities(raw_probs)
    
    print(f"  Found odds for {len(normalized)} teams")
    
    # Show top 10
    sorted_teams = sorted(normalized.items(), key=lambda x: x[1], reverse=True)
    print("  Top 10 championship favorites:")
    for team, prob in sorted_teams[:10]:
        print(f"    {team}: {prob*100:.2f}%")
    
    return normalized


def fetch_upcoming_games(api_key: str, regions: str = "us") -> List[dict]:
    """
    Fetch upcoming NCAA basketball game odds.
    
    Returns:
        List of game dicts with teams and moneyline probabilities
    """
    url = f"{BASE_URL}/sports/{SPORT_KEY_GAMES}/odds?regions={regions}&markets=h2h&oddsFormat=american"
    
    print(f"\nFetching upcoming game odds from {SPORT_KEY_GAMES}...")
    data, headers = fetch_api(url, api_key)
    
    if headers.get('requests_remaining'):
        print(f"  API requests remaining: {headers['requests_remaining']}")
    
    if not data:
        print("  No game data returned.")
        return []
    
    games = []
    for event in data:
        home_team = event.get('home_team')
        away_team = event.get('away_team')
        commence_time = event.get('commence_time')
        
        # Get average odds across bookmakers
        home_odds_list = []
        away_odds_list = []
        
        for bookmaker in event.get('bookmakers', []):
            for market in bookmaker.get('markets', []):
                if market.get('key') == 'h2h':
                    for outcome in market.get('outcomes', []):
                        if outcome.get('name') == home_team:
                            home_odds_list.append(outcome.get('price'))
                        elif outcome.get('name') == away_team:
                            away_odds_list.append(outcome.get('price'))
        
        if home_odds_list and away_odds_list:
            avg_home_odds = sum(home_odds_list) / len(home_odds_list)
            avg_away_odds = sum(away_odds_list) / len(away_odds_list)
            
            # Convert to probabilities and normalize
            raw_probs = {
                home_team: american_odds_to_probability(avg_home_odds),
                away_team: american_odds_to_probability(avg_away_odds)
            }
            norm_probs = normalize_probabilities(raw_probs)
            
            games.append({
                'home_team': home_team,
                'away_team': away_team,
                'commence_time': commence_time,
                'home_prob': norm_probs[home_team],
                'away_prob': norm_probs[away_team],
            })
    
    print(f"  Found {len(games)} upcoming games with odds")
    
    return games


def estimate_round_probabilities(prob_win: float, method: str = "geometric", 
                                   prob_first_game: float = None,
                                   current_round: int = 1) -> Dict[str, float]:
    """
    Estimate probability of reaching each round given championship probability.
    
    Methods:
    - "geometric": Assume roughly equal win probability each round
                   If prob_win = p^6, then p = prob_win^(1/6) per round
    - "linear": Linear scaling (less accurate but simpler)
    - "hybrid": Use first game odds + championship odds to estimate intermediate rounds
    
    Args:
        prob_win: Probability of winning championship
        method: Estimation method
        prob_first_game: Probability of winning the next/first game (for hybrid method)
        current_round: What round the team is currently in (1=R64, 2=R32, etc.)
                       Used to determine how many games remain
    
    Returns:
        Dict with prob_r32, prob_r16, prob_r8, prob_r4, prob_r2, prob_win
    """
    if prob_win <= 0:
        return {col: 0.0 for col in PROB_COLUMNS}
    
    # Number of games needed to win championship from each round
    # Round 1 (R64): need to win 6 games
    # Round 2 (R32): need to win 5 games
    # Round 3 (S16): need to win 4 games
    # etc.
    games_from_round = {1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 6: 1}
    
    # Map round number to probability column for "reaching next round"
    # Winning in round 1 means reaching R32 (prob_r32)
    # Winning in round 2 means reaching R16 (prob_r16)
    round_to_prob_col = {
        1: 'prob_r32',
        2: 'prob_r16', 
        3: 'prob_r8',
        4: 'prob_r4',
        5: 'prob_r2',
        6: 'prob_win'
    }
    
    if method == "hybrid" and prob_first_game is not None and prob_first_game > 0:
        # Hybrid method: use first game odds + championship odds
        
        games_remaining = games_from_round.get(current_round, 6)
        games_after_first = games_remaining - 1
        
        result = {}
        
        # Teams that have already reached certain rounds get 1.0 for those
        for r in range(1, current_round):
            col = round_to_prob_col.get(r)
            if col:
                result[col] = 1.0
        
        if games_after_first > 0:
            # prob_win = prob_first_game × prob_remaining_games
            # prob_remaining_games = prob_win / prob_first_game
            prob_remaining = prob_win / prob_first_game
            
            # Assume remaining games have equal difficulty
            # prob_remaining = p^games_after_first
            # p = prob_remaining^(1/games_after_first)
            if prob_remaining > 0:
                p_per_remaining = prob_remaining ** (1 / games_after_first)
            else:
                p_per_remaining = 0
            
            # Calculate cumulative probabilities
            # First game: prob_first_game
            # Second game: prob_first_game × p_per_remaining
            # Third game: prob_first_game × p_per_remaining^2
            # etc.
            
            cumulative_prob = prob_first_game
            game_num = 1
            
            for r in range(current_round, 7):
                col = round_to_prob_col.get(r)
                if col:
                    result[col] = min(1.0, cumulative_prob)
                
                if game_num < games_remaining:
                    cumulative_prob *= p_per_remaining
                    game_num += 1
        else:
            # Only one game left (championship game)
            result[round_to_prob_col[current_round]] = prob_first_game
            result['prob_win'] = prob_win
        
        # Ensure prob_win is set correctly
        result['prob_win'] = prob_win
        
        # Fill in any missing columns with 0
        for col in PROB_COLUMNS:
            if col not in result:
                result[col] = 0.0
        
        return result
    
    elif method == "geometric":
        # If a team wins 6 games with probability p each, prob_win = p^6
        # So p = prob_win^(1/6)
        
        games_remaining = games_from_round.get(current_round, 6)
        p_per_round = prob_win ** (1 / games_remaining)
        
        result = {}
        
        # Rounds already reached
        for r in range(1, current_round):
            col = round_to_prob_col.get(r)
            if col:
                result[col] = 1.0
        
        # Future rounds
        cumulative_games = 1
        for r in range(current_round, 7):
            col = round_to_prob_col.get(r)
            if col:
                result[col] = p_per_round ** cumulative_games
                cumulative_games += 1
        
        return result
    
    elif method == "linear":
        # Simple linear scaling - less accurate
        return {
            'prob_r32': min(1.0, prob_win * 32),
            'prob_r16': min(1.0, prob_win * 16),
            'prob_r8': min(1.0, prob_win * 8),
            'prob_r4': min(1.0, prob_win * 4),
            'prob_r2': min(1.0, prob_win * 2),
            'prob_win': prob_win,
        }
    
    else:
        raise ValueError(f"Unknown method: {method}")


def create_probability_csv(
    championship_probs: Dict[str, float],
    output_path: str,
    base_teams_csv: str = None,
    estimation_method: str = "geometric",
    game_odds: List[dict] = None,
    team_current_rounds: Dict[str, int] = None,
    team_eliminated: Dict[str, bool] = None
):
    """
    Create a CSV file with team probabilities.
    
    Args:
        championship_probs: Dict mapping team name to championship probability
        output_path: Path to write CSV
        base_teams_csv: Optional path to existing teams CSV (to preserve seed/region info)
        estimation_method: Method for estimating round probabilities
        game_odds: List of game dicts with team win probabilities (for hybrid method)
        team_current_rounds: Dict mapping team name to current round (1-6)
        team_eliminated: Dict mapping team name to whether they're eliminated
    """
    # Load base teams if provided
    base_teams = {}
    if base_teams_csv and os.path.exists(base_teams_csv):
        print(f"\nLoading base team info from {base_teams_csv}")
        with open(base_teams_csv, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get('TEAM') or row.get('Team') or row.get('name')
                if name:
                    base_teams[name] = {
                        'seed': row.get('SEED') or row.get('Seed') or row.get('seed', ''),
                        'region': row.get('Region') or row.get('region', ''),
                    }
        print(f"  Loaded {len(base_teams)} teams from base CSV")
    
    # Build lookup for first game win probability from game odds
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
    
    # Default dicts if not provided
    if team_current_rounds is None:
        team_current_rounds = {}
    if team_eliminated is None:
        team_eliminated = {}
    
    # Create output data
    output_rows = []
    
    for team_name, prob_win in championship_probs.items():
        # Get base info if available
        base_info = base_teams.get(team_name, {})
        
        # Check if team is eliminated
        if team_eliminated.get(team_name, False):
            # Eliminated team - set prob_win to 0, but keep round probs for rounds they reached
            current_round = team_current_rounds.get(team_name, 1)
            round_probs = {}
            # They reached up to current_round, so those are 1.0
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
            # Still in tournament - estimate probabilities
            prob_first_game = first_game_probs.get(team_name)
            current_round = team_current_rounds.get(team_name, 1)
            
            round_probs = estimate_round_probabilities(
                prob_win, 
                estimation_method,
                prob_first_game=prob_first_game,
                current_round=current_round
            )
        
        row = {
            'TEAM': team_name,
            'SEED': base_info.get('seed', ''),
            'Region': base_info.get('region', ''),
        }
        row.update(round_probs)
        output_rows.append(row)
    
    # Sort by prob_win descending
    output_rows.sort(key=lambda x: x['prob_win'], reverse=True)
    
    # Write CSV
    fieldnames = ['TEAM', 'SEED', 'Region'] + PROB_COLUMNS
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in output_rows:
            # Format probabilities
            for col in PROB_COLUMNS:
                row[col] = f"{row[col]:.6f}"
            writer.writerow(row)
    
    print(f"\nWrote {len(output_rows)} teams to {output_path}")
    
    # Verify sums
    print("\nProbability column sums (should match expected values):")
    for col in PROB_COLUMNS:
        total = sum(float(r[col]) for r in output_rows)
        expected = {'prob_r32': 32, 'prob_r16': 16, 'prob_r8': 8, 
                   'prob_r4': 4, 'prob_r2': 2, 'prob_win': 1}[col]
        status = "✓" if abs(total - expected) < 0.5 else f"(off by {abs(total-expected):.2f})"
        print(f"  {col}: {total:.2f} (expected {expected}) {status}")


def list_available_sports(api_key: str):
    """List all available sports from the API."""
    url = f"{BASE_URL}/sports"
    
    print("Fetching available sports...")
    data, headers = fetch_api(url, api_key)
    
    if not data:
        return
    
    print("\nBasketball sports available:")
    for sport in data:
        if 'basketball' in sport.get('key', '').lower():
            active = "✓" if sport.get('active') else "✗"
            print(f"  {active} {sport.get('key')}: {sport.get('title')} - {sport.get('description', '')}")


def main():
    parser = argparse.ArgumentParser(
        description='Fetch betting odds and convert to probability CSV',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Fetch championship futures and create CSV (geometric estimation)
    python fetch_betting_odds.py --api-key YOUR_KEY --output teams_odds.csv
    
    # Use hybrid method (championship futures + game odds)
    python fetch_betting_odds.py --api-key YOUR_KEY --method hybrid --output teams_odds.csv
    
    # Use with results bracket to track tournament progress
    python fetch_betting_odds.py --api-key YOUR_KEY --results results-bracket.json --output teams_odds.csv
    
    # Use existing teams CSV to preserve seed/region info
    python fetch_betting_odds.py --api-key YOUR_KEY --base-teams ThisYearTeams2026.csv --output teams_odds.csv
    
    # List available sports
    python fetch_betting_odds.py --api-key YOUR_KEY --list-sports
    
    # Fetch upcoming game odds (informational)
    python fetch_betting_odds.py --api-key YOUR_KEY --show-games

Get a free API key at: https://the-odds-api.com/
        """
    )
    
    parser.add_argument('--api-key', 
                       default=os.environ.get('ODDS_API_KEY'),
                       help='The Odds API key (or set ODDS_API_KEY env var)')
    parser.add_argument('--output', '-o',
                       default='teams_betting_odds.csv',
                       help='Output CSV path')
    parser.add_argument('--base-teams',
                       help='Base teams CSV (to preserve seed/region info)')
    parser.add_argument('--results',
                       help='Results bracket JSON (to determine current tournament state)')
    parser.add_argument('--regions',
                       default='us',
                       help='Bookmaker regions (us, us2, uk, eu, au)')
    parser.add_argument('--method',
                       choices=['geometric', 'linear', 'hybrid'],
                       default='hybrid',
                       help='Method for estimating round probabilities (default: hybrid)')
    parser.add_argument('--list-sports', action='store_true',
                       help='List available sports and exit')
    parser.add_argument('--show-games', action='store_true',
                       help='Show upcoming game odds')
    
    args = parser.parse_args()
    
    if not args.api_key:
        if (api_key):
            args.api_key = api_key
        else:
            print("Error: API key required. Use --api-key or set ODDS_API_KEY environment variable.")
            print("Get a free API key at: https://the-odds-api.com/")
            sys.exit(1)
    
    if args.list_sports:
        list_available_sports(args.api_key)
        return
    
    if args.show_games:
        games = fetch_upcoming_games(args.api_key, args.regions)
        if games:
            print("\nUpcoming games:")
            for game in games[:20]:  # Show first 20
                print(f"  {game['away_team']} @ {game['home_team']}")
                print(f"    {game['away_team']}: {game['away_prob']*100:.1f}%")
                print(f"    {game['home_team']}: {game['home_prob']*100:.1f}%")
        return
    
    # Load team status from results bracket if provided
    team_current_rounds = {}
    team_eliminated = {}
    if args.results:
        print(f"\nLoading tournament state from {args.results}")
        team_current_rounds, team_eliminated = load_team_status_from_results(args.results)
        if team_current_rounds:
            # Count teams at each round
            round_counts = {}
            for team, round_num in team_current_rounds.items():
                if not team_eliminated.get(team, False):
                    round_counts[round_num] = round_counts.get(round_num, 0) + 1
            print(f"  Teams still in tournament by round:")
            for r in sorted(round_counts.keys()):
                round_names = {1: 'R64', 2: 'R32', 3: 'S16', 4: 'E8', 5: 'F4', 6: 'Championship'}
                print(f"    {round_names.get(r, f'Round {r}')}: {round_counts[r]} teams")
    
    # Fetch championship futures
    championship_probs = fetch_championship_futures(args.api_key, args.regions)
    
    if not championship_probs:
        print("\nNo championship odds available. The futures market may not be open yet.")
        print("Try --show-games to see if game odds are available.")
        sys.exit(1)
    
    # Fetch game odds if using hybrid method
    game_odds = None
    if args.method == 'hybrid':
        game_odds = fetch_upcoming_games(args.api_key, args.regions)
        if game_odds:
            print(f"\nUsing hybrid method with {len(game_odds)} game odds")
        else:
            print("\nNo game odds available, falling back to geometric method for teams without game odds")
    
    # Create CSV
    create_probability_csv(
        championship_probs,
        args.output,
        args.base_teams,
        args.method,
        game_odds=game_odds,
        team_current_rounds=team_current_rounds,
        team_eliminated=team_eliminated
    )
    
    print(f"\nDone! CSV saved to {args.output}")
    
    if args.method == 'hybrid':
        print("\nHybrid method explanation:")
        print("  - prob_win: Directly from championship futures")
        print("  - prob_first_game: From h2h moneylines for next game")
        print("  - Intermediate rounds: Estimated by distributing remaining probability")
        print("    assuming equal difficulty for games after the first")
        if args.results:
            print("  - Current round: From results bracket (teams already advanced get 100% for past rounds)")
    else:
        print("\nNote: Round probabilities (prob_r32 through prob_r4) are ESTIMATES based on")
        print("championship odds. For more accurate round-by-round probabilities, use --method hybrid")


if __name__ == '__main__':
    main()