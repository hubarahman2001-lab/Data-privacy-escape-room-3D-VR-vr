/* Course content, copied from the 2D game (Mini-trivia-escape-room-game). Edit freely.
   NOTE: these are general good-practice placeholders, same as the 2D game. Replace with course questions before real use. */
export const DECISIONS = {
  badgeIssue:{ title:"Badge for a visitor in a hurry",
    text:"A visitor says they're late for a meeting on Floor 4 and asks for a badge straight away. What comes first?",
    opts:[{t:"Issue the badge now and take their details once they're upstairs.",ok:false,kw:["issue the badge now","upstairs"]},
          {t:"Check their ID, confirm the host expects them, log the visit, then issue the badge.",ok:true,kw:["check","confirm","host","log"]},
          {t:"Give them a badge for the ground floor only and sort out the rest later.",ok:false,kw:["ground floor","sort out"]}],
    why:"Confirm who they are and who they're seeing before they get any access. The log is your audit trail.", src:"General good practice – replace with course source"},
  liftVisitor:{ title:"Visitor without an escort",
    text:"You've stopped the doors. The visitor wants Floor 4, a staff-only floor, on their own. What do you do?",
    opts:[{t:"They're wearing a visitor badge, so let them carry on.",ok:false,kw:["let them","carry on"]},
          {t:"Ask who they're meeting, offer to call their host, and walk them back to reception.",ok:true,kw:["ask","host","reception","call"]},
          {t:"Press Floor 4 for them and get out at your own floor.",ok:false,kw:["press floor","your own floor"]}],
    why:"Visitors must be escorted. A polite question protects the floor without making it awkward.", src:"General good practice – replace with course source"},
  lostCard:{ title:"Where's your card?",
    text:"Your ID card is gone. It was on you at the gates. What's the first thing to do?",
    opts:[{t:"Retrace your steps and look for it first. Raise it tomorrow if it hasn't turned up.",ok:false,kw:["retrace","look for it","tomorrow"]},
          {t:"Report it to Security straight away so it can be blocked.",ok:true,kw:["report","security","block"]},
          {t:"Ask a colleague to let you in tonight and sort it out in the morning.",ok:false,kw:["colleague","morning"]}],
    why:"A lost card works for whoever finds it. Reporting it fast gets it blocked.", src:"General good practice – replace with course source"},
  phoneCall:{ title:"The call from “IT”",
    text:"The caller says they're from IT, the lockdown is their fault, and they need your password right now to fix it. You…",
    opts:[{t:"Ask for their name and staff number, then give it if they sound genuine.",ok:false,kw:["staff number","genuine"]},
          {t:"Refuse, hang up and report the call through the official IT channel.",ok:true,kw:["refuse","hang up","report"]},
          {t:"Don't say it out loud. Type it into the link they send you.",ok:false,kw:["type","link"]}],
    why:"Real IT never asks for your password. Urgency is a red flag: report the call.", src:"General good practice – replace with course source"},
  breach:{ title:"Final check",
    text:"Sam: “One last check before I lift the lockdown. If you ever suspect a data breach, what do you do first?” Say it out loud, or point and pinch.",
    opts:[{t:"Report it straight away",ok:true,kw:["report","notify","inform","escalate","alert","tell"]},
          {t:"Work out what happened first, then decide",ok:false,kw:["work out","investigate","decide"]},
          {t:"Fix it quietly yourself",ok:false,kw:["fix","quietly"]}],
    why:"Report suspected breaches straight away. Fast reporting limits the damage.", src:"General good practice – replace with course source"}
};
/* Print room sorting game: zone is "shred", "cabinet" or "recycle" */
export const PAGES = [
  {title:"Customer call list", sub:"Old draft · names and phone numbers", icon:"📋", zone:"shred",   why:"Personal data you no longer need: shred it."},
  {title:"Signed client contract", sub:"Original · still needed",        icon:"✍️", zone:"cabinet", why:"Confidential and still needed: lock it away."},
  {title:"Canteen menu", sub:"This week",                                 icon:"🍽️", zone:"recycle", why:"Nothing personal or confidential: recycling is fine."},
  {title:"Staff phone list", sub:"Printed in 2022 · out of date",         icon:"☎️", zone:"shred",   why:"Out-of-date personal data: shred it."}
];
export const LINES={ lostGone:"Gone? It's not on my cameras either. What do you do?",
  lostBlocked:"Old card blocked. I've sent a temporary card to the tray by the door. Tap it on the reader.",
  stickyBack:"The back says “pw: Summer2026!”. That's your password." };
