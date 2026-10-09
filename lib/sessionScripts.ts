import { siteWallTimeToISOString, type SiteTimezoneMode } from './siteTimezone';

export interface ScriptStaffRow { role: string; staff_name: string }
export interface ScriptTraineeRow { is_standby: boolean; trainee_roblox_username: string | null; trainee_discord: string | null }
export interface SessionScriptSource {
  session_name: string | null;
  session_date: string;
  session_time: string;
  session_duration: string | null;
  num_slots: number;
  event_link?: string | null;
  forum_link?: string | null;
  private_server_link?: string | null;
  staffRows: ScriptStaffRow[];
  traineeRows: ScriptTraineeRow[];
}

export interface SessionScript { key: string; label: string; content: string }

const scenario = 'A SG Practice session hosted by (us) YSS community where you will gain feedback to enhance your signalling skills. Come now and show off your signalling skills with the YSS community. Let’s learn, improve, and have fun together!';

export function buildSessionScripts(
  session: SessionScriptSource,
  timezoneMode: SiteTimezoneMode,
  discordIdsByName: Record<string, string> = {},
): SessionScript[] {
  const staff = (code: string) => session.staffRows.find(row => row.role === code || row.role.startsWith(`${code},`))?.staff_name.trim() ?? '';
  const host = staff('HOST') || '[HOST NAME]';
  const coHosts = ['CH_1', 'CH_2', 'CH_3'].map(staff).filter(Boolean);
  const supervisor = staff('CH_4');
  const assistants = ['AST_1', 'AST_2', 'AST_3', 'AST_4'].map(staff).filter(Boolean);
  const extraAssistants = session.staffRows
    .filter(row => /assistant|\bIH\b|internal helper/i.test(row.role) && !/^AST_/.test(row.role))
    .map(row => row.staff_name.trim()).filter(Boolean);
  const allCoHosts = [...new Set([...coHosts, supervisor].filter(Boolean))];
  const allAssistants = [...new Set([...assistants, ...extraAssistants])];
  const names = (values: string[]) => values.length ? values.join(', ') : 'None assigned';
  const ping = (value: string) => {
    const id = discordIdsByName[value.toLowerCase()];
    return id ? `<@${id}>` : `@${value}`;
  };
  const pings = (values: string[]) => values.length ? values.map(ping).join(', ') : 'None assigned';

  const iso = siteWallTimeToISOString(session.session_date, session.session_time, timezoneMode);
  const start = iso ? new Date(iso) : null;
  const duration = Number(session.session_duration);
  const validDuration = Number.isFinite(duration) && duration > 0 ? duration : null;
  const end = start && validDuration ? new Date(start.getTime() + validDuration * 60_000) : null;
  const gmtDate = start ? `${String(start.getUTCDate()).padStart(2, '0')}/${String(start.getUTCMonth() + 1).padStart(2, '0')}/${start.getUTCFullYear()}` : 'DD/MM/YYYY';
  const gmtTime = start ? `${String(start.getUTCHours()).padStart(2, '0')}:${String(start.getUTCMinutes()).padStart(2, '0')}` : 'XX:XX';
  const endTime = end ? `${String(end.getUTCHours()).padStart(2, '0')}:${String(end.getUTCMinutes()).padStart(2, '0')}` : 'XX:XX';
  const timestamp = start ? `<t:${Math.floor(start.getTime() / 1000)}:F> · <t:${Math.floor(start.getTime() / 1000)}:R>` : '[user local time] · [interval]';
  const dateTime = `${gmtDate} ${gmtTime} GMT (${timestamp})`;
  const eventLink = session.event_link?.trim() || '[EVENT LINK]';
  const forumLink = session.forum_link?.trim() || '[FORUM LINK IF OPEN]';
  const privateLink = session.private_server_link?.trim() || '[PRIVATE SERVER LINK]';
  const privateMarkdown = session.private_server_link?.trim() ? `[Private Server](${privateLink})` : privateLink;
  const confirmed = session.traineeRows.filter(row => !row.is_standby && (row.trainee_roblox_username || row.trainee_discord));
  const standby = session.traineeRows.filter(row => row.is_standby && (row.trainee_roblox_username || row.trainee_discord));
  const signupLines = (rows: ScriptTraineeRow[]) => rows.length ? rows.map(row => `> - ${row.trainee_roblox_username || row.trainee_discord}`).join('\n') : '> - ...';
  const title = session.session_name?.trim() || 'SG Practice';
  const type = /training/i.test(title) ? 'Training' : 'Practice';

  return [
    {
      key: 'details', label: 'PS Shift Details Announcement',
      content: `# ${title}\n:crown: | **Host**: ${host}\n:date: | **Date & Time:** ${dateTime}\n:hourglass: | **Duration:** ${validDuration ?? 'XX'} minutes\n:video_game: | **Game:** Stepford County Railway\n\nScenario:\n${scenario}\n\n${eventLink}\n\nSee you there!`,
    },
    {
      key: 'thread', label: 'PS Shift Thread',
      content: `:dizzy:**Co-Host(s)**: ${names(allCoHosts)}\n:pencil:**Assistant(s)**: ${names(allAssistants)}\n\nShift Signups link: ${forumLink}\n\n====================================\n\nFurther updates will be posted here.`,
    },
    {
      key: 'forum-name', label: 'Forum Name',
      content: `[${gmtDate}] | ${gmtTime} - ${endTime} GMT | ${host} SG Practice`,
    },
    {
      key: 'forum-description', label: 'Forum Description',
      content: `👑 | **Host**: ${host}\n💫 | **Co-Host(s)**: ${names(allCoHosts)}\n📝 | **Assistant(s)**: ${names(allAssistants)}\n📅 | **Date & Time:** ${dateTime}\n⌛ | **Duration:** ${validDuration ?? 'XX'} minutes\n\n**Scenario**:\n${scenario}\n\nSee you there!`,
    },
    {
      key: 'information', label: 'Information Message',
      content: `# SG Practice of ${host} Signup Forum\n\n**Legends**:\nRoblox Username - The roblox username that you are gonna type in the signups will be YOUR Roblox username, not the host.\n\nIf you want to **SIGNAL**, please use this sign-up format:\n\nHost: ${host}\nRoblox Username:\nDate: ${gmtDate}\nZone:\n\nFor **DRIVERS**, kindly sign-up in this format:\n\nHost: ${host}\nRoblox Username:\nDate: ${gmtDate}\n\n**Driver only**\n\n## SG signups (${confirmed.length}/${session.num_slots || 4})\n${signupLines(confirmed)}\n\n### QD signups (${standby.length}/∞)\n${signupLines(standby)}\n\n**IMPORTANT NOTE**: We reserve the right to deny your signup if the shift is scheduled to begin shortly after your submission.`,
    },
    {
      key: 'start', label: 'PS Shift / YSS Start Announcement',
      content: `# Hi there signalling enthusiasts! :wave:\n## YSS x PS SG Practice is starting momentarily!\n\n:crown: | **Host**: ${host}\n:dizzy:**Co-Host(s)**: ${names(allCoHosts)}\n:pencil:**Assistant(s)**: ${names(allAssistants)}\n\nIf you are currently scrolling through PS and have some time to spare, why not join this signalling practice to help some of your fellow signalling enthusiasts practice! I know they would appreciate it! :zany_face:\n\nTo those who decide to join the fun, kindly take a seat in the BRIEFING ROOM in front of the staff. :fire:\n\n:link: ${privateMarkdown}`,
    },
    {
      key: 'staff', label: 'YSS Staff Ping(s)',
      content: `🔔**__Staff Session Alert!__**🔔\n\n> To all **session staff** for the upcoming **${type}** Session, we will be starting shortly.\n\n**Co-Host(s):** ${pings(coHosts)}\n**Assistant(s):** ${pings(allAssistants)}${supervisor ? `\n**Supervisor:** ${ping(supervisor)}` : ''}\n\n> Please spawn in **YOUR RESPECTIVE ROLE**, and head towards the **STAFF STAGE** and line-up beside me.\n\n> **Pay attention** to the *discord/vc* at all times to make sure our session will be running as smoothly as possible.\n\n${privateMarkdown}`,
    },
  ];
}
