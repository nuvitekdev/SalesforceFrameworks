## Permit Print (Certificate Generator)

Generates a simple permit certificate PDF using the shared `pdf_lib` static resource, saves it to the permit record via `Nuvi_Permit_DocumentController.uploadPermitFile`, and provides download and sign options.

Key points:
- Uses `pdf-lib` from `UtilityComponents/pdfSigner/staticresources/pdf_lib.js`.
- Saves into the virtual folder structure (defaults to `Application_Documents`).
- Can be added to APD record pages. Also embedded into `nuviPermitSignatureManager` for end-to-end flow.

Attributes:
- `record-id`: target record to attach the PDF.
- `agency-type` (default `FEDERAL`), `permit-type` (default `DRILLING`).
- `default-folder` to choose where the generated file lands.
- `primary-color`, `accent-color` theme hints.

