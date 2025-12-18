#!/usr/bin/env python3
"""
Generate optimal brackets for all participants.
This script pre-computes the optimal bracket for each participant and saves them as JSON files.

Algorithm:
1. Find Latest: Find participant's furthest-round pick(s) still alive, trace their paths
2. Compute Dead Paths: Identify which bracket positions can never earn points
3. Simulate All Possibilities: Try all combinations for remaining undecided games
4. Merge & Compute Probability: Merge tied max scenarios and compute probability

Usage:
    python generateOptimalBrackets.py

Inputs:
    - results-bracket-march-madness-{YEAR}.json
    - {participant}-bracket-march-madness-{YEAR}.json for each participant
    - participants.json (list of participant names)
    - teams data CSV (for probabilities)

Outputs:
    - optimal-brackets.json (contains optimal bracket for each participant)
"""

import json
import os
import sys
import copy
from pathlib import Path
from typing import Dict, List, Set, Tuple, Optional

# Import from MarchMadnessProbabilities
from MarchMadnessProbabilities import (
    ROUND_KEYS,
    SCORE_FOR_ROUND,
    SEED_FACTOR,
    compute_score,
    load_teams,
    get_winner_name,
    get_team_name,
    merge_outcomes,
    decode_merged_outcome_to_games,
    calculate_outcome_probability,
    find_remaining_games,
    get_parent_game_info,
)

YEAR = 2026
BASE_PATH = Path("./2026")  # Adjust as needed for your setup

# Maximum simulations allowed (2^20)
MAX_SIMULATIONS = 2 ** 20


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


def step1_find_latest(results_bracket, picks_bracket, teams_data, alive_teams):
    """
    Step 1: Find Latest Algorithm
    Find participant's furthest-round pick(s) still alive and trace their paths.
    Returns the optimal bracket after this step.
    """
    optimal_bracket = copy.deepcopy(results_bracket)
    
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
    
    return optimal_bracket


def step2_mark_dead_paths(optimal_bracket, picks_bracket, alive_teams):
    """
    Step 2: Mark dead paths.
    For each undecided game, check if it's on a dead path.
    A dead path means no alive picks exist from this game forward to championship.
    Returns list of (round_key, game_idx) for dead games.
    """
    dead_games = []
    
    for round_num in range(1, 7):
        round_key = f"round{round_num}"
        games = optimal_bracket.get(round_key, [])
        
        for game_idx, game in enumerate(games):
            if not game or game.get("winner"):
                continue
            
            # Check if this path is dead (no alive picks forward)
            # Don't require teams to be populated - is_dead_path only needs position
            if is_dead_path(optimal_bracket, picks_bracket, round_num, game_idx, alive_teams):
                dead_games.append((round_key, game_idx))
                game["dead"] = True
    
    return dead_games


def find_simulation_games(optimal_bracket, dead_games):
    """
    Find all games that need to be simulated.
    These are undecided games that are NOT dead.
    Returns list of (round_key, game_idx) in round order.
    """
    dead_set = set(dead_games)
    simulation_games = []
    
    for round_key in ROUND_KEYS:
        games = optimal_bracket.get(round_key, [])
        
        for game_idx, game in enumerate(games):
            if not game:
                continue
            
            # Skip decided games
            if game.get("winner"):
                continue
            
            # Skip dead games
            if (round_key, game_idx) in dead_set:
                continue
            
            # Need both teams to simulate
            if game.get("team1") and game.get("team2"):
                simulation_games.append((round_key, game_idx))
    
    return simulation_games


def create_simulation_bracket(optimal_bracket, simulation_games, outcome_string):
    """
    Create a hypothetical bracket by applying simulation outcomes.
    outcome_string: binary string where '0' means team1 wins, '1' means team2 wins.
    """
    hypothetical = copy.deepcopy(optimal_bracket)
    
    for i, (round_key, game_idx) in enumerate(simulation_games):
        game = hypothetical[round_key][game_idx]
        
        team1 = game.get("team1")
        team2 = game.get("team2")
        
        if not team1 or not team2:
            continue
        
        # Determine winner based on outcome string
        if outcome_string[i] == '0':
            winner = team1
        else:
            winner = team2
        
        game["winner"] = winner
        
        # Propagate winner to next round
        round_num = ROUND_KEYS.index(round_key) + 1
        propagate_winner(hypothetical, round_num, game_idx, winner)
    
    return hypothetical


def step3_simulate_all(optimal_bracket, picks_bracket, simulation_games, dead_games, teams_data):
    """
    Step 3: Simulate all possibilities.
    Try all combinations for remaining undecided games and find max score.
    Returns dict of {outcome_string: score} for all outcomes achieving max score.
    """
    num_sim_games = len(simulation_games)
    
    if num_sim_games == 0:
        # No games to simulate - return empty outcome
        return {"": 0}
    
    total_simulations = 2 ** num_sim_games
    
    if total_simulations > MAX_SIMULATIONS:
        raise RuntimeError(
            f"Too many simulations required: 2^{num_sim_games} = {total_simulations} > {MAX_SIMULATIONS}. "
            f"Cannot compute optimal bracket."
        )
    
    max_score = -1
    max_outcomes = {}
    
    for i in range(total_simulations):
        # Generate outcome string
        outcome = format(i, f'0{num_sim_games}b')
        
        # Create hypothetical bracket with this outcome
        hypothetical = create_simulation_bracket(optimal_bracket, simulation_games, outcome)
        
        # Calculate score
        score, _, _ = compute_score(hypothetical, picks_bracket, teams_data, apply_seed_bonus=True)
        
        if score > max_score:
            max_score = score
            max_outcomes = {outcome: score}
        elif score == max_score:
            max_outcomes[outcome] = score
    
    return max_outcomes


def build_full_outcome_string(simulation_games, dead_games, merged_outcome, results_bracket):
    """
    Build the full outcome string including D for dead games.
    The string positions correspond to all remaining games in round order.
    """
    # Get all remaining games in order
    remaining_games = find_remaining_games(results_bracket)
    
    # Build mapping from (round_key, game_idx) to position in remaining_games
    sim_game_set = set(simulation_games)
    dead_game_set = set(dead_games)
    
    # Map simulation games to their position in merged_outcome
    sim_pos = 0
    result = []
    
    for round_key, game_idx in remaining_games:
        if (round_key, game_idx) in dead_game_set:
            result.append('D')
        elif (round_key, game_idx) in sim_game_set:
            if sim_pos < len(merged_outcome):
                result.append(merged_outcome[sim_pos])
            else:
                result.append('X')  # Fallback
            sim_pos += 1
        else:
            # This game was decided in Step 1 - skip it
            # Actually these shouldn't be in remaining_games if they have a winner
            # But just in case, mark as decided
            pass
    
    return ''.join(result)


def step4_merge_and_probability(max_outcomes, simulation_games, dead_games, 
                                 results_bracket, optimal_bracket, teams_data):
    """
    Step 4: Merge tied outcomes and compute probability.
    Returns the merged outcome string and probability.
    """
    if not max_outcomes:
        return None, 0.0
    
    # If only one outcome, no merging needed
    if len(max_outcomes) == 1:
        merged_outcome = list(max_outcomes.keys())[0]
    else:
        # Use merge_outcomes - need to give them equal probabilities for merging
        # (we'll compute actual probability after)
        outcomes_with_probs = {outcome: 1.0 for outcome in max_outcomes.keys()}
        # Pass simulation_games for round-by-round merging
        merged_dict = merge_outcomes(outcomes_with_probs, simulation_games)
        
        # Should result in one merged outcome (or multiple if they can't be merged)
        # Take the one with highest "probability" (most merged)
        merged_outcome = max(merged_dict.keys(), key=lambda x: merged_dict[x])
    
    # Build full outcome string for ALL remaining games (not just simulation games)
    # remaining_games is based on results_bracket (original)
    remaining_games = find_remaining_games(results_bracket)
    
    # We need to map each remaining game to an outcome character:
    # - Games decided in Step 1: '0' or '1' based on which team won
    # - Dead games: 'D'
    # - Simulation games: character from merged_outcome
    
    sim_game_set = set(simulation_games)
    dead_game_set = set(dead_games)
    
    full_outcome = []
    sim_idx = 0
    
    for round_key, game_idx in remaining_games:
        # Get the game from optimal_bracket (which has Step 1 decisions)
        opt_games = optimal_bracket.get(round_key, [])
        opt_game = opt_games[game_idx] if game_idx < len(opt_games) else None
        
        # Get the game from results_bracket (to know original teams)
        res_games = results_bracket.get(round_key, [])
        res_game = res_games[game_idx] if game_idx < len(res_games) else None
        
        if (round_key, game_idx) in dead_game_set:
            # Dead game
            full_outcome.append('D')
        elif (round_key, game_idx) in sim_game_set:
            # Simulation game - get character from merged_outcome
            if sim_idx < len(merged_outcome):
                full_outcome.append(merged_outcome[sim_idx])
            else:
                full_outcome.append('X')  # Fallback shouldn't happen
            sim_idx += 1
        elif opt_game and opt_game.get("winner"):
            # Game was decided in Step 1 - determine if team1 or team2 won
            winner_name = get_team_name(opt_game.get("winner"))
            team1_name = get_team_name(res_game.get("team1")) if res_game else None
            team2_name = get_team_name(res_game.get("team2")) if res_game else None
            
            if winner_name == team1_name:
                full_outcome.append('0')  # team1 wins
            elif winner_name == team2_name:
                full_outcome.append('1')  # team2 wins
            else:
                # Winner might have been propagated from earlier round
                # Check optimal_bracket's teams
                opt_team1_name = get_team_name(opt_game.get("team1"))
                opt_team2_name = get_team_name(opt_game.get("team2"))
                if winner_name == opt_team1_name:
                    full_outcome.append('0')
                else:
                    full_outcome.append('1')
        else:
            # This shouldn't happen - game is neither decided, dead, nor simulated
            full_outcome.append('X')  # Fallback
    
    full_outcome_str = ''.join(full_outcome)
    
    # Calculate probability
    # For this we need to create a hypothetical bracket and use calculate_outcome_probability
    # But we need to handle X and D specially
    
    # For probability calculation:
    # - D positions: either outcome is possible (multiply by prob of both)
    # - X positions: already handled by calculate_outcome_probability
    # - 0/1 positions: specific outcome
    
    # Actually, for probability we need to sum over all possible outcomes
    # For X positions: sum probabilities of both outcomes
    # For D positions: same as X (sum probabilities of both outcomes)
    
    probability = calculate_optimal_probability(
        full_outcome_str, remaining_games, optimal_bracket, teams_data
    )
    
    return full_outcome_str, probability


def calculate_optimal_probability(outcome_str, remaining_games, bracket, teams_data):
    """
    Calculate probability of an optimal outcome.
    For X and D positions, both outcomes are possible so we sum/account for both.
    """
    # For each position that is X or D, we need to consider both outcomes
    # This means the probability is the product of individual game probabilities
    # where X/D games contribute probability 1 (either outcome works)
    
    # Create a hypothetical bracket to get team matchups
    hypothetical = copy.deepcopy(bracket)
    
    probability = 1.0
    
    for i, (round_key, game_idx) in enumerate(remaining_games):
        if i >= len(outcome_str):
            break
            
        game = hypothetical[round_key][game_idx]
        team1 = game.get("team1")
        team2 = game.get("team2")
        
        if not team1 or not team2:
            continue
        
        outcome_char = outcome_str[i]
        
        team1_name = get_team_name(team1)
        team2_name = get_team_name(team2)
        
        # Get probability column for this round
        round_num = ROUND_KEYS.index(round_key) + 1
        prob_columns = ['prob_r32', 'prob_r16', 'prob_r8', 'prob_r4', 'prob_r2', 'prob_win']
        prob_col = prob_columns[round_num - 1] if round_num <= 6 else 'prob_win'
        
        if outcome_char in ('X', 'D'):
            # Either outcome works - probability is 1 (we'll get one of them)
            # Actually we need to propagate the lower seed for display
            team1_seed = team1.get('seed', 99) if isinstance(team1, dict) else 99
            team2_seed = team2.get('seed', 99) if isinstance(team2, dict) else 99
            winner = team1 if team1_seed <= team2_seed else team2
        elif outcome_char == '0':
            # Team1 wins
            winner = team1
            # Probability is team1's probability of reaching next round
            if team1_name in teams_data and prob_col in teams_data[team1_name]:
                # Need conditional probability: P(team1 wins | both reached this round)
                # This is complex - for now use simplified approach
                team1_prob = teams_data[team1_name].get(prob_col, 0.5)
                team2_prob = teams_data[team2_name].get(prob_col, 0.5) if team2_name in teams_data else 0.5
                # Conditional probability
                if team1_prob + team2_prob > 0:
                    probability *= team1_prob / (team1_prob + team2_prob)
                else:
                    probability *= 0.5
            else:
                probability *= 0.5
        else:  # '1'
            # Team2 wins
            winner = team2
            if team2_name in teams_data and prob_col in teams_data[team2_name]:
                team1_prob = teams_data[team1_name].get(prob_col, 0.5) if team1_name in teams_data else 0.5
                team2_prob = teams_data[team2_name].get(prob_col, 0.5)
                if team1_prob + team2_prob > 0:
                    probability *= team2_prob / (team1_prob + team2_prob)
                else:
                    probability *= 0.5
            else:
                probability *= 0.5
        
        # Propagate winner to next round
        parent_info = get_parent_game_info(round_key, game_idx)
        if parent_info:
            parent_round, parent_index, slot = parent_info
            if parent_round in hypothetical and parent_index < len(hypothetical[parent_round]):
                parent_game = hypothetical[parent_round][parent_index]
                if slot == 0:
                    parent_game["team1"] = winner
                else:
                    parent_game["team2"] = winner
    
    return probability


def build_optimal_bracket(results_bracket, picks_bracket, teams_data):
    """
    Build the optimal bracket for maximum possible score.
    
    Algorithm:
    1. Find Latest: Find participant's furthest-round pick(s) still alive, trace their paths
    2. Compute Dead Paths: Mark games where participant can't earn points
    3. Simulate All: Try all combinations for remaining games, keep max score outcomes
    4. Merge & Probability: Merge tied outcomes and compute probability
    """
    alive_teams = get_alive_teams(results_bracket)
    
    # Step 1: Find Latest
    optimal_bracket = step1_find_latest(results_bracket, picks_bracket, teams_data, alive_teams)
    
    # Step 2: Mark Dead Paths
    dead_games = step2_mark_dead_paths(optimal_bracket, picks_bracket, alive_teams)
    
    # Step 3: Find games to simulate
    simulation_games = find_simulation_games(optimal_bracket, dead_games)
    
    # Step 3: Simulate all possibilities
    max_outcomes = step3_simulate_all(
        optimal_bracket, picks_bracket, simulation_games, dead_games, teams_data
    )
    
    # Step 4: Merge and compute probability
    remaining_games = find_remaining_games(results_bracket)
    
    merged_outcome, probability = step4_merge_and_probability(
        max_outcomes, simulation_games, dead_games,
        results_bracket, optimal_bracket, teams_data
    )
    
    # Decode merged outcome to games format
    if merged_outcome:
        games = decode_merged_outcome_to_games(results_bracket, remaining_games, merged_outcome)
    else:
        games = []
    
    # Get max score
    max_score = list(max_outcomes.values())[0] if max_outcomes else 0
    
    # Return in same format as winning scenarios
    return {
        "outcome": merged_outcome,
        "probability": probability,
        "games": games,
        "max_score": max_score,
        "num_tied_outcomes": len(max_outcomes) if max_outcomes else 0
    }


def main():
    # Load results bracket
    results_path = BASE_PATH / f"results-bracket-march-madness-{YEAR}-early.json"
    results_bracket = load_json(results_path)
    
    # Load teams data (for probabilities and seed info)
    teams_path = BASE_PATH / "teams.csv"
    if teams_path.exists():
        teams_data = load_teams(str(teams_path), results_bracket, validate=False)
    else:
        # Build basic teams_data from round1
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
        
        try:
            optimal = build_optimal_bracket(results_bracket, picks_bracket, teams_data)
            optimal_brackets[name] = optimal
            print(f"Generated optimal bracket for {name}: max_score={optimal['max_score']}, "
                  f"probability={optimal['probability']:.6f}, tied_outcomes={optimal['num_tied_outcomes']}")
        except RuntimeError as e:
            print(f"Error generating optimal bracket for {name}: {e}")
            continue
    
    # Save all optimal brackets to a single file
    output_path = BASE_PATH / "optimal-brackets.json"
    save_json(output_path, optimal_brackets)
    print(f"\nSaved optimal brackets to {output_path}")


if __name__ == "__main__":
    main()