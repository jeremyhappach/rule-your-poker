"""Audit ESDB candidates against a pinned, openly licensed OANC derivative.

This reports candidates for review; it does not alter the answer bank.
"""
import csv
import ast
import hashlib
import io
import pathlib
import re
import subprocess
import sys
import zipfile

esdb = pathlib.Path(sys.argv[1]).resolve()
archive = pathlib.Path(sys.argv[2]).resolve()
expected = '79ac39a8ce2070302b170f114f8ea34193314319fdf6f3f9be8e383b8fae2d15'
actual = hashlib.sha256(archive.read_bytes()).hexdigest()
if actual != expected:
    raise SystemExit('OANC-derived archive checksum mismatch')
revision = subprocess.check_output(['git', '-C', str(esdb), 'rev-parse', 'HEAD'], text=True).strip()
if revision != '1e5b7d3a72f47a71da5d28686c1dd4b397178485':
    raise SystemExit('ESDB revision mismatch')
args = [sys.executable, '-X', 'utf8', 'scowl', '--db', str(esdb / 'scowl.db'), 'word-list', '70', 'A', '1',
        '--wo-poses=abbr,ns,nsp,nss,nssp,vs,vs2,vs3,vss,vd,vds,vg,vn,aj1,aj2,av1,av2,a1,a2',
        '--wo-tags=[name],[town],[upper],[lcacr],[ucacr]',
        '--wo-usage-notes=offensive-1,offensive-2,vulgar-1,vulgar-2,vulgar-3', '--nosuggest']
output = subprocess.run(args, cwd=esdb, capture_output=True, text=True, encoding='utf8', check=True).stdout
esdb_words = {word for word in output.splitlines() if re.fullmatch('[a-z]{5}', word)}
with zipfile.ZipFile(archive) as data:
    def rows(name):
        raw = data.read('OANC_derived_word_lists/' + name).decode('utf-8-sig')
        return list(csv.DictReader(io.StringIO(raw, newline='')))
    written, spoken = rows('oanc_wordfreq_written.csv'), rows('oanc_wordfreq_spoken.csv')
    builder = ast.parse(data.read('OANC_derived_word_lists/build_oanc.py').decode('utf8'))
    irregular_text = next(ast.literal_eval(node.value) for node in builder.body if isinstance(node, ast.Assign)
                          and any(isinstance(target, ast.Name) and target.id == 'IRREGULAR_TXT' for target in node.targets))
irregular_forms = set()
for chunk in irregular_text.replace('\n', '').split('|'):
    if ':' in chunk:
        base, forms = chunk.split(':', 1)
        irregular_forms.update(form.strip() for form in forms.split(',') if form.strip() != base.strip())
name_args = [sys.executable, '-X', 'utf8', 'scowl', '--db', str(esdb / 'scowl.db'), 'word-list', '70', 'A', '1']
name_output = subprocess.run(name_args, cwd=esdb, capture_output=True, text=True, encoding='utf8', check=True).stdout
capitalized = {word.lower() for word in name_output.splitlines() if re.fullmatch('[A-Z][a-z]{4}', word)}
lemmas = {row['lemma'] for row in written}
adjectives = {row['lemma'] for row in written if row['pos'] == 'ADJ'}
counts = {}
genres = ('n_magazine', 'n_academic', 'n_travel', 'n_government', 'n_fiction', 'n_letters')
for row in written:
    word = row['lemma']
    if word not in esdb_words or row['pos'] not in ('NOUN', 'VERB', 'ADJ', 'ADV'):
        continue
    item = counts.setdefault(word, {'count': 0, 'genres': set()})
    item['count'] += int(row['count'])
    item['genres'].update(genre for genre in genres if int(row[genre]) > 0)
speech = {row['word']: int(row['count']) for row in spoken if row['word'] in esdb_words}
bank = {line.split()[0].lower() for line in pathlib.Path('server/fiveAlive/answers.reviewed.txt').read_text(encoding='utf8').splitlines() if line and not line.startswith('#')}
print('ESDB revision:', revision)
print('Lingevo OANC archive SHA-256:', actual)
print('ESDB screened:', len(esdb_words))
selected = set()
for min_written, min_genres, min_spoken in ((10, 2, 5), (20, 3, 5), (50, 3, 10)):
    screened = {word for word, value in counts.items() if value['count'] >= min_written and len(value['genres']) >= min_genres and speech.get(word, 0) >= min_spoken}
    pending = screened - bank
    print(f'written >= {min_written}, genres >= {min_genres}, spoken >= {min_spoken}: {len(screened)} candidates; {len(screened & bank)} in current bank; {len(pending)} new')
    sample = sorted(pending, key=lambda word: hashlib.sha256(word.encode()).digest())[:60]
    print('deterministic sample:', ' '.join(sample))
    if (min_written, min_genres, min_spoken) == (10, 2, 5):
        selected = screened
for word in ('apple', 'heard', 'parks', 'spent', 'jesus', 'paris', 'china', 'naive', 'zzzzz'):
    evidence = counts.get(word, {'count': 0, 'genres': set()})
    print(f'edge {word}: esdb={word in esdb_words}, written={evidence["count"]}, '
          f'genres={len(evidence["genres"])}, spoken={speech.get(word, 0)}, selected={word in selected}')
print('Not automatically approved: POS/word-sense, proper names, inflections, offensive uses and fairness need a separate quality audit.')
filtered = {word for word in selected if word not in irregular_forms and word not in capitalized
            and not (word.endswith('s') and word[:-1] in lemmas)
            and not (word.endswith('ed') and (word[:-2] in lemmas or word[:-1] in lemmas))
            and not (word.endswith('er') and word[:-2] in adjectives)}
print('Further conservative exclusions: OANC irregular-verb forms, ESDB capitalized homographs,')
print('final-s forms with a known singular lemma, regular -ed forms and adjective comparatives.')
print(f'conservative pool: {len(filtered)} candidates; {len(filtered & bank)} current; {len(filtered - bank)} new')
print('deterministic new-word sample:', ' '.join(sorted(filtered - bank, key=lambda word: hashlib.sha256(word.encode()).digest())[:80]))
for word in ('heard', 'parks', 'spent', 'china', 'apple', 'class', 'naive', 'mixed', 'noted', 'dryer'):
    print(f'edge exclusion {word}: irregular={word in irregular_forms}, capitalized={word in capitalized}, '
          f'singular-s={word.endswith("s") and word[:-1] in lemmas}, remains={word in filtered}')
if len(sys.argv) > 3:
    output_path = pathlib.Path(sys.argv[3])
    with output_path.open('w', newline='', encoding='utf8') as output_file:
        writer = csv.writer(output_file)
        writer.writerow(('word', 'written_count', 'genres', 'spoken_count', 'existing_answer'))
        for word in sorted(filtered):
            writer.writerow((word, counts[word]['count'], len(counts[word]['genres']), speech.get(word, 0), word in bank))
    print('wrote auditable frequency evidence, not an answer bank:', output_path)
