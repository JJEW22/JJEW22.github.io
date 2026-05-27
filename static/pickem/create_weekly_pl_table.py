import pandas as pd

def calculate_weekly_standings(csv_file):
    # 1. Load match data
    # Assuming standard columns: HomeTeam, AwayTeam, FTHG, FTAG
    matches = pd.read_csv(csv_file)
    
    # 2. Initialize tracking
    teams = sorted(list(set(matches['HomeTeam'])))
    # Create a DataFrame to hold state for each team
    stats = {team: {'Points': 0, 'GD': 0, 'Played': 0} for team in teams}
    
    weekly_snapshots = {} # Stores {week_number: DataFrame}
    
    # 3. Iterate through matches
    for i, match in matches.iterrows():
        home, away = match['HomeTeam'], match['AwayTeam']
        home_g, away_g = match['FTHG'], match['FTAG']
        
        # Update Played count
        stats[home]['Played'] += 1
        stats[away]['Played'] += 1
        
        # Update GD
        stats[home]['GD'] += (home_g - away_g)
        stats[away]['GD'] += (away_g - home_g)
        
        # Update Points
        if home_g > away_g:
            stats[home]['Points'] += 3
        elif home_g < away_g:
            stats[away]['Points'] += 3
        else:
            stats[home]['Points'] += 1
            stats[away]['Points'] += 1
            
        # 4. Check if a full matchweek is completed
        # A full week occurs when all teams have played the same number of games
        played_counts = [stats[t]['Played'] for t in teams]
        if len(set(played_counts)) == 1:
            week = played_counts[0]
            
            # Create snapshot table
            df_table = pd.DataFrame.from_dict(stats, orient='index')
            df_table.index.name = 'Team'
            df_table = df_table.sort_values(by=['Points', 'GD'], ascending=False).reset_index()
            df_table['Position'] = range(1, 21)
            
            weekly_snapshots[week] = df_table.copy()
            
    return weekly_snapshots

# Example usage:
# snapshots = calculate_weekly_standings('season-2526.csv')

if __name__ == "__main__":
    calculate_weekly_standings('./Pl25-26.csv')