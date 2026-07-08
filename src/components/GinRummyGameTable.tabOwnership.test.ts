import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Contract tests for the "one mobile activeTab source of truth" repair.
 *
 * These tests are deliberately source-level: mounting GinRummyGameTable
 * in jsdom requires the entire Supabase/realtime stack. What we must
 * lock down here is the API contract and wiring — that the shell
 * (Game.tsx) owns activeTab + chatInputValue, that GinRummyGameTable
 * accepts those props, and that its internal state cannot re-seed
 * 'cards' from persistence when the shell is controlling.
 */

const ROOT = join(__dirname, '..', '..');
const ginSrc = readFileSync(
  join(ROOT, 'src/components/GinRummyGameTable.tsx'),
  'utf8',
);
const gameSrc = readFileSync(join(ROOT, 'src/pages/Game.tsx'), 'utf8');
const chatPanelSrc = readFileSync(
  join(ROOT, 'src/components/MobileChatPanel.tsx'),
  'utf8',
);

describe('Gin activeTab / chat draft ownership contract', () => {
  it('1. Gin table accepts controlled activeTab + onActiveTabChange from the shell', () => {
    expect(ginSrc).toMatch(/activeTab\?:\s*'cards'\s*\|\s*'chat'\s*\|\s*'lobby'\s*\|\s*'history'/);
    expect(ginSrc).toMatch(/onActiveTabChange\?:/);
    expect(ginSrc).toMatch(/activeTab:\s*externalActiveTab/);
    expect(ginSrc).toMatch(/const\s+isTabControlled\s*=\s*externalActiveTab\s*!==\s*undefined/);
  });

  it('2. When controlled, setActiveTab routes through the shell setter (no local re-seed)', () => {
    expect(ginSrc).toMatch(/if\s*\(\s*isTabControlled\s*\)\s*{\s*onActiveTabChange\?\.\(\s*next\s*\)\s*;\s*}\s*else\s*{\s*setActiveTabRaw\(\s*next\s*\)\s*;\s*}/s);
  });

  it('3. Persistence hydrates ONLY the fallback initial state — never overrides live shell selection', () => {
    // readPersistedMatchChatTab must only be reached when externalActiveTab is absent.
    const initializer = ginSrc.match(
      /useState<'cards' \| 'chat' \| 'lobby' \| 'history'>\(\s*\(\)\s*=>\s*\([^)]*externalActiveTab[^)]*readPersistedMatchChatTab[^)]*\)\s*\)/s,
    );
    expect(initializer).not.toBeNull();
  });

  it('4. Chat draft compose value is controlled from the shell (survives table remount)', () => {
    expect(ginSrc).toMatch(/chatInputValue\?:\s*string/);
    expect(ginSrc).toMatch(/onChatInputChange\?:\s*\(value:\s*string\)\s*=>\s*void/);
    // MobileChatPanel invocation inside Gin table forwards both.
    expect(ginSrc).toMatch(/<MobileChatPanel[\s\S]*?chatInputValue=\{chatInputValue\}[\s\S]*?onChatInputChange=\{onChatInputChange\}/);
  });

  it('5. MobileChatPanel uses controlled chatInputValue when provided; local state is fallback only', () => {
    // Ensures the panel does not shadow the shell draft with its own state.
    expect(chatPanelSrc).toMatch(/const\s+inputMessage\s*=\s*chatInputValue\s*\?\?\s*internalInputMessage/);
    expect(chatPanelSrc).toMatch(/const\s+setInputMessage\s*=\s*onChatInputChange\s*\?\?\s*setInternalInputMessage/);
    // Successful send clears the draft.
    expect(chatPanelSrc).toMatch(/setInputMessage\(''\)/);
  });

  it('6. Game.tsx passes the canonical mobileActiveTab + mobileChatInput to GinRummyGameTable', () => {
    // Find the GinRummyGameTable JSX block and verify all four canonical
    // props are wired. Any regression that drops these props re-introduces
    // the split ownership defect.
    const ginBlock = gameSrc.match(/<GinRummyGameTable[\s\S]*?\/>/);
    expect(ginBlock).not.toBeNull();
    const block = ginBlock![0];
    expect(block).toMatch(/activeTab=\{mobileActiveTab\}/);
    expect(block).toMatch(/onActiveTabChange=\{setMobileActiveTab\}/);
    expect(block).toMatch(/chatInputValue=\{mobileChatInput\}/);
    expect(block).toMatch(/onChatInputChange=\{setMobileChatInput\}/);
  });

  it('7. Regression: Gin table no longer force-seeds cards independent of the shell', () => {
    // The old bug: unconditional `readPersistedMatchChatTab(gameId, 'cards')`
    // as the useState initializer. New code must ternary on externalActiveTab.
    const badPattern = /useState<'cards' \| 'chat' \| 'lobby' \| 'history'>\(\s*\(\)\s*=>\s*readPersistedMatchChatTab\(/;
    expect(ginSrc).not.toMatch(badPattern);
  });
});
