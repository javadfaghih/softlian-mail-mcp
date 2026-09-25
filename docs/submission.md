# OpenAI review preparation

App name: **Softlian Mail**  
MCP URL: `https://mcp.softlian.com/mail`  
Website: `https://mcp.softlian.com/`  
Privacy: `https://mcp.softlian.com/privacy`  
Terms: `https://mcp.softlian.com/terms`  
Support: `https://mcp.softlian.com/support`

The publisher must verify `softlian.com` in the OpenAI developer portal and place its exact challenge value in the `OPENAI_CHALLENGE` Worker secret. The public repository and live endpoints should be checked before review. A reviewer needs a dedicated IMAP/SMTP test mailbox and app password that works without extra MFA during the review. Share those credentials only through the portal's reviewer credential field.

## Positive test cases

1. Connect the test mailbox with its address, IMAP host, SMTP host, and app password. The client completes OAuth and sees the five MCP tools.
2. Ask for the latest five inbox messages. `list_mail` returns at most five summaries, newest first, without bodies.
3. Search for a known subject. `search_mail` returns matching inbox message summaries.
4. Read one returned UID. `get_mail` returns its plain-text content and attachment presence without HTML or attachment bytes.
5. Draft a message to the review mailbox. After the reviewer explicitly approves the displayed recipient, subject, and body, `send_mail` submits it and reports the SMTP response.
6. Ask to remove the mailbox and approve the action. `remove_mailbox` deletes the saved connection; subsequent mail calls fail until the mailbox is connected again.

## Negative test cases

1. Search with no filters. The tool rejects the request without contacting IMAP.
2. Attempt to send without the required `mail:send` scope or without an explicit user approval. The operation must be refused.
3. Enter an invalid app password on the connection page. The server refuses to store the mailbox and does not finish OAuth.
4. Request an unknown UID. `get_mail` reports that the message was not found.
5. Attempt to exceed five recipients, the 20,000-character body limit, or the daily send limit. The operation fails.

## Before pressing Submit

- Verify publisher identity and domain ownership in the OpenAI developer portal.
- Check that OAuth discovery, DCR, PKCE, and an authenticated MCP session work over the public URL.
- Check the live privacy, terms, support, and repository links.
- Use a dedicated reviewer mailbox, with no real customer data.
- Run the cases above and save evidence of actual results. This document is a test plan, not a claim that live email was tested.
