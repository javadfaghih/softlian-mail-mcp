# OpenAI review preparation

App name: **SMPT Mail Plugin**  
MCP URL: `https://mcp.softlian.com/mail`  
Website: `https://mcp.softlian.com/`  
Privacy: `https://mcp.softlian.com/privacy`  
Terms: `https://mcp.softlian.com/terms`  
Support: `https://mcp.softlian.com/support`

The publisher must verify `softlian.com` in the OpenAI developer portal and place its exact challenge value in the `OPENAI_CHALLENGE` Worker secret. The public repository and live endpoints should be checked before review. A reviewer needs a dedicated IMAP/SMTP test mailbox and app password that works without extra MFA during the review. Share those credentials only through the portal's reviewer credential field.

## Positive test cases

Use a dedicated reviewer mailbox with these fixtures: at least five inbox messages; one message with the subject `Softlian review fixture`; one plain-text message with a known body; and an address that can receive a test message. Supply its credentials privately in the portal.

1. **Prompt:** “Connect my review mailbox.” **Expected:** The OAuth page requests email, IMAP host, SMTP host, and app password. After valid input, the client connects and discovers all five tools. **Fixture:** Reviewer mailbox credentials.
2. **Prompt:** “Show my five newest emails.” **Expected:** `list_mail` returns a `messages` array with no more than five items, ordered newest first; each item has `uid`, `subject`, `from`, `date`, and `seen`, with no body. **Fixture:** At least five inbox messages.
3. **Prompt:** “Find emails with the subject Softlian review fixture.” **Expected:** `search_mail` returns matching summaries in `messages`. **Fixture:** A message with that subject.
4. **Prompt:** “Read the first message from that search.” **Expected:** `get_mail` returns a `message` with its UID, headers, plain text, and `hasAttachments` flag; no HTML or attachment bytes. **Fixture:** A matching plain-text message.
5. **Prompt:** “Write a short test email to the review address and show it to me before sending.” **Expected:** The assistant displays the exact recipient, subject, and body, waits for the reviewer's explicit approval, then `send_mail` returns `status: submitted`, `messageId`, `accepted`, and `rejected`. **Fixture:** Review mailbox and receiving address.
6. **Prompt:** “Remove the mailbox connection.” **Expected:** After explicit approval, `remove_mailbox` returns `removed: true`; later mail tools report that the mailbox must be reconnected. **Fixture:** Connected reviewer mailbox.

## Negative test cases

1. **Scenario:** “Search my mail” without any search filter. **Expected:** The assistant asks for a filter, or `search_mail` returns an error without contacting IMAP. **Why:** An unbounded search is not supported.
2. **Scenario:** “Send this now” when the recipient, subject, or full body has not been shown and approved. **Expected:** The assistant asks for explicit approval before calling `send_mail`. **Why:** Sending is an irreversible external action.
3. **Scenario:** Enter a wrong app password in the OAuth form. **Expected:** The form reports a connection failure and OAuth does not complete. **Why:** Invalid mailbox credentials must not be stored or authorized.
4. **Scenario:** Read a UID absent from the inbox. **Expected:** `get_mail` returns “Message not found.” **Why:** The requested message does not exist.
5. **Scenario:** Send to six recipients or with a body over 20,000 characters. **Expected:** Input validation rejects the call. **Why:** Tool limits are explicit and should be enforced before SMTP.

## Before pressing Submit

- Verify publisher identity and domain ownership in the OpenAI developer portal.
- Check that OAuth discovery, DCR, PKCE, and an authenticated MCP session work over the public URL.
- Check the live privacy, terms, support, and repository links.
- Use a dedicated reviewer mailbox, with no real customer data.
- Run the cases above and save evidence of actual results. This document is a test plan, not a claim that live email was tested.
