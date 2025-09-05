# Start Here (Super Simple)

Goal: Get a working Permits & Licensing demo running end‑to‑end. Follow the steps in order. No jargon.

What you’ll have
- Staff app page to intake, manage docs, take payment (stub), and sign approvals
- Public LWR site for applicants to apply, upload, and sign
- Final signed approval PDF (your certificate)

Before you start
- Deploy this folder: `force-app/main/Government_Documents/Permit_And_Licensing`
- Make sure Digital Experiences is enabled (Setup > Digital Experiences > Settings > Enable)

1) Create sample data (1 minute)
- App Launcher > APD Applications > New
- Fill Operator, Lease Number, basic fields > Save

2) Staff app page (Lightning App Builder)
- Setup > App Builder > New > App Page > Name: Permit Operations
- Drag these components onto the canvas:
  - `c:nuviPermitApplicationWizard` (intake)
  - `c:nuviPermitDocumentManager` (folders + uploads)
  - `c:permitPrint` (makes the certificate PDF)
  - `c:nuviPermitSignatureManager` (wraps shared `c:pdfSigner` to sign)
  - Optional: `c:permitMap`
- Activate for Desktop

3) Public portal (LWR)
- Setup > Digital Experiences > All Sites > New > Build Your Own (LWR) > Name: Permit Portal
- Open Experience Builder and make 3 pages:
  - Apply: add `c:nuviPermitApplicationWizard`
  - My Documents: add `c:nuviPermitDocumentManager`
  - Sign: add `c:nuviPermitSignatureManager`
- Add these to navigation and Publish

Record context (important)
- Pages that act on a specific application need the record. Open from the record page or pass `?recordId=<Id>` in the URL.
- `c:pdfSigner` auto‑detects `recordId` on Experience Cloud if you link from a record.

4) Payments (safe demo stub)
- Create a Quick Action on `APD_Application__c`: “Create Payment Intent”
- Use Flow or LWC to call `Nuvi_Permit_PayGovService.createPaymentIntent(amount, 'USD', {!Record.Id})`
- Start with 250. It doesn’t charge real money; it returns a demo response.

5) Certificates (make + sign)
- Option A (fast): Use `c:permitPrint` to generate a simple certificate PDF. Click “Save to Record,” then open the Sign page and sign it.
- Option B (bring your template): Upload a PDF template to the application’s Documents folder, then open Sign and sign it.
- Option C (design your own): Use `c:pdfCreatorDragDrop` (in UtilityComponents) to design a certificate and save it, then sign.

Tip: After you click “Save to Record” in `c:permitPrint`, the signer auto‑opens the generated PDF on the sign page.

6) Suggested demo (5 minutes)
- Staff: Open “Permit Operations,” submit application, upload a doc, click “Create Payment Intent,” generate certificate, then sign it.
- Public: In the portal, create/update an application, upload a doc, and sign.

Troubleshooting
- Component missing? Activate the page or re‑publish the portal.
- Can’t sign? Make sure a PDF exists on the record.
- No `recordId`? Open from a record or add `?recordId=<Id>` in the URL.

Next steps
- Reports & dashboards: `Dashboard_Report_Configuration_Guide.md`
- User setup & access: `User_Management_Guide.md`
- AI features: `AI_Services_Guide.md`
