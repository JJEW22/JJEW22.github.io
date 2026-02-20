#!/usr/bin/env python3
"""
Generate seed_probabilities.csv with proper transformations:
1. Divide prob_r2 by 2 and prob_win by 4
2. Apply floor values (0.5% start, multiply by 1/20 for consecutive zeros)
3. Normalize within bracket groups for each round
"""

# Raw historical data from the table
raw_data = {
    1:  {'prob_r32': 0.988, 'prob_r16': 0.850, 'prob_r8': 0.669, 'prob_r4': 0.413, 'prob_r2': 0.513, 'prob_win': 0.650},
    2:  {'prob_r32': 0.931, 'prob_r16': 0.644, 'prob_r8': 0.450, 'prob_r4': 0.200, 'prob_r2': 0.163, 'prob_win': 0.125},
    3:  {'prob_r32': 0.856, 'prob_r16': 0.525, 'prob_r8': 0.256, 'prob_r4': 0.106, 'prob_r2': 0.138, 'prob_win': 0.100},
    4:  {'prob_r32': 0.794, 'prob_r16': 0.481, 'prob_r8': 0.156, 'prob_r4': 0.094, 'prob_r2': 0.050, 'prob_win': 0.050},
    5:  {'prob_r32': 0.644, 'prob_r16': 0.344, 'prob_r8': 0.075, 'prob_r4': 0.056, 'prob_r2': 0.050, 'prob_win': 0.000},
    6:  {'prob_r32': 0.613, 'prob_r16': 0.294, 'prob_r8': 0.106, 'prob_r4': 0.019, 'prob_r2': 0.025, 'prob_win': 0.025},
    7:  {'prob_r32': 0.613, 'prob_r16': 0.181, 'prob_r8': 0.063, 'prob_r4': 0.019, 'prob_r2': 0.013, 'prob_win': 0.025},
    8:  {'prob_r32': 0.481, 'prob_r16': 0.100, 'prob_r8': 0.056, 'prob_r4': 0.038, 'prob_r2': 0.050, 'prob_win': 0.025},
    9:  {'prob_r32': 0.519, 'prob_r16': 0.050, 'prob_r8': 0.031, 'prob_r4': 0.013, 'prob_r2': 0.000, 'prob_win': 0.000},
    10: {'prob_r32': 0.388, 'prob_r16': 0.150, 'prob_r8': 0.056, 'prob_r4': 0.006, 'prob_r2': 0.000, 'prob_win': 0.000},
    11: {'prob_r32': 0.388, 'prob_r16': 0.169, 'prob_r8': 0.063, 'prob_r4': 0.038, 'prob_r2': 0.000, 'prob_win': 0.000},
    12: {'prob_r32': 0.356, 'prob_r16': 0.138, 'prob_r8': 0.013, 'prob_r4': 0.000, 'prob_r2': 0.000, 'prob_win': 0.000},
    13: {'prob_r32': 0.206, 'prob_r16': 0.038, 'prob_r8': 0.000, 'prob_r4': 0.000, 'prob_r2': 0.000, 'prob_win': 0.000},
    14: {'prob_r32': 0.144, 'prob_r16': 0.013, 'prob_r8': 0.000, 'prob_r4': 0.000, 'prob_r2': 0.000, 'prob_win': 0.000},
    15: {'prob_r32': 0.069, 'prob_r16': 0.025, 'prob_r8': 0.006, 'prob_r4': 0.000, 'prob_r2': 0.000, 'prob_win': 0.000},
    16: {'prob_r32': 0.013, 'prob_r16': 0.000, 'prob_r8': 0.000, 'prob_r4': 0.000, 'prob_r2': 0.000, 'prob_win': 0.000},
}

# Bracket groupings for each round
GROUPS = {
    'prob_r32': [
        [1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]
    ],
    'prob_r16': [
        [1, 16, 8, 9], [5, 12, 4, 13], [6, 11, 3, 14], [7, 10, 2, 15]
    ],
    'prob_r8': [
        [1, 16, 8, 9, 5, 12, 4, 13], [6, 11, 3, 14, 7, 10, 2, 15]
    ],
    'prob_r4': [
        list(range(1, 17))  # All seeds
    ],
    'prob_r2': [
        list(range(1, 17))  # All seeds
    ],
    'prob_win': [
        list(range(1, 17))  # All seeds
    ],
}

# Floor value settings
FLOOR_START = 0.005  # 0.5%
FLOOR_MULTIPLIER = 0.05  # 1/20

def apply_transformations():
    data = {}
    
    # Copy raw data
    for seed in raw_data:
        data[seed] = raw_data[seed].copy()
    
    # Step 1: Divide prob_r2 by 2 and prob_win by 4
    print("Step 1: Dividing prob_r2 by 2 and prob_win by 4")
    for seed in data:
        data[seed]['prob_r2'] /= 2
        data[seed]['prob_win'] /= 4
    
    # Step 2: Apply floor values for zeros (with consecutive scaling)
    print("Step 2: Applying floor values (0.5% start, 1/20 scale)")
    prob_columns = ['prob_r32', 'prob_r16', 'prob_r8', 'prob_r4', 'prob_r2', 'prob_win']
    
    for seed in data:
        consecutive_zeros = 0
        for col in prob_columns:
            if data[seed][col] == 0:
                floor_value = FLOOR_START * (FLOOR_MULTIPLIER ** consecutive_zeros)
                data[seed][col] = floor_value
                consecutive_zeros += 1
            else:
                consecutive_zeros = 0

    print_data(data, "After consecutive 0s")
    
    # Step 3: Normalize within bracket groups
    print("Step 3: Normalizing within bracket groups")
    for col in prob_columns:
        for group in GROUPS[col]:
            # Sum probabilities in this group
            total = sum(data[seed][col] for seed in group)
            
            if total > 0:
                if col == 'prob_r2':
                    total *= 2 # used to represent the 2 divisions that go into this game
                elif col == 'prob_win':
                    total *= 4 # used to represent the 4 divisions that go into this game
                # Normalize so group sums to 1
                for seed in group:
                    data[seed][col] /= total
    
    return data

def print_data(data, title):
    print(f"\n{title}")
    print("-" * 80)
    print(f"{'Seed':>4} {'prob_r32':>10} {'prob_r16':>10} {'prob_r8':>10} {'prob_r4':>10} {'prob_r2':>10} {'prob_win':>10}")
    print("-" * 80)
    for seed in range(1, 17):
        d = data[seed]
        print(f"{seed:>4} {d['prob_r32']:>10.6f} {d['prob_r16']:>10.6f} {d['prob_r8']:>10.6f} {d['prob_r4']:>10.6f} {d['prob_r2']:>10.6f} {d['prob_win']:>10.6f}")

def write_csv(data, filepath):
    with open(filepath, 'w') as f:
        f.write("seed,prob_r32,prob_r16,prob_r8,prob_r4,prob_r2,prob_win\n")
        for seed in range(1, 17):
            d = data[seed]
            f.write(f"{seed},{d['prob_r32']},{d['prob_r16']},{d['prob_r8']},{d['prob_r4']},{d['prob_r2']},{d['prob_win']}\n")
    print(f"\nWritten to {filepath}")

def verify_normalization(data):
    print("\nVerifying normalization (group sums):")
    prob_columns = ['prob_r32', 'prob_r16', 'prob_r8', 'prob_r4', 'prob_r2', 'prob_win']
    
    for col in prob_columns:
        print(f"\n{col}:")
        for i, group in enumerate(GROUPS[col]):
            total = sum(data[seed][col] for seed in group)
            print(f"  Group {i+1} {group}: sum = {total:.6f}")

if __name__ == '__main__':
    print("Raw data:")
    print_data(raw_data, "Original Historical Data")
    
    data = apply_transformations()
    
    print_data(data, "After All Transformations")
    
    verify_normalization(data)
    
    write_csv(data, './seed_probabilities.csv')