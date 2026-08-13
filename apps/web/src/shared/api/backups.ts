import { apiError } from './client';

function fileName(response: Response): string {
  const disposition = response.headers.get('content-disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/iu.exec(disposition)?.[1];
  const plain = /filename="?([^";]+)"?/iu.exec(disposition)?.[1];
  const candidate = encoded === undefined ? plain : decodeURIComponent(encoded);
  return candidate?.endsWith('.pwbk') ? candidate : 'personal-workbench.pwbk';
}

export async function downloadBackup(): Promise<void> {
  const response = await fetch('/api/v1/data/backups', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/octet-stream',
      'Content-Type': 'application/json',
      'X-Workbench-Request': '1',
    },
    body: '{}',
  });
  if (!response.ok) throw await apiError(response);
  const url = URL.createObjectURL(await response.blob());
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName(response);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
