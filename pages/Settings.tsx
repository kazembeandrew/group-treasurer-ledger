
import React, { useRef, useState, useEffect } from 'react';
import { useStore } from '../store';
import { 
  Download, 
  Upload, 
  Trash2, 
  AlertTriangle,
  Save,
  Cloud,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
  HardDrive,
  RefreshCw
} from 'lucide-react';
import { 
  getDriveBackupStatus, 
  setDriveAutoBackupEnabled, 
  uploadBackupToGoogleDrive, 
  DriveBackupStatus 
} from '../utils/googleDrive';

export const Settings: React.FC = () => {
  const { exportData, importData, resetData, isCloudMode, logBackup, transactions, members, accounts, addNotification } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [driveStatus, setDriveStatus] = useState<DriveBackupStatus>(getDriveBackupStatus());
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);

  useEffect(() => {
    setDriveStatus(getDriveBackupStatus());
  }, []);

  const handleToggleDriveAutoBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked;
    setDriveAutoBackupEnabled(enabled);
    setDriveStatus(getDriveBackupStatus());
    if (enabled) {
      addNotification('Google Drive Auto-Backup enabled', 'info');
      // Trigger immediate backup on enable
      handleDriveBackupNow();
    } else {
      addNotification('Google Drive Auto-Backup disabled', 'info');
    }
  };

  const handleDriveBackupNow = async () => {
    setIsUploadingToDrive(true);
    try {
      const dataStr = exportData();
      const result = await uploadBackupToGoogleDrive(dataStr);
      logBackup();
      addNotification(`Backup uploaded to Google Drive: ${result.name}`, 'info');
    } catch (err: any) {
      console.error('Google Drive backup error:', err);
      addNotification(err.message || 'Failed to upload backup to Google Drive', 'error');
    } finally {
      setIsUploadingToDrive(false);
      setDriveStatus(getDriveBackupStatus());
    }
  };

  const handleExportJSON = () => {
    const dataStr = exportData();
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const fileName = `wealthshare_backup_${new Date().toISOString().split('T')[0]}.json`;
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = fileName;
    link.click();
    logBackup();
  };

  const handleExportCSV = () => {
    // Generate simple CSV for Excel
    const header = ['Date', 'Transaction ID', 'Member', 'Account', 'Type', 'Fund', 'Amount', 'Notes', 'Created At'];
    const rows = transactions.map(t => [
        t.date,
        t.id,
        members.find(m => m.id === t.memberId)?.name || 'System',
        accounts.find(a => a.id === t.accountId)?.account_name || 'Unknown',
        t.transaction_type,
        t.fund_type,
        t.amount,
        `"${t.notes || ''}"`, // Quote notes to handle commas
        t.created_at || ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
        + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `wealthshare_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    logBackup();
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target?.result) {
        const success = await importData(event.target.result as string);
        if (success && fileInputRef.current) fileInputRef.current.value = ''; 
      }
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    if (window.confirm('Are you absolutely sure? This will delete ALL data locally and on the cloud.')) {
        resetData();
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500">Manage your data and system preferences</p>
      </div>

      {/* Cloud Connection Card */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-200">
           <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${isCloudMode ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                <Cloud size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Cloud Connection</h3>
                <p className="text-sm text-slate-500">Sync status with Supabase.</p>
              </div>
            </div>
            {isCloudMode ? (
              <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex items-center">
                <CheckCircle size={14} className="mr-1" /> Connected
              </span>
            ) : (
              <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-xs font-bold flex items-center">
                <AlertCircle size={14} className="mr-1" /> Offline
              </span>
            )}
           </div>
           
           <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-500">
             <p>Keys are configured directly in the application code.</p>
             {!isCloudMode && (
                <p className="mt-1 text-amber-600 font-medium">
                  Warning: Currently running in Offline Mode. Ensure keys are pasted correctly in <code>supabaseClient.ts</code>.
                </p>
             )}
           </div>
        </div>
      </div>

      {/* Google Drive Auto Backup Card */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                <HardDrive size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Google Drive Auto-Backup</h3>
                <p className="text-sm text-slate-500">Automatically save system data backups to your Google Drive.</p>
              </div>
            </div>
            
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={driveStatus.enabled} 
                onChange={handleToggleDriveAutoBackup} 
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div className="mt-4 p-4 bg-slate-50 rounded-lg text-xs space-y-2">
            <div className="flex justify-between items-center text-slate-600">
              <span>Status:</span>
              <span className={`font-bold ${driveStatus.enabled ? 'text-emerald-600' : 'text-slate-500'}`}>
                {driveStatus.enabled ? 'Enabled (Auto-Sync)' : 'Disabled'}
              </span>
            </div>
            {driveStatus.lastBackupTime && (
              <div className="flex justify-between items-center text-slate-600">
                <span>Last Google Drive Backup:</span>
                <span className="font-medium text-slate-800">{driveStatus.lastBackupTime}</span>
              </div>
            )}
            {driveStatus.lastFileName && (
              <div className="flex justify-between items-center text-slate-600">
                <span>File Name:</span>
                <span className="font-mono text-slate-700">{driveStatus.lastFileName}</span>
              </div>
            )}
            {driveStatus.lastError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 space-y-1">
                <p className="font-bold flex items-center"><AlertTriangle size={14} className="mr-1" /> Backup Error</p>
                <p>{driveStatus.lastError}</p>
                <div className="mt-2 text-[11px] text-red-800 bg-red-100/60 p-2 rounded">
                  <span className="font-semibold">How to fix popup/timeout issues:</span>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    <li>Allow popups in your browser address bar if prompted.</li>
                    <li>If using the embedded frame, click <strong>"Open in new tab"</strong> at the top right of AI Studio.</li>
                    <li>You can also download a local JSON backup anytime using the button below.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4">
            <button
              onClick={handleDriveBackupNow}
              disabled={isUploadingToDrive}
              className="w-full flex items-center justify-center space-x-2 bg-slate-900 text-white px-4 py-2.5 rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={18} className={isUploadingToDrive ? 'animate-spin' : ''} />
              <span>{isUploadingToDrive ? 'Backing up to Google Drive...' : 'Backup to Google Drive Now'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <Save size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Data Backup & Export</h3>
              <p className="text-sm text-slate-500">Save your records externally.</p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <button onClick={handleExportJSON} className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 font-medium flex-1">
              <Download size={18} />
              <span>Backup File (JSON)</span>
            </button>
            <button onClick={handleExportCSV} className="flex items-center justify-center space-x-2 bg-emerald-600 text-white px-4 py-3 rounded-lg hover:bg-emerald-700 font-medium flex-1">
              <FileSpreadsheet size={18} />
              <span>Export to Excel (CSV)</span>
            </button>
          </div>
        </div>

        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-3 mb-4">
             <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
              <Upload size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Restore Data</h3>
              <p className="text-sm text-slate-500">Restore from a previously exported JSON backup file.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="application/json" className="hidden" />
            <button onClick={handleImportClick} className="flex items-center justify-center space-x-2 bg-white border border-slate-300 text-slate-700 px-4 py-3 rounded-lg hover:bg-slate-100 font-medium flex-1">
              <Upload size={18} />
              <span>Import Backup File</span>
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center space-x-3 mb-4 text-red-600">
             <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold">Danger Zone</h3>
            </div>
          </div>
          <button onClick={handleReset} className="flex items-center justify-center space-x-2 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg hover:bg-red-100 font-medium w-full sm:w-auto">
            <Trash2 size={18} />
            <span>Delete All Data & Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
};
