// Fixed, line-by-line copy text for the host/co-host briefing pop-out.
export const BRIEFING_SCRIPT = [
  {
    title: 'Introduction',
    lines: [
      'Hello and welcome. Please take a seat in the BRIEFING ROOM in front of the staff. Make sure to pay attention to the announcement pop ups at all times!',
    ],
  },
  {
    title: 'Briefing Start',
    lines: [
      "Hello and welcome to today's session! I am your host [NAME IF NEEDED] today, beside me you can see my co-hosts [NAME IF NEEDED] who will be helping me in today's session.",
      'This session will include a QnA, if you have any signalling related questions you may ping one of the staff members of this session in the YSS / PS communications server once it starts.',
    ],
  },
  {
    title: 'For Practice',
    hint: 'Use these lines for a practice session.',
    lines: [
      "For today's session we will be doing a practice session.",
      'A practice session is a type of session where there is no pass or fail criteria. This type is mainly focusing on practicing and improving your signalling skills.',
      'For today’s session, you may request your trainer to give you feedback on your performance. If you do not require feedback we will just drive for you instead.',
    ],
  },
  {
    title: 'Session Briefing',
    lines: [
      'If you are playing on a low-end device, or having an internet related issue, we will not compensate you for any of these issues that you may encounter during your turn.',
      'A schedule is posted in the thread indicating when you’ll be called up. Please avoid requesting for an earlier turn, although in some cases it may be allowed.',
      'Once it is your turn, you will receive a ping in your DM’s on the communications server. Make sure to be aware and have your DM’s open!',
      'If you haven’t been called up by a trainer yet, or your turn has already ended, please continue driving for your fellow trainees as it helps a lot.',
      'While you are signalling, me or my co-hosts will be overseeing your performance and will be giving feedback, after signalling if requested so.',
      'While you are setting up your zone, feel free to use the signalling guides as they might be helpful. We recommend setting up the zone within the 2 minute time frame.',
      'Make sure to keep an eye on the PS communications server as assistants are announcing which zone to drive in. It would help our assistants a lot if you could be aware of the correct zone.',
      'You are not required to stay in the session for the whole of it, but it would be appreciated by us and the other trainees after you if you continued to drive for them.',
    ],
  },
  {
    title: 'Quick QnA',
    hint: 'Maximum 3 minutes; end sooner if there are no questions.',
    lines: [
      'If you have any signalling related questions you may ping one of the Host / Co-hosts in the YSS or PS communications server now so we can assist you further.',
    ],
  },
  {
    title: 'After QnA',
    lines: [
      'This is the end of the Q&A. We will now begin. Please keep an on your DM’s in the communication as we will call you via that.',
      'Don’t change a signal to red in front of a train, holding or blocking other trains on purpose. In general trolling will not be tolerated in this session as it disrupts the experience for everyone.',
      'BRIEFING HAS ENDED. PLEASE MOVE TO THE SCR PRIVATE SERVER POSTED IN THE PS POST WHERE WE WILL BE CONDUCTING THE REST OF THE SESSION. Good luck!',
    ],
  },
] as const;

export const DEFAULT_BRIEFING_CLOSING_LINE = 'Good luck and have fun!';
