import pandas as pd
import numpy as np

# ==========================================
# 1. DEFINE YOUR SCORING FUNCTION
# ==========================================
def score_prediction(actual_table, predicted_table):
    """
    Evaluates a single Reddit user's prediction against the actual table.
    Uses Mean Absolute Error (MAE) of league positions as a basic example.
    """
    # Merge the two tables on the Team Name
    merged = pd.merge(actual_table, predicted_table, on='Team', suffixes=('_actual', '_pred'))
    
    # Calculate the absolute difference in position for each team
    merged['position_error'] = abs(merged['Position_actual'] - merged['Position_pred'])
    
    # Return the total or average error (Lower score = better prediction)
    total_error = merged['position_error'].sum()
    return total_error

# ==========================================
# 2. THE SIMULATION LOOP
# ==========================================
def run_simulation(all_weeks_data, reddit_predictions):
    """
    Simulates the scoring function across every matchweek of the season.
    
    Expected Inputs:
    - all_weeks_data: Dict mapping week_number -> DataFrame of that week's standings
    - reddit_predictions: Dict mapping username -> DataFrame of their predicted table
    """
    results_log = []

    # Iterate through every week of the season (1 to 38)
    for week, actual_table in all_weeks_data.items():
        print(f"Simulating Matchweek {week}...")
        
        # Grade every Reddit user's prediction against THIS week's table
        for user, predicted_table in reddit_predictions.items():
            
            score = score_prediction(actual_table, predicted_table)
            
            # Log the result
            results_log.append({
                'Matchweek': week,
                'User': user,
                'Score': score
            })
            
    # Convert logs to a DataFrame for easy analysis and graphing
    return pd.DataFrame(results_log)

# ==========================================
# 3. MOCK DATA & EXECUTION (Example)
# ==========================================
if __name__ == "__main__":
    
    # Example structure of how your data should look before passing it in:
    # Actual Table (Matchweek 1)
    mw1_df = pd.DataFrame({
        'Position': [1, 2, 3, 4], # Truncated for example
        'Team': ['Man City', 'Arsenal', 'Liverpool', 'Aston Villa']
    })
    
    # Reddit User Prediction (Final Table)
    user_prediction_df = pd.DataFrame({
        'Position': [1, 2, 3, 4],
        'Team': ['Arsenal', 'Man City', 'Liverpool', 'Man United']
    })
    
    # Pack into dictionaries
    mock_season_data = {1: mw1_df} # You would have 1 through 38
    mock_reddit_data = {'u/SoccerFan99': user_prediction_df}
    
    # Run the simulation
    simulation_results = run_simulation(mock_season_data, mock_reddit_data)
    
    print("\n--- Simulation Results ---")
    print(simulation_results.head())