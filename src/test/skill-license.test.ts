import { describe, it, expect } from 'vitest';
import { openLicense } from '@/lib/free-skills';

describe('free skill licenses', () => {
  it('accepts Creative Commons Attribution-ShareAlike 4.0', () => {
    expect(openLicense('Creative Commons Corporation ... Attribution-ShareAlike 4.0 International Public License')).toBe('CC-BY-SA-4.0');
  });
  it('rejects non-commercial Creative Commons terms', () => {
    expect(openLicense('Creative Commons Attribution-NonCommercial 4.0 International')).toBeNull();
  });
});
