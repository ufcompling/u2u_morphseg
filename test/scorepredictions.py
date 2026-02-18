#!/usr/bin/env python3
"""
score_predictions.py
Location: project root (run from anywhere)

Purpose:
  Compare TurtleShell prediction output against a gold standard file.
  Both files are single-column .tgt format — one segmented word per line
  with ! as boundary markers (e.g., "un!help!ful").

Usage:
  python score_predictions.py <predictions.tgt> <corpus_gold.tgt>
  python score_predictions.py predictions_cycle3.tgt corpus_gold.tgt

  Optional flags:
    --errors-only   Show only incorrect words (skip correct matches)
    --summary       Show only the summary table, no per-word detail

Output:
  Per-word scoring with error classification, summary table, and
  accuracy / boundary-level P/R/F1.

Author: Evan
Created: 2026-02-18
Version: 1.0.0
"""

import sys
from collections import Counter


def parse_tgt_file(path):
    """Read a .tgt file into a dict of {surface_word: segmented_form}.

    Handles both single-column (just segmented) and two-column
    (segmented<tab>surface) formats.
    """
    entries = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t")
            tgt = parts[0].strip()
            word = tgt.replace("!", "")
            entries[word] = tgt
    return entries


def get_boundaries(tgt):
    """Extract boundary positions from a segmented string.

    A boundary at position i means there's a morpheme break after
    the i-th character (0-indexed).

    Example: "un!help!ful" → boundaries at {2, 6}
      u(0) n(1) !  h(2) e(3) l(4) p(5) !  f(6) u(7) l(8)
      boundary after index 1, boundary after index 5
    """
    boundaries = set()
    char_idx = 0
    for ch in tgt:
        if ch == "!":
            boundaries.add(char_idx)
        else:
            char_idx += 1
    return boundaries


def classify_error(word, pred_tgt, gold_tgt):
    """Classify a prediction error into a human-readable category."""
    if pred_tgt == gold_tgt:
        return "correct"

    pred_b = get_boundaries(pred_tgt)
    gold_b = get_boundaries(gold_tgt)
    is_mono_gold = (gold_tgt == word)
    is_mono_pred = (pred_tgt == word)

    # Predicted boundaries on a monomorphemic word
    if is_mono_gold and pred_b:
        for prefix in ("un!", "re!", "dis!"):
            if pred_tgt.startswith(prefix):
                return "false_prefix"
        for suffix in ("!ed", "!ing", "!ness", "!ful", "!less", "!ly",
                        "!ment", "!ish", "!en", "!er", "!est", "!s"):
            if pred_tgt.endswith(suffix):
                return "false_suffix"
        return "spurious_boundary"

    # No boundaries predicted but gold has them
    if is_mono_pred and gold_b:
        return "missed_boundary"

    spurious = pred_b - gold_b
    missed = gold_b - pred_b

    if spurious and missed:
        return "wrong_position"
    elif spurious:
        return "spurious_boundary"
    elif missed:
        return "missed_boundary"

    return "other"


def boundary_prf(pred_tgt, gold_tgt):
    """Compute boundary-level true positives, false positives, false negatives."""
    pred_b = get_boundaries(pred_tgt)
    gold_b = get_boundaries(gold_tgt)
    tp = len(pred_b & gold_b)
    fp = len(pred_b - gold_b)
    fn = len(gold_b - pred_b)
    return tp, fp, fn


def main():
    if len(sys.argv) < 3:
        print("Usage: python score_predictions.py <predictions.tgt> <corpus_gold.tgt>")
        print("       python score_predictions.py predictions.tgt corpus_gold.tgt --errors-only")
        sys.exit(1)

    pred_path = sys.argv[1]
    gold_path = sys.argv[2]
    errors_only = "--errors-only" in sys.argv
    summary_only = "--summary" in sys.argv

    pred = parse_tgt_file(pred_path)
    gold = parse_tgt_file(gold_path)

    # Score every prediction that has a gold entry
    results = []  # (word, gold_tgt, pred_tgt, error_type)
    total_tp, total_fp, total_fn = 0, 0, 0

    for word, pred_tgt in sorted(pred.items()):
        if word not in gold:
            results.append((word, "???", pred_tgt, "no_gold"))
            continue

        gold_tgt = gold[word]
        etype = classify_error(word, pred_tgt, gold_tgt)
        results.append((word, gold_tgt, pred_tgt, etype))

        tp, fp, fn = boundary_prf(pred_tgt, gold_tgt)
        total_tp += tp
        total_fp += fp
        total_fn += fn

    # ── Per-word detail ──────────────────────────────────────────────
    correct = sum(1 for _, _, _, e in results if e == "correct")
    scorable = sum(1 for _, _, _, e in results if e != "no_gold")
    no_gold = sum(1 for _, _, _, e in results if e == "no_gold")

    if not summary_only:
        print("=" * 78)
        print(f"  {'WORD':<22s} {'GOLD':<22s} {'PREDICTED':<22s} RESULT")
        print("=" * 78)

        for word, gold_tgt, pred_tgt, etype in results:
            if errors_only and etype == "correct":
                continue
            marker = "✓" if etype == "correct" else f"✗ {etype}"
            print(f"  {word:<22s} {gold_tgt:<22s} {pred_tgt:<22s} {marker}")

    # ── Error breakdown ──────────────────────────────────────────────
    error_counts = Counter(e for _, _, _, e in results if e not in ("correct", "no_gold"))

    print()
    print("=" * 78)
    print("SUMMARY")
    print("=" * 78)
    print(f"  Predictions scored:  {scorable}")
    print(f"  Correct:             {correct}")
    print(f"  Errors:              {scorable - correct}")
    if no_gold:
        print(f"  No gold (skipped):   {no_gold}")
    print(f"  Word accuracy:       {correct}/{scorable} = {correct/max(scorable,1):.1%}")

    # Boundary-level P/R/F1
    precision = total_tp / max(total_tp + total_fp, 1)
    recall = total_tp / max(total_tp + total_fn, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-9)

    print()
    print(f"  Boundary precision:  {precision:.1%}")
    print(f"  Boundary recall:     {recall:.1%}")
    print(f"  Boundary F1:         {f1:.1%}")

    if error_counts:
        print()
        print("  Error breakdown:")
        for etype, count in error_counts.most_common():
            print(f"    {etype:<22s} {count:>3d}")

    # ── Gold words NOT in predictions (already annotated / left pool) ─
    missing_from_pred = set(gold.keys()) - set(pred.keys())
    if missing_from_pred:
        print()
        print(f"  Gold words not in predictions: {len(missing_from_pred)}")
        print(f"  (These left the pool via annotation or weren't in the corpus)")

    print()


if __name__ == "__main__":
    main()