import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SHELL_OVERLAY_Z } from '@/lib/canonicalShell/ShellOverlayMounts';
import { SHELL_Z } from '@/lib/canonicalShell/zLayers';

const source = readFileSync(join(__dirname, 'DealerGameSetup.tsx'), 'utf8');

describe('DealerGameSetup canonical modal layering', () => {
  it('places every setup surface above the high-card reveal layer', () => {
    expect(SHELL_Z.MODAL_OVERLAY).toBeGreaterThan(SHELL_OVERLAY_Z.slot);
    expect(source.match(/style=\{\{ zIndex: SHELL_Z\.MODAL_OVERLAY \}\}/g)).toHaveLength(4);
  });

  it('does not regress to the transport-adjacent Tailwind z-50 band', () => {
    expect(source).not.toContain('z-50');
  });
});
