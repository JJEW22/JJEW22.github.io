#!/usr/bin/env python3
"""
Fetch betting odds from The Odds API and save raw data to JSON.

This script fetches:
1. Championship winner futures (outrights) -> prob_win
2. Individual game moneylines (during tournament) -> game-by-game probabilities

The raw odds are saved to a JSON file that can be processed by shapeBettingOdds.py.

Usage:
    python fetchBettingOdds.py --output raw_odds.json
    
    # Or set environment variable
    export ODDS_API_KEY=YOUR_API_KEY
    python fetchBettingOdds.py --output raw_odds.json

Get a free API key at: https://the-odds-api.com/
"""

import argparse
import json
import os
import sys
from typing import Dict, List, Optional, Tuple
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError
from datetime import datetime

# Load API key from secrets
PATH_TO_SECRETS = '../../secrets.json'
api_key = None
if os.path.exists(PATH_TO_SECRETS):
    with open(PATH_TO_SECRETS) as f:
        secrets = json.load(f)
    api_key = secrets.get('ODDS_API_KEY')

# API Configuration
BASE_URL = "https://api.the-odds-api.com/v4"
SPORT_KEY_GAMES = "basketball_ncaab"
SPORT_KEY_FUTURES = "basketball_ncaab_championship_winner"


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
        description='Fetch betting odds from The Odds API and save to JSON',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Fetch and save raw odds to JSON
    python fetchBettingOdds.py --output raw_odds.json
    
    # Fetch with game odds included
    python fetchBettingOdds.py --output raw_odds.json --include-games
    
    # List available sports
    python fetchBettingOdds.py --list-sports
    
    # Show upcoming game odds
    python fetchBettingOdds.py --show-games

Get a free API key at: https://the-odds-api.com/
        """
    )
    
    parser.add_argument('--api-key', 
                       default=os.environ.get('ODDS_API_KEY'),
                       help='The Odds API key (or set ODDS_API_KEY env var)')
    parser.add_argument('--output', '-o',
                       default='raw_betting_odds.json',
                       help='Output JSON path for raw odds data')
    parser.add_argument('--regions',
                       default='us',
                       help='Bookmaker regions (us, us2, uk, eu, au)')
    parser.add_argument('--include-games', action='store_true',
                       help='Also fetch individual game odds')
    parser.add_argument('--list-sports', action='store_true',
                       help='List available sports and exit')
    parser.add_argument('--show-games', action='store_true',
                       help='Show upcoming game odds')
    
    args = parser.parse_args()
    
    if not args.api_key:
        if api_key:
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
    
    # Fetch championship futures
    championship_probs = fetch_championship_futures(args.api_key, args.regions)
    
    if not championship_probs:
        print("\nNo championship odds available. The futures market may not be open yet.")
        print("Try --show-games to see if game odds are available.")
        sys.exit(1)
    
    # Build output data
    output_data = {
        'fetched_at': datetime.now().isoformat(),
        'regions': args.regions,
        'championship_probs': championship_probs,
        'game_odds': None
    }
    
    # Fetch game odds if requested
    if args.include_games:
        game_odds = fetch_upcoming_games(args.api_key, args.regions)
        if game_odds:
            output_data['game_odds'] = game_odds
            print(f"\nIncluded {len(game_odds)} game odds")
    
    # Save to JSON
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"\nRaw odds saved to {args.output}")
    print(f"  Championship odds for {len(championship_probs)} teams")
    if output_data['game_odds']:
        print(f"  Game odds for {len(output_data['game_odds'])} games")
    
    print("\nNext step: Run shapeBettingOdds.py to process these odds into team probabilities")
    print(f"  python shapeBettingOdds.py --input {args.output} --output teams_with_odds.csv")


if __name__ == '__main__':
    main()