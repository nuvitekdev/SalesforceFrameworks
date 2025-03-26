public class CaseTriggerHandler implements TriggerHandler {

    public CaseTriggerHandler() {}

    /* Before Insert */
    public void beforeInsert(List<sObject> newSObjects) {}
    
    /* After Insert */
    public void afterInsert(Map<Id, sObject> newSObjects) {}

    /* Before Update */
    public void beforeUpdate(Map<Id, sObject> newSObjects, Map<Id, sObject> oldSObjects) {
        Map<Id, Case> newCases = ( Map<Id, Case>)newSObjects;
        Map<Id, Case> oldCases = ( Map<Id, Case>)oldSObjects;

        CaseService service = new CaseService();
        service.newCases = newCases;
        service.oldCases = oldCases;
        
        // Pre-processing
        for(Case c : newCases.values()) {
            service.setNewCase(c);
            service.addCaseOwnerId();
        }
    
        // Post-processing queries (related data)
        service.queryCaseOwners();

        // Data processing (record updates)
        for(Case c : newCases.values()) {
            service.setNewCase(c);
            service.setFields();
            c = service.getNewCase();
        }
    }

    /* After Update */
    public void afterUpdate(Map<Id, sObject> newSObjects, Map<Id, sObject> oldSObjects) {
        Map<Id, Case> newCases = (Map<Id, Case>)newSObjects;
        Map<Id, Case> oldCases = (Map<Id, Case>)oldSObjects;

        CaseService service = new CaseService();
        service.newCases = newCases;
        service.oldCases = oldCases;

        // Pre-processing Queries would be here
        
        // Pre-processing
        for(Case c : newCases.values()) {
            service.setNewCase(c);
            service.addCaseOwnerId();
        }

        // Post-processing queries (related data) would be here

        // Data Processing would be here

        // Data prep for finish method would be here

        service.finish();
    }
   

    /* Delete Operations */
    public void beforeDelete(Map<Id, sObject> newSObjects, Map<Id, sObject> oldSObjects) {}
    public void afterDelete(Map<Id, sObject> newSObjects, Map<Id, sObject> oldSObjects) {}

    /* Undelete Operations */
    public void afterUnDelete(Map<Id, sObject> newSObjects, Map<Id, sObject> oldSObjects) {}

}