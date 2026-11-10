// The made-up codes shown on the Chrome Web Store screenshots (D-117). Their
// dates are counted from the day of the run, so the screenshots look current,
// while every code keeps the same status on any day: the nearest expiry is at
// least four weeks ahead, the upcoming code starts at least four weeks ahead,
// and the expired code ended at least a day before.
// tests/store-screenshot-records.test.ts checks that for every day of four years.

/** YYYY-MM-DD for a day of a month counted from `year` and `month` (1 to 12); out-of-range months and day 0 roll over. */
function day(year, month, dayOfMonth) {
  return new Date(Date.UTC(year, month - 1, dayOfMonth)).toISOString().slice(0, 10);
}

/** The records for the screenshots, as stored, for `today` given as YYYY-MM-DD. */
export function storeRecords(today) {
  const [year, month] = today.split('-').map(Number);
  const endOf = (monthsAhead) => day(year, month + monthsAhead + 1, 0);
  const at = `${today}T10:00:00.000Z`;
  const record = (id, promoCode, domain, notify, extra = {}) => ({
    id,
    promoCode,
    notify,
    createdAt: at,
    updatedAt: at,
    ...(domain ? { merchantDomain: domain, resourceUrl: domain } : {}),
    ...extra,
  });
  return [
    record('r1', 'RIDE15', 'larkspur.example', true, {
      expiryDate: endOf(1),
      note: '15% off kit, from a cycling channel',
    }),
    record('r2', 'FREESHIP', 'larkspur.example', true, { note: 'Free delivery on orders over 40' }),
    record('r3', 'LAUNCH20', 'larkspur.example', true, {
      startDate: day(year, month + 2, 1),
      expiryDate: day(year, month + 3, 15),
    }),
    record('r4', 'BREW10', 'fernhill-coffee.example', false, {
      expiryDate: endOf(3),
      note: 'First bag of beans',
    }),
    record('r5', 'TRAIL25', 'northpeak.example', true, {
      note: 'Boots and packs, from a hiking newsletter',
    }),
    record('r6', 'READMORE', 'quillbooks.example', false, {
      expiryDate: endOf(-1),
      note: 'Paperbacks only',
    }),
    record('r7', 'BIRTHDAY5', undefined, false, { note: 'Show at the till in the town shop' }),
  ];
}
