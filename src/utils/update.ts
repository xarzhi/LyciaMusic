const VERSION_PATTERN = /\d+(?:\.\d+)+/;

export interface ReleaseInfo {
  version: string;
  url: string;
  publishedAt?: string;
  notes?: string;
}

export function extractVersion(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(VERSION_PATTERN);
  return match ? match[0] : trimmed.replace(/^[vV]/, '');
}

export function compareVersions(left: string, right: string): number {
  const leftParts = extractVersion(left).split('.').map(part => Number.parseInt(part, 10) || 0);
  const rightParts = extractVersion(right).split('.').map(part => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

export async function fetchLatestRelease(owner: string, repo: string): Promise<ReleaseInfo> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }

  const payload = await response.json();
  const versionSource = typeof payload.tag_name === 'string' ? payload.tag_name : payload.name;
  const version = typeof versionSource === 'string' ? extractVersion(versionSource) : '';

  if (!version) {
    throw new Error('Latest release version is missing');
  }

  return {
    version,
    url: typeof payload.html_url === 'string' ? payload.html_url : `https://github.com/${owner}/${repo}/releases`,
    publishedAt: typeof payload.published_at === 'string' ? payload.published_at : undefined,
    notes: typeof payload.body === 'string' ? payload.body : undefined
  };
}
