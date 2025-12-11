#!/usr/bin/env python3
"""
Generate optimal brackets for all participants.
This script pre-computes the optimal bracket for each participant and saves them as JSON files.

Usage:
    python generate_optimal_brackets.py

Inputs:
    - results-bracket-march-madness-{YEAR}.json
    - {participant}-bracket-march-madness-{YEAR}.json for each participant
    - participants.json (list of participant names)

Outputs:
    - optimal-brackets.json (contains optimal bracket for each participant)
"""

import json
import os
from pathlib import Path

YEAR = 2026
BASE_PATH = Path("./2026")  # Adjust as needed for your setup

def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

def get_alive_teams(results_bracket):
    """Find all teams that are still alive (in games without winners)."""
    alive = set()
    for round_num in range(1, 7):
        round_key = f"round{round_num}"
        games = results_bracket.get(round_key, [])
        for game in games:
            if not game:
                continue
            if not game.get("winner"):
                team1 = game.get("team1")
                team2 = game.get("team2")
                if team1 and team1.get("name"):
                    alive.add(team1["name"])
                if team2 and team2.get("name"):
                    alive.add(team2["name"])
    return alive

def get_picks_at_round(picks_bracket, round_num, alive_teams):
    """Get all teams the participant picked to reach a specific round that are still alive."""
    teams = []
    round_key = f"round{round_num}"
    
    if round_num == 6:
        # Championship winner
        champ = picks_bracket.get("round6", [{}])[0].get("winner", {})
        if champ and champ.get("name") in alive_teams:
            teams.append(champ["name"])
    else:
        # Winners of that round
        for game in picks_bracket.get(round_key, []):
            if game and game.get("winner") and game["winner"].get("name") in alive_teams:
                teams.append(game["winner"]["name"])
    
    return list(set(teams))

def get_furthest_round(picks_bracket, team_name):
    """Find the furthest round a team reaches in the participant's bracket."""
    # Check championship
    champ = picks_bracket.get("round6", [{}])[0].get("winner", {})
    if champ and champ.get("name") == team_name:
        return 6
    
    for round_num in range(5, 0, -1):
        round_key = f"round{round_num}"
        for game in picks_bracket.get(round_key, []):
            if game and game.get("winner") and game["winner"].get("name") == team_name:
                return round_num
    return 0

def get_furthest_round_in_path(picks_bracket, team_name, max_round):
    """Get the furthest round a team reaches in picks, capped at max_round."""
    for round_num in range(max_round, 0, -1):
        round_key = f"round{round_num}"
        for game in picks_bracket.get(round_key, []):
            if game and game.get("winner") and game["winner"].get("name") == team_name:
                return round_num
    return 1

def propagate_winner(bracket, current_round, game_index, winner):
    """Propagate a winner to the next round's game."""
    if current_round >= 6:
        return
    
    next_round = current_round + 1
    next_round_key = f"round{next_round}"
    next_game_index = game_index // 2
    is_first_team = game_index % 2 == 0
    
    next_games = bracket.get(next_round_key, [])
    if next_game_index >= len(next_games):
        return
    
    next_game = next_games[next_game_index]
    if not next_game:
        return
    
    if is_first_team:
        next_game["team1"] = winner
    else:
        next_game["team2"] = winner

def mark_team_winning(optimal_bracket, picks_bracket, team_name, target_round, teams_data, alive_teams):
    """Mark a team as winning all their games up to target_round. Returns list of opponents to process."""
    opponents = []
    
    for round_num in range(1, target_round + 1):
        round_key = f"round{round_num}"
        optimal_games = optimal_bracket.get(round_key, [])
        picks_games = picks_bracket.get(round_key, [])
        
        for i, game in enumerate(optimal_games):
            if not game or game.get("winner"):
                continue
            
            pick_game = picks_games[i] if i < len(picks_games) else None
            
            team1_name = game.get("team1", {}).get("name") if game.get("team1") else None
            team2_name = game.get("team2", {}).get("name") if game.get("team2") else None
            
            # Check if this team is in this game
            if team1_name == team_name or team2_name == team_name:
                # Mark as winner
                winner_data = teams_data.get(team_name, {"name": team_name})
                game["winner"] = winner_data
                
                # Find opponents from picks to add to process list
                if pick_game:
                    pick_team1 = pick_game.get("team1", {})
                    pick_team2 = pick_game.get("team2", {})
                    
                    if pick_team1 and pick_team1.get("name") and pick_team1["name"] != team_name and pick_team1["name"] in alive_teams:
                        opp_furthest = get_furthest_round_in_path(picks_bracket, pick_team1["name"], round_num)
                        opponents.append({"team_name": pick_team1["name"], "target_round": min(opp_furthest, round_num)})
                    
                    if pick_team2 and pick_team2.get("name") and pick_team2["name"] != team_name and pick_team2["name"] in alive_teams:
                        opp_furthest = get_furthest_round_in_path(picks_bracket, pick_team2["name"], round_num)
                        opponents.append({"team_name": pick_team2["name"], "target_round": min(opp_furthest, round_num)})
                
                propagate_winner(optimal_bracket, round_num, i, winner_data)
                break
            
            # Check if team needs to be placed in this game (slot is empty)
            if not team1_name or not team2_name:
                pick_team1 = pick_game.get("team1", {}).get("name") if pick_game and pick_game.get("team1") else None
                pick_team2 = pick_game.get("team2", {}).get("name") if pick_game and pick_game.get("team2") else None
                
                if pick_team1 == team_name or pick_team2 == team_name:
                    winner_data = teams_data.get(team_name, {"name": team_name})
                    
                    if not team1_name and pick_team1 == team_name:
                        game["team1"] = winner_data
                    elif not team2_name and pick_team2 == team_name:
                        game["team2"] = winner_data
                    
                    game["winner"] = winner_data
                    
                    # Add opponent
                    opp_name = pick_team2 if pick_team1 == team_name else pick_team1
                    if opp_name and opp_name in alive_teams:
                        opp_furthest = get_furthest_round_in_path(picks_bracket, opp_name, round_num)
                        opponents.append({"team_name": opp_name, "target_round": min(opp_furthest, round_num)})
                    
                    propagate_winner(optimal_bracket, round_num, i, winner_data)
                    break
    
    return opponents

def build_optimal_bracket(results_bracket, picks_bracket, teams_data):
    """
    Build the optimal bracket for maximum possible score.
    
    Algorithm:
    1. Find Latest: Find participant's furthest-round pick(s) still alive, trace their paths
    2. Compute Dead Paths: Identify which bracket positions can never earn points
    3. Bottom-Up Gap Filling: Fill remaining gaps with lower seed wins or "either"
    """
    import copy
    optimal_bracket = copy.deepcopy(results_bracket)
    
    alive_teams = get_alive_teams(results_bracket)
    
    # === STEP 1: Find Latest Algorithm ===
    # Find starting teams (furthest picks that are still alive)
    starting_teams = []
    for round_num in range(6, 0, -1):
        teams_at_round = get_picks_at_round(picks_bracket, round_num, alive_teams)
        if teams_at_round:
            starting_teams = teams_at_round
            break
    
    # Process teams using a stack
    to_process = []
    for team_name in starting_teams:
        furthest_round = get_furthest_round(picks_bracket, team_name)
        to_process.append({"team_name": team_name, "target_round": furthest_round})
    
    processed = set()
    
    while to_process:
        item = to_process.pop()
        team_name = item["team_name"]
        target_round = item["target_round"]
        
        if team_name in processed:
            continue
        processed.add(team_name)
        
        opponents = mark_team_winning(optimal_bracket, picks_bracket, team_name, target_round, teams_data, alive_teams)
        
        for opp in opponents:
            if opp["team_name"] not in processed and opp["team_name"] in alive_teams:
                to_process.append(opp)
    
    # === STEP 2 & 3: Compute Dead Paths and Bottom-Up Gap Filling ===
    # Process from round 1 up to round 6
    for round_num in range(1, 7):
        round_key = f"round{round_num}"
        games = optimal_bracket.get(round_key, [])
        picks_games = picks_bracket.get(round_key, [])
        
        for game_idx, game in enumerate(games):
            if not game or game.get("winner"):
                # Already decided
                continue
            
            team1 = game.get("team1")
            team2 = game.get("team2")
            
            if not team1 or not team2:
                # Can't decide without both teams
                continue
            
            team1_name = team1.get("name")
            team2_name = team2.get("name")
            
            # Get participant's pick for this game
            pick_game = picks_games[game_idx] if game_idx < len(picks_games) else None
            pick_winner = pick_game.get("winner", {}).get("name") if pick_game and pick_game.get("winner") else None
            
            # Did participant pick one of these two teams to win?
            participant_picked_team = None
            if pick_winner == team1_name:
                participant_picked_team = team1
            elif pick_winner == team2_name:
                participant_picked_team = team2
            
            if participant_picked_team:
                # Participant picked one of these teams
                # Check if following this pick leads to a dead path
                dead_path_round = find_dead_path_start(optimal_bracket, picks_bracket, round_num, game_idx, participant_picked_team["name"], alive_teams)
                
                if dead_path_round is not None:
                    # Have them win up until the dead path starts
                    mark_team_winning_until(optimal_bracket, participant_picked_team, round_num, game_idx, dead_path_round, teams_data)
                # else: leave as gap, will handle later (participant has live picks further up)
            else:
                # Participant didn't pick either team
                # Check if this is a dead path
                if is_dead_path(optimal_bracket, picks_bracket, round_num, game_idx, alive_teams):
                    # Dead path - pick lower seed to propagate but don't set winner
                    # This fills in the bracket visually but marks as "either" for scoring
                    team1_seed = team1.get("seed", 99)
                    team2_seed = team2.get("seed", 99)
                    
                    if team1_seed <= team2_seed:
                        propagate_team = team1
                    else:
                        propagate_team = team2
                    
                    # Don't set winner (stays null = EITHER), but propagate team to next round
                    propagate_winner(optimal_bracket, round_num, game_idx, propagate_team)
                else:
                    # Live path - lower seed wins
                    team1_seed = team1.get("seed", 99)
                    team2_seed = team2.get("seed", 99)
                    
                    if team1_seed <= team2_seed:
                        winner = team1
                    else:
                        winner = team2
                    
                    game["winner"] = winner
                    propagate_winner(optimal_bracket, round_num, game_idx, winner)
    
    return optimal_bracket


def is_dead_path(optimal_bracket, picks_bracket, round_num, game_idx, alive_teams):
    """
    Check if a bracket position is on a dead path.
    A path is dead if the participant can't earn points in this slot 
    OR any future slot in this bracket path.
    """
    current_game_idx = game_idx
    
    for r in range(round_num, 7):
        round_key = f"round{r}"
        picks_games = picks_bracket.get(round_key, [])
        
        if current_game_idx < len(picks_games):
            pick_game = picks_games[current_game_idx]
            if pick_game and pick_game.get("winner"):
                pick_winner_name = pick_game["winner"].get("name")
                if pick_winner_name and pick_winner_name in alive_teams:
                    # Participant has a live pick in this future slot
                    return False
        
        # Move to next round's game index
        current_game_idx = current_game_idx // 2
    
    # No live picks found in any future slot
    return True


def find_dead_path_start(optimal_bracket, picks_bracket, round_num, game_idx, team_name, alive_teams):
    """
    Find the round where following a participant's pick leads to a dead path.
    Returns the round number where dead path starts, or None if path stays live.
    """
    current_game_idx = game_idx
    
    for r in range(round_num, 7):
        round_key = f"round{r}"
        picks_games = picks_bracket.get(round_key, [])
        
        if current_game_idx < len(picks_games):
            pick_game = picks_games[current_game_idx]
            if pick_game and pick_game.get("winner"):
                pick_winner_name = pick_game["winner"].get("name")
                
                # Check if participant still has this team winning at this round
                if pick_winner_name == team_name:
                    # Check if participant has any OTHER live pick in future slots
                    # that would make this path live beyond just this team
                    pass  # Continue checking
                elif pick_winner_name and pick_winner_name in alive_teams:
                    # Participant has a different live pick here - this is where we stop
                    return r
                else:
                    # Participant's pick for this slot is eliminated
                    # Check if this means dead path from here
                    if is_dead_path_from_round(picks_bracket, r, current_game_idx, alive_teams):
                        return r
        
        # Move to next round's game index
        current_game_idx = current_game_idx // 2
    
    # Path stays live all the way (team goes to championship)
    return None


def is_dead_path_from_round(picks_bracket, start_round, game_idx, alive_teams):
    """Check if path is dead starting from a specific round."""
    current_game_idx = game_idx
    
    for r in range(start_round, 7):
        round_key = f"round{r}"
        picks_games = picks_bracket.get(round_key, [])
        
        if current_game_idx < len(picks_games):
            pick_game = picks_games[current_game_idx]
            if pick_game and pick_game.get("winner"):
                pick_winner_name = pick_game["winner"].get("name")
                if pick_winner_name and pick_winner_name in alive_teams:
                    return False
        
        current_game_idx = current_game_idx // 2
    
    return True


def mark_team_winning_until(optimal_bracket, team, start_round, start_game_idx, end_round, teams_data):
    """Mark a team as winning from start_round until (but not including) end_round."""
    current_game_idx = start_game_idx
    
    for r in range(start_round, end_round):
        round_key = f"round{r}"
        games = optimal_bracket.get(round_key, [])
        
        if current_game_idx < len(games):
            game = games[current_game_idx]
            if game and not game.get("winner"):
                game["winner"] = team
                propagate_winner(optimal_bracket, r, current_game_idx, team)
        
        current_game_idx = current_game_idx // 2

def main():
    # Load results bracket
    results_path = BASE_PATH / f"results-bracket-march-madness-{YEAR}.json"
    results_bracket = load_json(results_path)
    
    # Build teams_data from round1
    teams_data = {}
    for game in results_bracket.get("round1", []):
        if game.get("team1"):
            teams_data[game["team1"]["name"]] = game["team1"]
        if game.get("team2"):
            teams_data[game["team2"]["name"]] = game["team2"]
    
    # Load participants
    participants_path = BASE_PATH / "participants.json"
    participants = load_json(participants_path)
    
    # Generate optimal bracket for each participant
    optimal_brackets = {}
    
    # Brackets are in a 'brackets' subfolder
    brackets_path = BASE_PATH / "brackets"
    
    for name in participants:
        bracket_path = brackets_path / f"{name}-bracket-march-madness-{YEAR}.json"
        if not bracket_path.exists():
            print(f"Warning: Bracket not found for {name}")
            continue
        
        picks_bracket = load_json(bracket_path)
        optimal = build_optimal_bracket(results_bracket, picks_bracket, teams_data)
        optimal_brackets[name] = optimal
        print(f"Generated optimal bracket for {name}")
    
    # Save all optimal brackets to a single file
    output_path = BASE_PATH / "optimal-brackets.json"
    save_json(output_path, optimal_brackets)
    print(f"\nSaved optimal brackets to {output_path}")

if __name__ == "__main__":
    main()