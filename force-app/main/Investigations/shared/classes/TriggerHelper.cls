global class TriggerHelper {

    private static Boolean caseTriggerHasRun = false;
    private static Boolean whistleBlowerReportTriggerHasRun = false;
    private static Set<Id> accountOwnerChangedSet = new Set<Id>();

    // Case
    public static Boolean getCaseTriggerHasRun() {
        return caseTriggerHasRun;
    }

    public static void setCaseTriggerHasRun( Boolean value) {
        caseTriggerHasRun = value;
    }

    // Whistle Blower Reports
    public static Boolean getWhistleBlowerReportTriggerHasRun() {
        return whistleBlowerReportTriggerHasRun;
    }

    public static void setWhistleBlowerReportTriggerHasRun( Boolean value) {
        whistleBlowerReportTriggerHasRun = value;
    }

    // multi-purupose
    public static void addAccountOwnerHasChanged(Id value) {
        accountOwnerChangedSet.add(value);
    }

    public static Boolean getAccountOwnerHasChangedSet(Id acctId) {
        if ( accountOwnerChangedSet.contains( acctId)) {
            return true;
        } else {
            return false;
        }
    }



}