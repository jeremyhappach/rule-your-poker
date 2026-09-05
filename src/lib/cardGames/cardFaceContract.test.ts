import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), 'src');
function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? tsxFiles(path) : path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : [];
  });
}
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('cross-game card face contract', () => {
  it('requires review of any new direct rank/suit renderer', () => {
    const owners = new Set<string>();
    for (const path of tsxFiles(root)) {
      const content = readFileSync(path, 'utf8');
      if (!/\{\s*[\w?.]+\.(?:rank|suit)\s*\}/.test(content)) continue;
      const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node: ts.Node) {
        if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent) && node.expression
          && ts.isPropertyAccessExpression(node.expression)
          && ['rank', 'suit'].includes(node.expression.name.text)) {
          owners.add(relative(root, path).split('\\').join('/'));
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect([...owners].sort()).toEqual([
      'components/HolmLonePlayerFan.tsx',
      'components/PlayingCard.tsx',
      'components/hand-history/MiniPlayingCard.tsx',
      'lib/canonicalShell/cardTransport/CardTransportRuntime.tsx',
      // Developer-only evaluators create/parse valid cards locally.
      'pages/HandEvalDebug.tsx',
      'pages/HandEvalTest.tsx',
    ]);
  }, 15_000);

  it('keeps alternate face surfaces and deal adapters behind resolution checks', () => {
    expect(read('components/HolmLonePlayerFan.tsx')).toContain('if (!isCardFaceResolved(card)) return');
    expect(read('lib/canonicalShell/cardTransport/CardTransportRuntime.tsx')).toContain("card.intent.face === 'hidden' || !isCardFaceResolved(card.intent.visibleFace)");
    for (const game of ['Holm', 'GinRummy', 'Cribbage', 'ThreeFiveSeven']) {
      expect(read(`components/${game}DealOrchestrator.tsx`)).toContain('resolveTransportCardFace(');
    }
    const table = read('components/MobileGameTable.tsx');
    expect(table).toContain('const resolvedCommunityCards = useHolmCommunityFaces(');
    expect(table).toContain('communityCardsForRender: CardType[] | null = resolvedCommunityCards');
    for (const component of ['MobileCardsTab', 'KnockDisplay', 'FeltContent', 'DiscardAnimation', 'SelfDrawAnimation', 'OpponentDrawAnimation']) {
      expect(read(`components/GinRummy${component}.tsx`)).toContain('...card,');
    }
  });
});
