// lib/session/constants.ts
// Straight port of the data blocks from sessionongoing.js — zone data, script
// lines, announcement template, station list. Logic-free, so this is 1:1.

export interface ZoneInfo {
  coverage: string;
  notes: string;
  depot: string;
  depotNearby: string;
}

export const ZONE_DATA: Record<string, ZoneInfo> = {
  'Zone 1':  { coverage: 'WFD <-> STV/STB/CHP', notes: 'Willowfield <-> Stepford Victoria/Stepford Bay/City Hospital', depot: 'Willowfield C.S. / Marston Hill TMD / Beechley Kingsway C.S', depotNearby: 'Trinity Way TMD' },
  'Zone 2':  { coverage: 'SCN <-> WHF/SCE/SHS', notes: 'Stepford Central <-> Whitefield/Stepford East/Stepford High Street', depot: 'Trinity Way TMD / Whitefield Farm Park C.S. / Market Weighton TMD', depotNearby: 'Marston Hill TMD / Beechley Kingsway C.S' },
  'Zone 3':  { coverage: 'SHB <-> COX/EBR/WNG(M)', notes: 'St. Helens Bridge <-> Coxly/East Berrily/Whitney Green (Metro)', depot: 'Bodin MOC / Manea Hill TMD / Coxly Station C.S. (Station & Bypass)', depotNearby: 'Stoke Milton C.S. (WB)' },
  'Zone 4':  { coverage: 'NRH <-> WBN', notes: 'Newry Harbour <-> West Benton', depot: 'Meriden Grove TMD / Elmstead Park C.S', depotNearby: 'N/A' },
  'Zone 5':  { coverage: 'BEN <-> CON/PBE', notes: 'Benton <-> Connolly/Port Benton', depot: 'Harbour City TMD / Benton Station C.S.', depotNearby: 'Coxly Station C.S. (Station & Bypass) / Stoke Milton TMD (WB)' },
  'Zone 6':  { coverage: 'MGT <-> MGD/WNG(W)/BBG/USP', notes: 'Morganstown <-> Morganstown Docks/Whitney Green (Waterline)/Benton Bridge/Upper Staploe', depot: 'Stoke Milton C.S. (All directions) / Holbeck TMD', depotNearby: 'Manea Hill TMD (EB)' },
  'Zone 7':  { coverage: 'SAP <-> SAZ/SAX', notes: 'Stepford Airport Parkway <-> Airport Terminal 3/Airport Terminal 2', depot: 'Melrose Depot (Road 11 & 17) / Stoke Milton C.S. (NB)', depotNearby: 'N/A' },
  'Zone 8':  { coverage: 'SAW <-> EFD', notes: 'Airport West <-> Esterfield', depot: 'Melrose Depot (Road 2) / Esterfield TMD', depotNearby: 'N/A' },
  'Zone 9':  { coverage: 'WTN <-> MRC/LTW/RLB', notes: 'Water Newton <-> Millcastle Racecourse/Leighton West/Rayleigh Bay', depot: 'Faymere Green TMD (All directions) / Winstree Lane TMD', depotNearby: 'Stoke Milton C.S. (EB)' },
  'Zone 10': { coverage: 'LYN <-> MLC', notes: 'Llyn-By-The-Sea <-> Millcastle', depot: 'Laira TMD', depotNearby: 'Faymere Green TMD (SB)' },
};

export const ZONES = Object.keys(ZONE_DATA);

export const ZONE_MAP_IMG_URL =
  'https://cdn.discordapp.com/attachments/1344385121075204136/1471103255022014637/attachment.gif?ex=69dc286b&is=69dad6eb&hm=328cff76bf4a3b7703ad46aebd80e999bb317d5d1b674c596b36ec9626bc4408&';

export const ANNOUNCEMENT_TEMPLATE = `# May I have everyone drive in [ZONE]!
**Zone Coverage:**
[ZONE COVERAGE]
(*[NOTES]*)
**Preferred Depot**:
[DEPOT & SIDING (WITHIN ZONE)]
**Nearby Depot**:
[DEPOT & SIDING NEARBY ZONE]
@[TRAINEE] please wait for further instructions from @[TRAINER], as you will be signalling next!
## Zone Map
${ZONE_MAP_IMG_URL}`;

export const SCRIPT_LINES: string[] = [
  "@[NAME] It is your turn to signal. Please check your DMs",
  "Hello, it is time for you to signal. Please spawn as an *SG* at **[LOCATION]** and line up in front of me.",
  "Before we start if you wish to receive feedback on your performance, please let me know now. (Wait for trainee to arrive)",
  "Here are some general reminders before we begin: You have XX minutes to signal. The timer begins once you sit down on the desk.",
  "While you are setting up, be aware of trains running on the line. *DO NOT* cause an adverse signal (changing signal in front of a train).",
  "You are timed during your setup. However, as mentioned earlier, it is recommended to limit your setup time to around 2 minutes.",
  "Do you have any signalling related questions before we proceed? If not, please do say so. (Wait for question)",
  "If you have no further questions, you may sit on the desk whenever you\u2019re ready. Make sure to pay attention to your DM\u2019s at *ALL* times. (No questions)",
  "Times is up. Please hop off the desk! (End of trainees' time)",
];

export interface StationInfo { code: string; name: string; }

export const STATION_LIST: StationInfo[] = [
  {code:'WFD', name:'Willowfield'}, {code:'STV', name:'Stepford Victoria'},
  {code:'STB', name:'Stepford Bay'}, {code:'CHP', name:'City Hospital'},
  {code:'SCN', name:'Stepford Central'}, {code:'WHF', name:'Whitefield'},
  {code:'SCE', name:'Stepford East'}, {code:'SHS', name:'Stepford High Street'},
  {code:'SHB', name:'St. Helens Bridge'}, {code:'COX', name:'Coxly'},
  {code:'EBR', name:'East Berrily'}, {code:'WNG', name:'Whitney Green'},
  {code:'NRH', name:'Newry Harbour'}, {code:'WBN', name:'West Benton'},
  {code:'BEN', name:'Benton'}, {code:'CON', name:'Connolly'},
  {code:'PBE', name:'Port Benton'}, {code:'MGT', name:'Morganstown'},
  {code:'MGD', name:'Morganstown Docks'}, {code:'BBG', name:'Benton Bridge'},
  {code:'USP', name:'Upper Staploe'}, {code:'SAP', name:'Stepford Airport Parkway'},
  {code:'SAZ', name:'Airport Terminal 3'}, {code:'SAX', name:'Airport Terminal 2'},
  {code:'SAW', name:'Airport West'}, {code:'EFD', name:'Esterfield'},
  {code:'WTN', name:'Water Newton'}, {code:'MRC', name:'Millcastle Racecourse'},
  {code:'LTW', name:'Leighton West'}, {code:'RLB', name:'Rayleigh Bay'},
  {code:'LYN', name:'Llyn-By-The-Sea'}, {code:'MLC', name:'Millcastle'},
];

export function buildStationAnnouncement(station: StationInfo): string {
  return `\ud83d\udcf8 Taking a screenshot at **${station.name}** (${station.code})!\nFeel free to stop by if you're nearby.`;
}

export const STAFF_ROLES = ['Main AST', 'Assistant', 'Co-Host', 'Internal Helper'] as const;

// ── Post-session report — ported from sessionongoing.js's buildReportText() ──
export function formatUKTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts));
}

export function formatDdMmYyyy(isoDate: string | null | undefined): string {
  if (!isoDate) return '__/__/____';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export interface ReportInput {
  hostName: string;
  sessionDateIso: string | null;
  timeTracker: { briefingStart?: number; sgShiftStart?: number; screenieTime?: number };
  mainAst: string;
  assistants: string[];
  cohosts: string[];
  internalHelpers: string[];
  totalTrainees: number;
  cancelledNoShow: string[];
  drivers: string[];
  traineeLines: string[]; // "T1: Name - Trainer"
  mainAstNotes: string;
}

export function buildReportText(input: ReportInput): string {
  const joinOrDash = (arr: string[]) => (arr.length ? arr.join('\n') : '—');
  return `========REPORT BASED ON THE SIGNALLING PRACTICE==========
Host: ${input.hostName}
Date: ${formatDdMmYyyy(input.sessionDateIso)}
Time: ${formatUKTime(Date.now())} BST/GMT

----------
Actual Briefing start: ${formatUKTime(input.timeTracker.briefingStart)}
Actual SG Shift start: ${formatUKTime(input.timeTracker.sgShiftStart)}
Actual Screenie time: ${formatUKTime(input.timeTracker.screenieTime)}

----------

Main AST:
${input.mainAst || '—'}

Assistants:
${joinOrDash(input.assistants)}

Co-Hosts:
${joinOrDash(input.cohosts)}
IH:(If any):
${joinOrDash(input.internalHelpers)}

Total no. of trainees in panel: ${input.totalTrainees}

Cancelled/No-show trainee:
${joinOrDash(input.cancelledNoShow)}

Driver(s) if any:
${joinOrDash(input.drivers)}

Trainee data:
S.no | Trainee | Trainer
${input.traineeLines.length ? input.traineeLines.join('\n') : '—'}

Notes from Main AST(if any):
${input.mainAstNotes || '—'}

=======TO WHOM IT MAY BE CONCERNED=========`;
}