export const facebookSelectors = {
  messageButton: 'div[aria-label="Message"], div[aria-label="إرسال رسالة"]',
  textboxRole: 'div[role="textbox"]',
  chatCloseButton: 'div[aria-label="Close chat"], div[aria-label="إغلاق الدردشة"], div[role="button"][aria-label^="Close"], div[role="button"][aria-label^="إغلاق"]',
  composeBoxPrefixes: ['Write to', 'اكتب إلى'],
  blockKeywords: [
    "You're Temporarily Blocked",
    "قمنا بتقييد بعض الميزات",
    "Action Blocked"
  ],
} as const;
