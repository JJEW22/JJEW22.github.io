#!/usr/bin/env python3
"""
Process pizza bracket ratings from xlsx into bracket results JSON.

ONE SHEET PER ROUND. The workbook holds a sheet for every round in the bracket
("Round 1", "Round 2", "Division Final", "Semifinals", "Championship"), and each
sheet has the same shape:

    Row 1:  subheader  — which division/matchup the column belongs to
    Row 2:  team name  — "(seed) Name"
    Row 3+: one row per voter, ratings on a 1-5 scale

Every round sheet carries the full voter list in column A, so a voter who only
turns up for one round is still lined up correctly with everyone else.

Winners:
  - 2-team matchups: each voter's higher rating = 1 vote. Tiebreak on higher average.
  - 3-team matchups: eliminate the lowest average, then 2-team voting on the rest.

A later round's teams aren't known until the earlier rounds resolve, so those
columns start out headed "TBD". Their space is still reserved, which is what keeps
column positions stable from run to run. Re-run with --sync-sheets after results
land and the TBDs are replaced by the teams that actually advanced.

THE COLUMN MAP IS DERIVED, NOT MAINTAINED. It used to be an input, and a stale copy
of it is what silently broke Mission Hill: the map said "Il Mondo'" where the bracket
said "Il Mondo's", the names failed to match, and a 3-team match quietly resolved as
a 2-team one. It is now generated from the bracket on every run and written out only
so it can be read; nothing reads it back in.

Usage:
    # Score the votes that are in the workbook, and open up any newly-ready round:
    python processPizzaRatings.py --ratings pizzaBracketRatings.xlsx \
        --bracket pizzaBracket.json --column-map pizzaBracketColumnMap.json --sync-sheets

    # Score only, leave the workbook untouched:
    python processPizzaRatings.py --ratings pizzaBracketRatings.xlsx --bracket pizzaBracket.json
"""

import json
import argparse
import os
import shutil
import sys
from collections import OrderedDict
from datetime import datetime

# Windows consoles default to cp1252, which can't encode the tick/arrow characters
# below — that used to abort the run partway through with a UnicodeEncodeError.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

try:
    from openpyxl import load_workbook, Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
except ImportError:
    print("Error: openpyxl required. Install with: pip install openpyxl")
    sys.exit(1)


FIRST_VOTER_ROW = 3
FIRST_TEAM_COL = 2  # column B; column A is the voter name

# The workbook was a single sheet called "Pizza Ratings" holding round 1 only. Its
# columns match what this script now generates for the "Round 1" sheet, so reading
# it under that alias migrates the existing votes across on the first --sync-sheets.
SHEET_ALIASES = {'Round 1': ['Pizza Ratings']}


def is_placeholder(name):
    """A team slot with nobody in it yet. Note: a REAL team here is called
    'Round 2', so never treat a round-shaped name as a placeholder."""
    return not name or str(name).strip() == '' or str(name).strip() == 'TBD'


def round_layout(bracket):
    """
    Ordered: sheet name -> [(subheader, match), ...].

    Rounds of the same name share a sheet, so "Round 1" holds all four divisions
    side by side in division order, which is how the sheet already read.
    """
    sheets = OrderedDict()
    for div in bracket.get('divisions', []):
        for rd in div.get('rounds', []):
            entries = sheets.setdefault(rd['name'], [])
            for match in rd.get('matches', []):
                entries.append((f"{div['name']} - {rd['name']}", match))
    for rd in bracket.get('finals', {}).get('rounds', []):
        entries = sheets.setdefault(rd['name'], [])
        matches = rd.get('matches', [])
        for i, match in enumerate(matches):
            # Two semifinals on one sheet would otherwise both read "Semifinals".
            label = f"{rd['name']} - Match {i + 1}" if len(matches) > 1 else rd['name']
            entries.append((label, match))
    return sheets


def build_column_map(bracket):
    """
    Derive the sheet/column -> match/team mapping from the bracket.

    Columns are reserved for every team in every match, including ones still TBD, so
    a column never moves once it exists. Only fully-known matchups get map entries —
    an unresolved matchup has nothing to rate, so its reserved columns stay unread.
    """
    col_map = []
    pending = []
    for sheet, entries in round_layout(bracket).items():
        col = FIRST_TEAM_COL
        for subheader, match in entries:
            names = [t.get('name') for t in match.get('teams', [])]
            ready = names and not any(is_placeholder(n) for n in names)
            if ready:
                for ti, team in enumerate(match['teams']):
                    col_map.append({
                        'sheet': sheet,
                        'column': col + ti,
                        'matchId': match['id'],
                        'teamIndex': ti,
                        'teamName': team['name'],
                        'seed': team.get('seed'),
                        'subheader': subheader,
                    })
            else:
                pending.append((sheet, match['id']))
            col += len(names)  # reserved either way
    return col_map, pending


def resolve_sheet(wb, name):
    if name in wb.sheetnames:
        return wb[name]
    for alias in SHEET_ALIASES.get(name, []):
        if alias in wb.sheetnames:
            print(f"  (reading '{alias}' as '{name}')")
            return wb[alias]
    return None


def read_workbook(xlsx_path, col_map):
    """
    Load every sheet named in the column map.

    Returns (ratings, voters) where ratings is matchId -> teamName -> {voter: rating}.
    Keyed by VOTER, not by row order: the old code zipped two teams' rating lists by
    index, so one voter skipping one team shifted everybody after them onto the wrong
    opponent. With per-round sheets and different people voting each round that would
    have gone from a latent bug to a routine one.
    """
    ratings = {}
    voters = []
    if not os.path.exists(xlsx_path):
        print(f"  no workbook at {xlsx_path} yet")
        return ratings, voters

    wb = load_workbook(xlsx_path, data_only=True)
    by_sheet = OrderedDict()
    for e in col_map:
        by_sheet.setdefault(e['sheet'], []).append(e)

    for sheet, entries in by_sheet.items():
        ws = resolve_sheet(wb, sheet)
        if ws is None:
            continue
        found = 0
        for row in range(FIRST_VOTER_ROW, ws.max_row + 1):
            raw = ws.cell(row=row, column=1).value
            if raw is None or str(raw).strip() == '':
                continue
            voter = str(raw).strip()
            if voter not in voters:
                voters.append(voter)
            for e in entries:
                val = ws.cell(row=row, column=e['column']).value
                if val is None or val == '':
                    continue
                try:
                    rating = float(val)
                except (TypeError, ValueError):
                    continue
                ratings.setdefault(e['matchId'], {}).setdefault(e['teamName'], {})[voter] = rating
                found += 1
        print(f"  {sheet}: {found} ratings")
    return ratings, voters


def average(rated):
    return sum(rated.values()) / len(rated) if rated else 0


def determine_winner_2team(name1, name2, rated1, rated2):
    """
    Winner of a 2-team matchup. Votes are counted only over voters who rated BOTH
    teams — a one-sided rating says nothing about a preference between them. Averages
    use every rating the team got.

    Returns (winner, votes1, votes2, avg1, avg2).
    """
    if not rated1 and not rated2:
        return None, 0, 0, 0, 0

    shared = set(rated1) & set(rated2)
    votes1 = sum(1 for v in shared if rated1[v] > rated2[v])
    votes2 = sum(1 for v in shared if rated2[v] > rated1[v])
    avg1, avg2 = average(rated1), average(rated2)

    if votes1 > votes2:
        winner = name1
    elif votes2 > votes1:
        winner = name2
    elif avg1 > avg2:
        winner = name1
    elif avg2 > avg1:
        winner = name2
    else:
        winner = name1
        print(f"  ! perfect tie between {name1} and {name2}, defaulting to {name1}")

    only1, only2 = len(rated1) - len(shared), len(rated2) - len(shared)
    if only1 or only2:
        print(f"  ! {only1 + only2} rating(s) ignored for votes "
              f"({name1}: {only1} unmatched, {name2}: {only2}) — no opponent rating from that voter")
    return winner, votes1, votes2, avg1, avg2


def determine_winner_3team(teams_rated):
    """
    Winner of a 3-team matchup: drop the lowest average, then 2-team voting.
    Returns (winner, {team: {'votes': n|None, 'rating': avg}}).
    """
    averages = {name: average(rated) for name, rated in teams_rated.items()}

    if len(averages) < 3:
        print(f"  ! only {len(averages)} of 3 teams have ratings")
        names = list(averages)
        if len(names) == 2:
            winner, v1, v2, a1, a2 = determine_winner_2team(
                names[0], names[1], teams_rated[names[0]], teams_rated[names[1]])
            return winner, {names[0]: {'votes': v1, 'rating': a1},
                            names[1]: {'votes': v2, 'rating': a2}}
        if len(names) == 1:
            return names[0], {names[0]: {'votes': 0, 'rating': averages[names[0]]}}
        return None, {}

    ranked = sorted(averages.items(), key=lambda kv: kv[1])
    eliminated = ranked[0][0]
    remaining = [n for n in averages if n != eliminated]

    print("  triple: " + ', '.join(f'{k} {v:.2f}' for k, v in averages.items()))
    print(f"  eliminated on lowest average: {eliminated} ({averages[eliminated]:.2f})")

    winner, v1, v2, a1, a2 = determine_winner_2team(
        remaining[0], remaining[1], teams_rated[remaining[0]], teams_rated[remaining[1]])

    return winner, {
        remaining[0]: {'votes': v1, 'rating': a1},
        remaining[1]: {'votes': v2, 'rating': a2},
        eliminated: {'votes': None, 'rating': averages[eliminated]},
    }


def all_matches(bracket):
    for div in bracket.get('divisions', []):
        for rd in div.get('rounds', []):
            for m in rd.get('matches', []):
                yield m
    for rd in bracket.get('finals', {}).get('rounds', []):
        for m in rd.get('matches', []):
            yield m


def propagate_winner(bracket, match):
    """Advance a winner into whichever slot names this match as its source."""
    for m in all_matches(bracket):
        for team in m.get('teams', []):
            if team.get('source') == match['id'] and is_placeholder(team.get('name')):
                team['name'] = match['winner']
                print(f"  -> {match['winner']} advances to {m['id']}")


def process_match(match, rated_for_match):
    if not rated_for_match or sum(len(r) for r in rated_for_match.values()) == 0:
        return False

    if match.get('type') == 'triple':
        teams_rated = {t['name']: rated_for_match[t['name']]
                       for t in match['teams'] if t['name'] in rated_for_match}
        winner, results = determine_winner_3team(teams_rated)
        if not winner:
            return False
        match['winner'] = winner
        for team in match['teams']:
            if team['name'] in results:
                team['votes'] = results[team['name']]['votes']
                team['rating'] = round(results[team['name']]['rating'], 2)
        print(f"  OK {match['id']}: {winner} wins")
        return True

    rated = [(t, rated_for_match.get(t['name'], {}))
             for t in match['teams'] if not is_placeholder(t.get('name'))]
    if len(rated) < 2:
        return False

    (t1, r1), (t2, r2) = rated[0], rated[1]
    winner, v1, v2, a1, a2 = determine_winner_2team(t1['name'], t2['name'], r1, r2)
    if not winner:
        return False
    match['winner'] = winner
    t1['votes'], t1['rating'] = v1, round(a1, 2)
    t2['votes'], t2['rating'] = v2, round(a2, 2)
    print(f"  OK {match['id']}: {winner} wins ({v1}-{v2}, avg {a1:.2f} vs {a2:.2f})")
    return True


def process_bracket(bracket, ratings):
    """
    Score every match with votes, advancing winners as they're decided.

    Rounds are walked in bracket order so a winner is available to the next round in
    the same pass — one run takes a fresh set of votes as far up the bracket as it goes.
    """
    scored = 0
    for sheet, entries in round_layout(bracket).items():
        print(f"\n--- {sheet} ---")
        for _subheader, match in entries:
            if process_match(match, ratings.get(match['id'], {})):
                scored += 1
                if match.get('winner'):
                    propagate_winner(bracket, match)
    return scored


def sync_sheets(xlsx_path, bracket, col_map, ratings, voters, backup_dir=None):
    """
    Rebuild the workbook: one sheet per round, existing votes carried over.

    Votes are restored by (match, team, voter) rather than by cell, so they follow
    their team even if the layout shifts underneath them.
    """
    if os.path.exists(xlsx_path):
        stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
        dest_dir = backup_dir or os.path.dirname(os.path.abspath(xlsx_path))
        os.makedirs(dest_dir, exist_ok=True)
        base = os.path.splitext(os.path.basename(xlsx_path))[0]
        backup = os.path.join(dest_dir, f'{base}.backup-{stamp}.xlsx')
        shutil.copy2(xlsx_path, backup)
        print(f"\nBacked up existing workbook to {backup}")

    head_fill = PatternFill('solid', fgColor='EEEEEE')
    map_by_sheet = {}
    for e in col_map:
        map_by_sheet.setdefault(e['sheet'], {})[e['column']] = e

    wb = Workbook()
    wb.remove(wb.active)

    for sheet, entries in round_layout(bracket).items():
        ws = wb.create_sheet(title=sheet[:31])
        ws.cell(row=1, column=1, value='Voter').font = Font(bold=True)
        ws.column_dimensions['A'].width = 16

        col = FIRST_TEAM_COL
        for subheader, match in entries:
            for team in match.get('teams', []):
                name = team.get('name')
                label = 'TBD' if is_placeholder(name) else str(name)
                seed = team.get('seed')
                if seed:
                    label = f"({seed}) {label}"
                c1 = ws.cell(row=1, column=col, value=subheader)
                c1.font = Font(size=9, italic=True, color='666666')
                c1.fill = head_fill
                c1.alignment = Alignment(wrap_text=True, vertical='center')
                c2 = ws.cell(row=2, column=col, value=label)
                c2.font = Font(bold=True)
                c2.alignment = Alignment(wrap_text=True, vertical='center')
                ws.column_dimensions[c2.column_letter].width = 15
                col += 1

        for i, voter in enumerate(voters):
            row = FIRST_VOTER_ROW + i
            ws.cell(row=row, column=1, value=voter)
            for column, e in map_by_sheet.get(sheet, {}).items():
                val = ratings.get(e['matchId'], {}).get(e['teamName'], {}).get(voter)
                if val is not None:
                    ws.cell(row=row, column=column, value=val)

        # Keep the voter column and both header rows on screen while scrolling right.
        ws.freeze_panes = 'B3'

    wb.save(xlsx_path)
    ready = sorted({e['sheet'] for e in col_map})
    print(f"Wrote {len(wb.sheetnames)} sheets to {xlsx_path}: {', '.join(wb.sheetnames)}")
    print(f"Sheets open for voting: {', '.join(ready) if ready else '(none)'}")


def main():
    parser = argparse.ArgumentParser(description='Process pizza bracket ratings')
    parser.add_argument('--ratings', required=True, help='Path to ratings xlsx')
    parser.add_argument('--bracket', required=True, help='Path to bracket JSON')
    parser.add_argument('--column-map', help='Where to WRITE the derived column map (optional)')
    parser.add_argument('--output', help='Bracket output path (default: overwrite --bracket)')
    parser.add_argument('--sync-sheets', action='store_true',
                        help='Rebuild the workbook with one sheet per round, preserving votes')
    parser.add_argument('--backup-dir', help='Where --sync-sheets puts its backup (default: alongside the xlsx)')
    args = parser.parse_args()

    with open(args.bracket, 'r', encoding='utf-8') as f:
        bracket = json.load(f)

    col_map, pending = build_column_map(bracket)
    print(f"Derived {len(col_map)} team columns across "
          f"{len({e['sheet'] for e in col_map})} sheet(s)")
    if pending:
        print(f"Awaiting earlier results ({len(pending)}): "
              + ', '.join(f'{m} [{s}]' for s, m in pending))

    print("\nReading workbook:")
    ratings, voters = read_workbook(args.ratings, col_map)
    print(f"\n{len(voters)} voters, {len(ratings)} matches with ratings")

    scored = process_bracket(bracket, ratings)
    print(f"\n{scored} match(es) scored")

    output_path = args.output or args.bracket
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(bracket, f, indent=2)
        f.write('\n')
    print(f"Bracket written to {output_path}")

    # Rebuilt from the UPDATED bracket: winners have advanced, so matchups that were
    # TBD a moment ago now have real names and become votable.
    col_map, pending = build_column_map(bracket)

    if args.column_map:
        with open(args.column_map, 'w', encoding='utf-8') as f:
            json.dump(col_map, f, indent=2)
            f.write('\n')
        print(f"Column map written to {args.column_map}")

    if args.sync_sheets:
        sync_sheets(args.ratings, bracket, col_map, ratings, voters, args.backup_dir)
    elif pending:
        print("\nRe-run with --sync-sheets to open the next round for voting.")


if __name__ == '__main__':
    main()
