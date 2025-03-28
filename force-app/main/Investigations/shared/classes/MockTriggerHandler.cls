public class MockTriggerHandler implements TriggerHandler {
    // Flags to verify if each method is called
    public Boolean beforeInsertCalled = false;
    public Boolean afterInsertCalled = false;
    public Boolean beforeUpdateCalled = false;
    public Boolean afterUpdateCalled = false;
    public Boolean beforeDeleteCalled = false;
    public Boolean afterDeleteCalled = false;
    public Boolean afterUnDeleteCalled = false;

    public void beforeInsert(List<SObject> newSObjects) {
        beforeInsertCalled = true;
    }

    public void afterInsert(Map<Id, SObject> newSObjects) {
        afterInsertCalled = true;
    }

    public void beforeUpdate(Map<Id, SObject> newSObjects, Map<Id, SObject> oldSObjects) {
        beforeUpdateCalled = true;
    }

    public void afterUpdate(Map<Id, SObject> newSObjects, Map<Id, SObject> oldSObjects) {
        afterUpdateCalled = true;
    }

    public void beforeDelete(Map<Id, SObject> newSObjects, Map<Id, SObject> oldSObjects) {
        beforeDeleteCalled = true;
    }

    public void afterDelete(Map<Id, SObject> newSObjects, Map<Id, SObject> oldSObjects) {
        afterDeleteCalled = true;
    }

    public void afterUnDelete(Map<Id, SObject> newSObjects, Map<Id, SObject> oldSObjects) {
        afterUnDeleteCalled = true;
    }
}