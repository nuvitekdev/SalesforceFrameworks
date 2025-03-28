public class CaseService {
    public CaseService() {
        this.newCases = new Map<Id, Case>();
        this.oldCases = new Map<Id, Case>();
    }

    /* Constants */
        // constants will be added here when we need them
    
    /* Trigger Record Properties */
    private CaseWrapper cWrapper; 
    private CaseWrapper oldCaseWrapper;

    public Map<Id, Case> newCases { get; set; }
    public Map<Id, Case> oldCases { get; set; }

    public Case getNewCase() {
        return this.cWrapper.cs;
    }
    public void setNewCase(Case c){
        this.cWrapper = new CaseWrapper(c);
    }

    public void setCases(Case c, Case oldCase) {
        this.cWrapper = new CaseWrapper(c);
        this.oldCaseWrapper = new CaseWrapper(oldCase);
    }

    public Case getOldCase() {
        return this.oldCaseWrapper.cs;
    }
    public void setOldCase(Case c) {
        this.oldCaseWrapper = new CaseWrapper(c);
    }

    /* Data variables */
        // add data variables here

    /* lists, sets and maps for processing */
    private List<Id> caseOwnerIdList = new List<Id>();
    private Map<Id,User> caseOwnerMap;

    /* Queries */
    public void queryCaseOwners(){
        // this isn't being used, just an example use case
        this.CaseOwnerMap = new Map<Id,User>([SELECT Id FROM User WHERE id IN :this.caseOwnerIdList]);
    }
    /* End Queries */

    /* Query Processing Methods Start */
        // query processing methods would be here (not being used yet)
    /* Query Processing Methods End */

    /* Data Collection Methods Start */
    public void addCaseOwnerId(){
        // this isn't being used, just an example use case
        this.caseOwnerIdList.add(this.cWrapper.cs.OwnerId);
    }
    /* Data Collection Methods End */

    /* Data Setter Methods Start */
    public void setFields() {
        // this isn't being used yet, just an example use case
    }
    /* Data Setter Methods End */


    public void finish() {
        // finish DML statements for other objects
    }

}