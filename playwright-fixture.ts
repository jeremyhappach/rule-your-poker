// Keep one project-local import point for browser specs. The previous Lovable
// fixture package disappeared during cutover; Playwright itself is the owner.
export { test, expect } from '@playwright/test';
