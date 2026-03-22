import json
import os
import argparse
import random
import numpy as np
import csv
import time
from typing import Dict, List, Optional, Set, Tuple, Union
import pandas as pd


def main():
    print('got here')
    parser = argparse.ArgumentParser(description='Calculate March Madness win probabilities')
    parser.add_argument('--input_csv', required=True, help='Path to outcome bracket csv file')
    parser.add_argument('--output', required=True, help='Path to desired output JSON')
    parser.add_argument('--participants-file', required=True, help='Path to participants JSON')
    parser.add_argument('--exclude', required=False, help='Names to remove')
    
    args = parser.parse_args()

    values_df = pd.read_csv(args.input_csv)
    print(values_df)
    participants_dict = None
    with open(args.participants_file) as f:
            participants_dict = json.load(f)
    print(participants_dict)

    exclude = []
    if args.exclude:
        exclude = (args.exclude).split(',')
        print(exclude)

    participants=list(participants_dict.keys())

    for exc in exclude:
        participants.remove(exc)
    print(participants)

    total_prob = sum(values_df['outcome_probability'])
    print(total_prob)
    values_df['outcome_probability'] = values_df['outcome_probability']/sum(values_df['outcome_probability'])

    print('grouped df')
    grouped_df = values_df.groupby(['winner'])['outcome_probability'].sum()
    double_grouped_df = values_df.groupby(['winner', 'loser'])['outcome_probability'].sum()
    print(grouped_df)
    print(double_grouped_df)


    total = 0
    for index, data in values_df.iterrows():
        total += data['outcome_probability']
    print(total)

    and_max = 0
    who = None
    for winner, _ in grouped_df.items():
        for loser, probability in double_grouped_df[winner].items():
             if probability > and_max:
                  who = (winner, loser)
                  and_max = probability
    print('maximum A AND B', who, and_max)

    adjusted = {}
    for winner, probability in grouped_df.items():
        adjusted[winner] = double_grouped_df[winner] / probability

    cur_max = 0
    who = None
    for winner in adjusted.keys():
        for loser, probability in adjusted[winner].items():
             if probability > cur_max:
                  who = (winner, loser)
                  cur_max = probability
    print('maximum A | B', who, cur_max)

             
        
              
    


if __name__ == '__main__':
    main()