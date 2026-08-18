const noColor = Boolean(process.env['NO_COLOR']);

function wrap(code: string, msg: string): string {
  if (noColor) return msg;
  return `${code}${msg}\x1b[0m`;
}

export const c = {
  red: (msg: string) => wrap('\x1b[0;31m', msg),
  green: (msg: string) => wrap('\x1b[0;32m', msg),
  yellow: (msg: string) => wrap('\x1b[1;33m', msg),
  blue: (msg: string) => wrap('\x1b[0;34m', msg),
};
