export interface DriveBackupStatus {
  enabled: boolean;
  lastBackupTime: string | null;
  lastFileName: string | null;
  lastError: string | null;
}

export function getDriveBackupStatus(): DriveBackupStatus {
  return {
    enabled: localStorage.getItem('wealthshare_drive_auto_backup') === 'true',
    lastBackupTime: localStorage.getItem('wealthshare_drive_last_backup_time'),
    lastFileName: localStorage.getItem('wealthshare_drive_last_file_name'),
    lastError: localStorage.getItem('wealthshare_drive_last_error'),
  };
}

export function setDriveAutoBackupEnabled(enabled: boolean) {
  localStorage.setItem('wealthshare_drive_auto_backup', enabled ? 'true' : 'false');
  if (!enabled) {
    localStorage.removeItem('wealthshare_drive_last_error');
  }
}

export function getGoogleDriveAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).substring(2);

    const timeout = setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      reject(new Error('Google OAuth prompt timed out or popup was blocked. Please allow popups or click "Open in New Tab" at the top right of the preview window, then try again.'));
    }, 15000);

    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'OAUTH_TOKEN_RESPONSE' && event.data?.requestId === requestId) {
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data.accessToken);
        }
      }
    }

    window.addEventListener('message', handleMessage);
    window.parent.postMessage({
      type: 'OAUTH_TOKEN_REQUEST',
      requestId,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    }, '*');
  });
}

export async function uploadBackupToGoogleDrive(jsonData: string, customFileName?: string): Promise<{ id: string; name: string }> {
  try {
    const accessToken = await getGoogleDriveAccessToken();
    const fileName = customFileName || `wealthshare_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

    const metadata = {
      name: fileName,
      mimeType: 'application/json',
      description: 'WealthShare Automatic Database Backup',
    };

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      jsonData +
      close_delim;

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body: multipartRequestBody,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Drive upload failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const nowISO = new Date().toLocaleString();

    localStorage.setItem('wealthshare_drive_last_backup_time', nowISO);
    localStorage.setItem('wealthshare_drive_last_file_name', fileName);
    localStorage.removeItem('wealthshare_drive_last_error');

    return { id: data.id, name: fileName };
  } catch (err: any) {
    const errorMsg = err.message || 'Failed to upload backup to Google Drive';
    localStorage.setItem('wealthshare_drive_last_error', errorMsg);
    throw err;
  }
}

export async function triggerAutoDriveBackup(exportDataFn: () => string): Promise<boolean> {
  const status = getDriveBackupStatus();
  if (!status.enabled) return false;

  try {
    const jsonData = exportDataFn();
    await uploadBackupToGoogleDrive(jsonData);
    console.info('Auto Google Drive backup succeeded');
    return true;
  } catch (err) {
    console.warn('Auto Google Drive backup failed:', err);
    return false;
  }
}

