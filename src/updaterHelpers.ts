import * as semver from 'semver';

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface GitHubRelease {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
}

export const ASSET_NAME = 'fv-ldf-explorer.vsix';

export function getLocalVersion(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../package.json').version as string;
}

export function isNewerVersion(remote: string, local: string): boolean {
  const remoteClean = remote.replace(/^v/, '');
  const localClean = local.replace(/^v/, '');
  const remoteSemver = semver.valid(remoteClean);
  const localSemver = semver.valid(localClean);
  if (!remoteSemver || !localSemver) {
    return false;
  }
  return semver.gt(remoteSemver, localSemver);
}

export function findVsixAsset(assets: ReleaseAsset[]): ReleaseAsset | undefined {
  return assets.find((a) => a.name === ASSET_NAME) ?? assets.find((a) => a.name.endsWith('.vsix'));
}
