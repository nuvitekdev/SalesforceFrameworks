public with sharing class WhistleblowerReportWrapper {

    public Whistleblower_Report__c wbr { get; set; }

    public Boolean isNew { 
        get { return (this.wbr.Id == null); }
    }

    public WhistleblowerReportWrapper(Whistleblower_Report__c whistleblowerReport) {
        if(whistleblowerReport == null) {
            throw new WhistleblowerReportWrapperException('Whistleblower Report Cannot be null');
        }
        this.wbr = whistleblowerReport;
    }

    public class WhistleblowerReportWrapperException extends Exception {}

}