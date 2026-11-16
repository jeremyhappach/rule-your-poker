# Five Alive vocabulary candidate

Source: English Speller Database (ESDB), https://github.com/en-wl/wordlist,
commit `1e5b7d3a72f47a71da5d28686c1dd4b397178485`. The complete upstream
copyright and licensing notice is in `ESDB-Copyright.txt`.

The broad, server-only guess list was generated using the upstream tool with
`word-list 80 A 1 --wo-poses=abbr`, retaining unique alphabetic five-letter
words, uppercased and sorted. It contains 11,204 entries. Its SHA-256 is
`d888446d693992e3b19c218ed997209d8e3a2053f0d9bd7027d3a6e2de06058d`.
It is a validity list, not a list of proposed answers.

`answers.reviewed.txt` contains 498 individually selected familiar candidate
answers and their initial difficulty tiers. Each is also present in an American
ESDB size-70 extraction. These are initial editorial judgments, not measured
player difficulty. The list is intentionally small rather than padded with
obscure candidates and requires product review before activation. Its SHA-256
is `f6122ac580ff89c0299286c817a1fee26c8690a1eefbd9f9219a4140deec778c`.

The upstream Windows database build reported skipped compound-group warnings;
the output is therefore a candidate that needs reproducibility and vocabulary
qualification before use. Neither artifact is registered for gameplay yet.

## November 13 candidate screen

`dev/five-alive/vocabulary.audit.py` runs against the pinned ESDB checkout. It
selects American spelling at variant level 1, excludes tagged abbreviations,
names, offensive/vulgar usage and several inflected forms, and retains only
lowercase alphabetic five-letter entries that ESDB does not mark `nosuggest`.
The screen found 2,590 words at size 35, 3,379 at size 50, 3,910 at size 60,
and 5,291 at size 70. At size 70, all 498 already-reviewed answers are in the
screen; the other 4,793 remain unreviewed and are not answer-eligible yet.

This is a conservative screen, not a count of every possible familiar English
word. ESDB's tags are incomplete and the deterministic sample still contains
plurals, proper names and obscure or technical words. A person must review
familiarity, ambiguity and spelling, then assign difficulty tiers before any
addition to the answer bank. The approximately 10,000-answer target remains an
open product gap; do not treat the screened count as approved answers or pad
the pool. The existing 498-word bank was not modified by this audit.

## Frequency cross-check — November 13

The additional source is Lingevo's frequency lists derived from the Open
American National Corpus (OANC), built November 1, 2026 from OANC GrAF's
September 2026 release. Source and terms:
https://lingevo.com/resources/ and https://anc.org/data/oanc/. Lingevo offers
its derived lists for unrestricted use and redistribution, including commercial
use, and requests the credits below. The archived source is
https://lingevo.com/resources/oanc/OANC_derived_word_lists_Lingevo.zip, pinned
by SHA-256 `79ac39a8ce2070302b170f114f8ea34193314319fdf6f3f9be8e383b8fae2d15`.

Word lists by Lingevo (lingevo.com). Contains data derived from the Open
American National Corpus (OANC), https://anc.org/data/oanc/.

`dev/five-alive/frequency.audit.py` reproducibly intersects the 5,291-word ESDB
screen with at least 10 written occurrences in at least two OANC genres and at
least five spoken occurrences. That yields 817 candidates: 411 existing bank
words and 406 not currently in the bank. A deterministic sample exposed
`heard`, `parks`, `spent`, and `china`, illustrating inflection, name and
homograph errors even in frequent words. The script then conservatively removes
the source's irregular verb forms, ESDB capitalized homographs, likely regular
plurals, regular `-ed` forms and comparative adjectives. The remainder is 697
candidates, of which 347 are new and 350 already in the bank. This filter is
deliberately over-restrictive: for example it excludes the existing answer
`APPLE` because ESDB also records a capitalized spelling.

Frequency, genres and a small sample do not prove that every remaining item is
an unambiguous, non-sensitive answer or establish its expected solve difficulty.
The reproducible sample includes `NAIVE`, which needs variant review, and
`SLAVE`, which needs sensitivity review. The source itself warns that its
automated labels and small corpus contain errors. The 347 new entries are
therefore evidence-backed candidates, **not qualified answers**; none were added.
The actual qualified bank remains 498 and the roughly 10,000 target is open.

## Individual expansion review — November 15

`answers.expansion.review.csv` stages 255 additional familiar candidates from
the preceding 347-word evidence set. Every entry has an ordinary-English gloss
and an initial editorial difficulty tier. All 255 are unique uppercase
five-letter entries in the pinned ESDB guess bank, have frequency-evidence rows,
and do not overlap the original 498. Sensitive, questionable and obscure
candidates were not promoted merely to increase the count.

These additions are not installed or runtime-qualified. Combining the two
editorial lists yields 753, still 9,247 below a 10,000-word target. The active
version-1 candidate artifact remains 498, itself 9,502 below that target.
The existing immutable version/configuration and pool hash were preserved;
future admission needs a versioned pool change and qualification. Proposed tiers
remain editorial judgments, not measured player difficulty. The source selection
and validation counts are saved in
`qualification.local/five-alive/hosted/vocabulary-expansion-evidence.json`.

## Expansion qualification — November 15, later pass

`dev/five-alive/expansion.qualify.ts` validates each of the 255 additions against
its gloss, tier, unique spelling, pinned guess list and saved frequency counts.
All passed 1530 total solve-position cases, duplicate-letter conservation,
private pre-reveal projections and shared Arcade/Async scoring. A generated
753-word pool was exercised on the isolated project inside a rollback-only
transaction: 251 allocations covered every word exactly once, 251 replays kept
their original answers/cursor, and the frozen-bank trigger rejected edits.

The candidate artifact SHA-256 is
`5ee93d5a1093c90f579b9ae0c5cf1c675e8150314f14683ede07262778f8b231`.
Per-word evidence is in `qualification.local/five-alive/hosted/vocabulary-v2-evidence.json`;
the candidate text and pool proof are beside it. These checks advance candidate
qualification; they do not change the active 498-word version-1 bank or introduce
a version-2 service loader/configuration. The 753-word candidate remains inactive
and 9247 short of 10000. Difficulty tiers remain editorial, not player-measured.

## Version-2 runtime integration — November 15

The preceding inactive-candidate status is superseded. The same verified 753-word
artifact is now `answers.reviewed.v2.txt`, registered as `esdb-five-alive/2` in
the runtime loader and isolated database. The exact SHA-256 remains
`5ee93d5a1093c90f579b9ae0c5cf1c675e8150314f14683ede07262778f8b231`.
No extra words or tier edits occurred. `answers.expansion.review.csv` retains
the 255 meanings/tiers, and `answers.v2.qualification.json` preserves their
pre-integration source and qualification evidence. The original version-1 bank
and its hash remain supported for frozen games.

New configuration `five-alive/2` uses the new pool with the unchanged shared
gameplay rule version `five-alive/1`. Both modes remain withheld. Two complete
753-word cycles and 503 replays passed against the installed isolated pool.
At three answers per game, each fresh global cycle covers 251 games; reuse starts
at game 252. This is per pool version/cycle, not a per-player, rolling-window or
cross-version guarantee. The approximately 10000-answer target remains unchanged,
with an exact remaining gap of 9247. Production was untouched.

## Version-3 reviewed batch — November 15

The current runtime artifact is `answers.reviewed.v3.txt`: **1,021 answers**,
SHA-256 `56b3054ae90f96d725c542c19d4803ebfe3b07be6517aba1f0ecf18b866b38ed`.
It preserves all 753 prior words and tiers and adds exactly 268 records from
`answers.batch3.review.csv`. Meanings and tiers were individually reviewed;
tiers remain initial editorial judgments, not player calibration. No prior
review records or artifacts were rewritten.

`dev/five-alive/batch3-source.mjs` uses the same pinned ESDB checkout and existing
Lingevo/OANC archive. It selects lowercase base lemmas with neutral usage/rank,
American or neutral spelling at variant <=1, size <=50, and no category/region/tag
restriction outside US/neutral. Each addition is in the pinned legal-guess bank.
The screen is only a source of review candidates, not an automatic approval.
The chosen ordinary meanings avoid obscure vocabulary and sensitive senses.

Unlike the earlier frequency-filtered batch, this batch is not limited to words
occurring in both small corpus samples. All observed written/spoken counts are
saved; 61 chosen everyday words have zero in both samples. Those absences are
explicit, and frequency is not claimed to establish their familiarity. The
individual editorial meanings and neutral source entries support this batch.
All source metadata, counts, meanings, tiers and qualification results are
preserved in `answers.v3.qualification.json`.

All 268 entries passed 1,608 solve-position cases and the vocabulary-specific
duplicate-letter, private-projection and shared-scoring checks. Before runtime
integration, the actual isolated allocator completed two full cycles, including
boundaries inside a three-word game. The installed-pool proof and idempotent
migration replay passed with 681 allocations and 682 exact replays; all synthetic
allocations rolled back. Three vocabulary integrity/preservation tests passed.

Version 3 supports 340 complete games before reuse begins in game 341, under the
unchanged global per-version cycle rule. This does not establish a per-player,
rolling-window or cross-version guarantee. All admission remains closed.
The approximately 10,000 target is unchanged: **8,979 answers remain missing**.
Production was neither queried nor changed.
