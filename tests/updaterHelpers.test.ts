import { describe, it, expect } from 'vitest';
import {
  ASSET_NAME,
  findVsixAsset,
  getLocalVersion,
  isNewerVersion,
} from '../src/updaterHelpers';

describe('isNewerVersion', () => {
  it('returns true when remote is newer', () => {
    expect(isNewerVersion('v0.2.0', '0.1.0')).toBe(true);
    expect(isNewerVersion('1.2.0', '1.1.9')).toBe(true);
  });

  it('returns false when remote is older or equal', () => {
    expect(isNewerVersion('v0.1.0', '0.2.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
  });

  it('returns false for invalid versions', () => {
    expect(isNewerVersion('not-a-version', '0.1.0')).toBe(false);
    expect(isNewerVersion('v1.0.0', 'bad')).toBe(false);
  });
});

describe('findVsixAsset', () => {
  it('prefers the fixed asset name', () => {
    const assets = [
      { name: 'source.zip', browser_download_url: 'https://example.com/source.zip' },
      { name: ASSET_NAME, browser_download_url: 'https://example.com/fv-ldf-explorer.vsix' },
    ];
    expect(findVsixAsset(assets)?.name).toBe(ASSET_NAME);
  });

  it('falls back to any .vsix asset', () => {
    const assets = [
      { name: 'source.zip', browser_download_url: 'https://example.com/source.zip' },
      { name: 'other.vsix', browser_download_url: 'https://example.com/other.vsix' },
    ];
    expect(findVsixAsset(assets)?.name).toBe('other.vsix');
  });

  it('returns undefined when no vsix exists', () => {
    expect(
      findVsixAsset([{ name: 'source.zip', browser_download_url: 'https://example.com/source.zip' }])
    ).toBeUndefined();
  });
});

describe('getLocalVersion', () => {
  it('reads version from package.json', () => {
    const version = getLocalVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
