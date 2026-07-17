type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const writeLog = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {})
  };

  const output = JSON.stringify(payload);

  if (level === 'ERROR') {
    console.error(output);
    return;
  }

  console.log(output);
};

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => writeLog('INFO', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => writeLog('WARN', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => writeLog('ERROR', message, meta)
};
