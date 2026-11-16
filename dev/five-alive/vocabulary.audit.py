"""Report ESDB candidate bounds; only human-reviewed, tiered words are eligible."""
import hashlib
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(sys.argv[1])
db = root / 'scowl.db'
approved_path = pathlib.Path('server/fiveAlive/answers.reviewed.txt')
approved = {line.split()[0] for line in approved_path.read_text(encoding='utf-8').splitlines() if line and not line.startswith('#')}
revision = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
if revision != '1e5b7d3a72f47a71da5d28686c1dd4b397178485':
    raise SystemExit('ESDB revision does not match the pinned source')
print('source revision:', revision)
print('approved, manually reviewed and tiered:', len(approved))
print('approved SHA-256:', hashlib.sha256(approved_path.read_bytes()).hexdigest())
for size in (35, 50, 60, 70):
    args = [sys.executable, '-X', 'utf8', 'scowl', '--db', str(db), 'word-list', str(size), 'A', '1',
            '--wo-poses=abbr,ns,nsp,nss,nssp,vs,vs2,vs3,vss,vd,vds,vg,vn,aj1,aj2,av1,av2,a1,a2',
            '--wo-tags=[name],[town],[upper],[lcacr],[ucacr]',
            '--wo-usage-notes=offensive-1,offensive-2,vulgar-1,vulgar-2,vulgar-3', '--nosuggest']
    result = subprocess.run(args, cwd=root, capture_output=True, text=True, encoding='utf-8', check=True)
    # A capital, punctuation, or the ESDB nosuggest suffix disqualifies this spelling.
    screened = {word.upper() for word in result.stdout.splitlines() if re.fullmatch('[a-z]{5}', word)}
    print(f'size <= {size}: {len(screened)} automatically screened candidates; '
          f'{len(screened & approved)} already reviewed; {len(screened - approved)} still require review')
    if size == 70:
        sample = sorted(screened - approved, key=lambda word: hashlib.sha256(word.encode()).digest())[:80]
        print('unreviewed deterministic sample:', ' '.join(sample))
print('Screened candidates are not automatically eligible: obscurity, ambiguity, offensive usage,')
print('US spelling, and difficulty tiers require individual review. No pool entries were added.')
