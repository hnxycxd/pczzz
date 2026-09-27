const useColor = process.stdout.isTTY === true && !process.env.NO_COLOR;

function color(code: string, text: string): string {
  return useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export const bold = (text: string): string => color('1', text);
export const dim = (text: string): string => color('2', text);
export const red = (text: string): string => color('31', text);
export const green = (text: string): string => color('32', text);
export const yellow = (text: string): string => color('33', text);
export const cyan = (text: string): string => color('36', text);
