import fs from 'fs';
import path from 'path';

export interface CopilotProgress {
  current: number;
  total: number;
}

export type CopilotRunStatus = 'idle' | 'running' | 'success' | 'error';

export interface CopilotStatus {
  running: boolean;
  status: CopilotRunStatus;
  stages: string[];
  currentStage: string | null;
  progress: CopilotProgress | null;
  logs: string[];
}

const STATUS_FILE = path.join('/tmp', 'copilot-status.json');

const defaultStatus: CopilotStatus = {
  running: false,
  status: 'idle',
  stages: [],
  currentStage: null,
  progress: null,
  logs: []
};

export function getCopilotStatus(): CopilotStatus {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      const data = fs.readFileSync(STATUS_FILE, 'utf8');
      return { ...defaultStatus, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Error reading copilot status file:', err);
  }
  return defaultStatus;
}

export function setCopilotStatus(status: Partial<CopilotStatus>) {
  try {
    const current = getCopilotStatus();
    const updated = { ...current, ...status };
    // Limit logs length to avoid massive files
    if (updated.logs && updated.logs.length > 500) {
      updated.logs = updated.logs.slice(updated.logs.length - 500);
    }
    fs.writeFileSync(STATUS_FILE, JSON.stringify(updated, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing copilot status file:', err);
  }
}

export function resetCopilotStatus() {
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(defaultStatus, null, 2), 'utf8');
  } catch (err) {
    console.error('Error resetting copilot status:', err);
  }
}
