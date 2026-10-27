/* Fictional directory and example teams for the prototype. No real user data. */
window.FS_DIRECTORY = [
  { id: 'maya', name: 'Maya Chen', city: 'San Francisco', tz: 'America/Los_Angeles', work: [9, 17], color: '#0f6cbd',
    busy: [[12, 13, 'Lunch'], [14, 15, 'Design review']], ledger: 0 },
  { id: 'sofia', name: 'Sofia Ramírez', city: 'New York', tz: 'America/New_York', work: [9, 17], color: '#8764b8',
    busy: [[12, 13, 'Lunch'], [15, 16, 'Pipeline review']], ledger: 0 },
  { id: 'lucas', name: 'Lucas Almeida', city: 'São Paulo', tz: 'America/Sao_Paulo', work: [9, 18], color: '#c239b3',
    busy: [[12, 13.5, 'Lunch']], ledger: 10 },
  { id: 'tom', name: 'Tom Okafor', city: 'London', tz: 'Europe/London', work: [9, 17], color: '#038387',
    busy: [[10, 11, '1:1 with Sam'], [12.5, 13.5, 'Lunch']], ledger: 6 },
  { id: 'elena', name: 'Elena Fischer', city: 'Berlin', tz: 'Europe/Berlin', work: [9, 17], color: '#498205',
    busy: [[12, 13, 'Lunch']], ledger: 4 },
  { id: 'amara', name: 'Amara Nwosu', city: 'Lagos', tz: 'Africa/Lagos', work: [9, 17], color: '#e3008c',
    busy: [[13, 14, 'Lunch']], ledger: 8 },
  { id: 'priya', name: 'Priya Raman', city: 'Bengaluru', tz: 'Asia/Kolkata', work: [10, 18], color: '#d13438',
    busy: [[13, 14, 'Lunch'], [15, 16, 'Sprint review']], ledger: 48 },
  { id: 'wei', name: 'Wei Ling Tan', city: 'Singapore', tz: 'Asia/Singapore', work: [9, 18], color: '#986f0b',
    busy: [[12, 13, 'Lunch']], ledger: 22 },
  { id: 'kenji', name: 'Kenji Sato', city: 'Tokyo', tz: 'Asia/Tokyo', work: [9, 18], color: '#5c2e91',
    busy: [[12, 13, 'Lunch']], ledger: 30 },
  { id: 'jack', name: 'Jack Wilson', city: 'Sydney', tz: 'Australia/Sydney', work: [9, 17], color: '#ca5010',
    busy: [[12, 13, 'Lunch']], ledger: 26 },
];

window.FS_SCENARIOS = {
  'us-uk-in': {
    label: 'Product team · SF, London, Bengaluru',
    title: 'Weekly Product Sync', people: ['maya', 'tom', 'priya'], slot: 9 * 60, dur: 60,
  },
  'follow-sun': {
    label: 'Platform team · SF, London, Bengaluru, Sydney',
    title: 'Platform Standup', people: ['maya', 'tom', 'priya', 'jack'], slot: 8 * 60, dur: 30,
  },
  'americas-apac': {
    label: 'Partnerships · SF, São Paulo, Tokyo, Singapore',
    title: 'Partner Roadmap Review', people: ['maya', 'lucas', 'kenji', 'wei'], slot: 10 * 60, dur: 60,
  },
};
