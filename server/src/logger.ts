type Fields = Record<string, unknown>;

function write(level: 'info' | 'warn' | 'error', event: string, fields: Fields = {}): void {
  const line = { ts: new Date().toISOString(), level, event, ...fields };
  const out = JSON.stringify(line);
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);
}

export const log = {
  info: (event: string, fields?: Fields) => write('info', event, fields),
  warn: (event: string, fields?: Fields) => write('warn', event, fields),
  error: (event: string, fields?: Fields) => write('error', event, fields),
};
