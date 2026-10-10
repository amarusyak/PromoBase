/**
 * Helps with typing a date as DD.MM.YYYY (D-033): digits are grouped and the
 * dots are put in as the user types. It only shapes the text. Whether the
 * result is a real date is decided by parseDisplayDate when the form is saved.
 *
 * `previous` is the field's text before the change and `next` the text after.
 */
export function maskDateInput(previous: string, next: string): string {
  // While text is being removed, leave it alone: putting a dot back in right
  // after the user deleted it would make the field impossible to correct.
  if (next.length < previous.length) return next;

  // A date pasted in the stored form, year first.
  const iso = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(next);
  if (iso !== null) return `${iso[3]}.${iso[2]}.${iso[1]}`;

  const parts = ['', '', ''];
  const sizes = [2, 2, 4];
  let part = 0;
  for (const char of next) {
    const current = parts[part] ?? '';
    const size = sizes[part] ?? 0;
    if (char >= '0' && char <= '9') {
      if (current.length < size) {
        parts[part] = current + char;
      } else if (part < 2) {
        part += 1;
        parts[part] = char;
      }
    } else if (part < 2 && current.length > 0) {
      // Any separator ends the day or the month; "1." means the 1st.
      parts[part] = current.padStart(size, '0');
      part += 1;
    }
  }

  const [day = '', month = '', year = ''] = parts;
  let text = day;
  if (day.length === 2) text += '.';
  text += month;
  if (month.length === 2) text += '.';
  return text + year;
}

/**
 * Writes out a year typed with two digits: "12.12.26" becomes "12.12.2026".
 * Dates are accepted from 2000 to 2100 only, so "20" is the one century it can
 * be. Applied when the user leaves the field or saves, never while typing,
 * because "12.12.20" may be the beginning of "12.12.2026". Anything else comes
 * back unchanged.
 */
export function completeDateYear(text: string): string {
  const match = /^\s*(\d{2}\.\d{2}\.)(\d{2})\s*$/.exec(text);
  return match === null ? text : `${match[1]}20${match[2]}`;
}
