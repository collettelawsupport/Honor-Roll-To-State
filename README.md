# Texas Our Little Miss — Honor Roll State Registration

A separate Netlify-hosted registration and invoicing workflow for 2026 Texas Our Little Miss Honor Roll and Winner's Circle contestants.

The public form follows the existing Prelim-to-State workflow while using the published [Honor Roll Cognito form](https://www.cognitoforms.com/TexasOurLittleMiss2/TexasStateUniversalBeauty2026HonorRollOnly) prices. It replaces embedded card fields with a QuickBooks Online invoice, so no card information passes through this site.

Published pricing:

- Honor Roll contestant: `$330` total with a `$100` deposit due now.
- Winner's Circle contestant: `$125` total with a `$75` deposit due now.
- Winner's Circle contestant with contestant and chaperone party tickets: `$175` total with a `$75` deposit due now.
- Eligible optional competitions selected on the Big Form are billed at 50% of their standard advance price. Tickets and advertising remain full price.

## Workflow

1. A contestant completes the registration form and signs the release.
2. A Netlify Function saves the registration in a dedicated Honor Roll Netlify Blobs store, creates the contestant as a QuickBooks customer, creates the selected `$100` or `$75` deposit invoice, enables QuickBooks online payments, and emails the invoice.
3. Intuit sends a signed `Payment` or `Invoice` webhook after the deposit is paid.
4. The app emails the contestant a private Big Form link with a prominent button and the full URL in the message body. If Resend is not configured, it falls back to adding the link to the paid QuickBooks invoice and emailing the invoice again through QuickBooks.
5. The Big Form sends its fee summary to the protected `/api/paperwork-complete` endpoint.
6. The deposit-only invoice is replaced with the contestant's selected full entry fee, eligible optional competitions at 50%, and full-price tickets and advertising. The original deposit remains applied, and QuickBooks emails the updated balance.

Unknown or pending prices are deliberately left off the updated invoice and identified in its customer memo.

## Deploy through GitHub and Netlify

1. Import this GitHub repository in Netlify.
2. Netlify reads `netlify.toml`, runs `npm run build`, and publishes `out`.
3. Copy every variable from `.env.example` into **Netlify → Project configuration → Environment variables**.
4. Keep `REGISTRATION_ENABLED=false` while configuring and testing the workflow.
5. Redeploy after setting the variables. Change `REGISTRATION_ENABLED=true` only after the complete sandbox test passes and the production connection is ready.

The dedicated production build falls back to `https://honorrollregistration.texasourlittlemiss.net` for public metadata and application links. `NEXT_PUBLIC_SITE_URL` should still be set to that same value in Netlify so the deployment configuration remains explicit.

Netlify Blobs stores registrations, private workflow tokens, invoice mappings, OAuth state, and the rotating QuickBooks refresh token. Secrets and contestant records are never committed to GitHub.

### Put the Big Form link in the email body

QuickBooks controls the invoice-email template and does not expose a custom message body through the invoice send operation. Configure the following Netlify environment variables to send a separate paid-registration invitation through Resend:

```text
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=Texas Our Little Miss <registration@updates.texasourlittlemiss.net>
```

The domain used by `EMAIL_FROM` must be verified in Resend. After adding the variables, redeploy the site. The invitation includes a **Complete the Big Form** button, the full clickable URL as a fallback, and a plain-text version. The existing QuickBooks invoice remains the payment record but is not re-emailed for the invitation.

## QuickBooks Online setup

Create an app in the Intuit Developer Portal with the **QuickBooks Online Accounting** scope. Add this exact redirect URI to the app:

```text
https://YOUR-NETLIFY-SITE.netlify.app/api/quickbooks/callback
```

In QuickBooks Online:

1. Enable online invoice payments for the connected company.
2. Create or choose a **Products and services** item for the state registration/entry fee and set its ID as `QBO_REGISTRATION_ITEM_ID`.
3. Create or choose an optional-category item and set its ID as `QBO_OPTIONAL_ITEM_ID`. If this is omitted, the registration item is used for all lines.

In the Intuit app's Webhooks settings, use:

```text
https://YOUR-NETLIFY-SITE.netlify.app/api/quickbooks/webhook
```

Subscribe to `Payment` and `Invoice` events. Copy Intuit's webhook verifier token into `QBO_WEBHOOK_VERIFIER_TOKEN`.

After the first Netlify deployment, visit `/connect/`, enter `QBO_SETUP_KEY`, sign in to Intuit, and authorize the correct QuickBooks company. The callback stores the rotating OAuth credentials in Netlify Blobs.

The production Intuit app can use these public application URLs:

- Privacy policy: `/privacy/`
- End-user terms: `/terms/`
- Support: `/support/`
- Connect/reconnect: `/connect/`
- Disconnect: `/disconnect/`

The disconnect page requires `QBO_SETUP_KEY`, revokes the Intuit refresh token, and removes the saved OAuth credentials from Netlify Blobs.

QuickBooks returns an online payment link only when online payments are enabled for the company, the invoice permits online payment, and the customer has a valid email address. The integration requests the link with `include=invoiceLink` and otherwise falls back to the confirmation page while the emailed invoice remains usable.

## Connect the existing Big Form

The paid invitation adds these query parameters to `BIG_FORM_URL`:

```text
?registration=REGISTRATION_UUID&workflow_token=PRIVATE_TOKEN&workflow=honor_roll
```

The Big Form should preserve those values with its saved draft. After it saves the completed paperwork and calculates fees, it must call this site server-to-server:

```http
POST https://YOUR-REGISTRATION-SITE.netlify.app/api/paperwork-complete
Authorization: Bearer BIG_FORM_CALLBACK_SECRET
Content-Type: application/json

{
  "registrationId": "REGISTRATION_UUID",
  "workflowToken": "PRIVATE_TOKEN",
  "submissionId": "BIG_FORM_SUBMISSION_UUID",
  "fees": {
    "lines": [
      {
        "category": "Optional Categories",
        "item": "Miss Photogenic",
        "description": "1 picture",
        "sourceField": "miss_photogenic",
        "quantity": 1,
        "rate": 50,
        "amount": 50,
        "status": "known"
      }
    ],
    "knownTotal": 50,
    "pendingCount": 0
  }
}
```

Use the same long random value for `BIG_FORM_CALLBACK_SECRET` in both Netlify sites. Configure the Big Form's `HONOR_ROLL_REGISTRATION_WORKFLOW_URL` with this site's deployed URL. The server validates both the shared secret and contestant-specific workflow token before changing an invoice, while existing Prelim-to-State links continue using their original callback.

The Honor Roll discount is applied only when `sourceField` identifies an eligible optional competition. The current eligible fields are Miss Photogenic, Livin' Doll, Commercial Print, Pro Am Modeling, Optional Talent, Prettiest & Best, and Practice Interview. Theme-party tickets, guest badges, patron listings, and program ads remain full price.

## Local checks

```bash
npm install
npm test
npm run lint
npm run build
```

`npm run dev` runs the static frontend. Use `npx netlify dev` when testing Netlify Functions locally, with sandbox QuickBooks credentials in a local `.env` file.

## Important implementation details

- Repeating a browser submission reuses the saved registration and invoice instead of intentionally creating a second invoice.
- Intuit webhook signatures are verified with HMAC-SHA256 over the untouched request body.
- QuickBooks access tokens are refreshed automatically, and each newly rotated refresh token is saved back to Netlify Blobs.
- Every QuickBooks OAuth and Accounting API response captures Intuit's `intuit_tid` troubleshooting identifier in sanitized Netlify function logs. Request bodies, tokens, credentials, and customer email query values are not logged.
- An expired or revoked refresh token, or a second API `401` after refresh, clears the unusable credentials and returns a reconnect-required status. The contestant's registration remains saved, the public form directs the family to support, and an administrator can reconnect through `/connect/`.
- The public form checks `/api/registration-readiness` before allowing submission. If required QuickBooks or Big Form settings are missing, or QuickBooks is disconnected, registration is visibly paused and no new contestant record is stored.
- The public status endpoint requires an independent random status token; a registration UUID by itself cannot reveal the invoice link.
- The full selected entry fee replaces the original deposit line. The paid `$100` or `$75` stays linked to that invoice, so QuickBooks calculates the remaining balance.
- Payment webhooks verify that the complete entry-specific deposit invoice is paid before sending the private Big Form invitation.
- This project uses its own browser-draft key and Netlify Blobs store, so it does not mix Honor Roll registrations with Prelim-to-State registrations.
- Real customer data, OAuth credentials, webhook tokens, setup keys, and email API keys must never be added to the repository.
