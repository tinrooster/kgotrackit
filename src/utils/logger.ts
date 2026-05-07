import { toast } from 'sonner';

export interface Logger {
  log: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  downloadLogs: (filenameOverride?: string) => Promise<void>;
}

class FileLogger implements Logger {
  private logs: string[] = [];
  private context: string = '';

  setContext(context: string) {
    this.context = context;
    this.log(`Context set to: ${context}`);
  }

  log(message: string) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${this.context ? `[${this.context}] ` : ''}${message}`;
    this.logs.push(logEntry);
    console.log(message);
  }

  error(message: string) {
    const timestamp = new Date().toISOString();
    const errorMessage = message;
    this.logs.push(`[${timestamp}] ERROR: ${errorMessage}`);
    console.error(errorMessage);
  }

  info(message: string) {
    const timestamp = new Date().toISOString();
    this.logs.push(`[${timestamp}] INFO: ${message}`);
    console.info(message);
  }

  warn(message: string) {
    const timestamp = new Date().toISOString();
    this.logs.push(`[${timestamp}] WARN: ${message}`);
    console.warn(message);
  }

  async downloadLogs(filenameOverride?: string): Promise<void> {
    try {
      let filename: string;
      if (filenameOverride) {
        filename = filenameOverride;
      } else {
        const date = new Date().toISOString().split('T')[0];
        const time = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
        filename = `${date}_${time}_${this.context || 'app'}.log`;
      }
      const content = this.logs.join('\n');
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Logs downloaded as ${filename}`);
    } catch (error: any) {
      console.error('Error in downloadLogs:', error);
      toast.error(`Error saving logs: ${error.message}`);
    }
  }
}

// Create and export a single instance
export const logger = new FileLogger(); 