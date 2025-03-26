# **Nuvitek Salesforce Naming Conventions**

## **1. Custom Object Names**
- **Format**: `Nuvi_ObjectName__c`  
- **Examples**:  
  - `Nuvi_Employee__c`  
  - `Nuvi_GrantApplication__c`  
- Use **singular nouns** for object labels (e.g., “Employee,” “Grant Application”).  
- If multiple words, separate them with underscores in the API name (e.g., `Nuvi_Grant_Application__c`).  

## **2. Custom Fields**
- **Format**: `Nuvi_FieldName__c`  
- **Examples**:  
  - `Nuvi_HireDate__c`  
  - `Nuvi_GrantBudget__c`  
- Use **CamelCase** or **underscore** separators for readability.  
- Labels should match or closely resemble the API name, but with spaces (e.g., label: “Nuvi Hire Date”).

## **3. Apex Classes**
- **Format**: `Nuvi<ClassName>`  
- **Examples**:  
  - `NuviEmployeeServices`  
  - `NuviGrantApplicationHelper`  
- Use **PascalCase** (each word capitalized).  
- Keep class names short but descriptive.  
- If it’s a utility class, consider suffixes like “Helper,” “Service,” or “Utils” (e.g., `NuviPermitFeeUtils`).

## **4. Apex Triggers**
- **Format**: `Nuvi<ObjectName>Trigger` or `Nuvi_ObjectName_TriggerPurpose`  
- **Examples**:  
  - `NuviEmployeeTrigger`  
  - `Nuvi_Employee_TimeOffTrigger`  
- Typically stick to **one trigger per object** when possible.  
- If multiple triggers are necessary, add a brief suffix for the trigger’s specific purpose (e.g., `NuviGrantApplication_ScoreTrigger`).

## **5. Lightning Web Components**
- **Folder/Component Name**: `nuvi<ComponentName>`  
- **Examples**:  
  - `nuviEmployeeTile`  
  - `nuviGrantApplicationForm`  
- Use **lowerCamelCase** for the LWC folder and files (e.g., `nuviEmployeeTile.js`, `nuviEmployeeTile.html`).  
- For multi-word, do something like `nuviEmployeeDashboardCard`.

## **6. Flows & Process Builder**
- **Flows**  
  - **Format**: `Nuvi<FlowPurpose>`  
  - **Examples**: `NuviEmployeeOnboarding`, `NuviGrantApprovalProcess`  
- **Process Builder**  
  - **Format**: `Nuvi_ObjectName - Purpose`  
  - **Examples**: `Nuvi_Employee - Auto Assign Manager`

## **7. Permission Sets & Profiles**
- **Permission Sets**  
  - **Format**: `Nuvi_AppOrRole_Function`  
  - **Examples**:  
    - `Nuvi_HR_Manager_Permissions`  
    - `Nuvi_GrantReviewer_Access`  
- **Profiles**  
  - **Format**: `Nuvi_RoleProfile` or `Nuvi<Department>Profile`  
  - **Examples**:  
    - `Nuvi_GrantApplicantProfile`  
    - `Nuvi_HRAdminProfile`

## **8. Record Types**
- **Format**: `Nuvi_ObjectName - RecordTypePurpose`  
- **Examples**:  
  - `Nuvi_Employee Request - Onboarding`  
  - `Nuvi_Permit Application - Building`  
- Keep them descriptive (e.g., “Onboarding,” “Leave Request,” “Building”).

## **9. Validation Rules & Other Metadata**
- **Validation Rules**  
  - **Format**: `Nuvi_DescriptiveName`  
  - **Examples**: `Nuvi_RequiredFieldsCheck`, `Nuvi_ValidateBudgetAmount`  
- **Email Templates**  
  - **Format**: `Nuvi_AppOrObject_Function` (e.g., `Nuvi_HR_OfferLetter_Template`)  
- **Workflow Rules** or **Approval Processes**  
  - **Format**: `Nuvi_ObjectName - Purpose` (e.g., `Nuvi_Employee - Onboarding Approval`)  

## **10. General Guidelines**
- Start **every** custom name with `Nuvi_` (or `Nuvi` for classes and LWCs) to identify it as part of the **Nuvitek framework**.  
- Use underscores or CamelCase for clarity, but keep it consistent.  
- Avoid reserved words like “Name,” “Type,” or “Stage.”  
- Keep naming **descriptive** and **concise** to simplify maintenance.