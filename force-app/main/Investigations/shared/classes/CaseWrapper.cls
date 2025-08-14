public with sharing class CaseWrapper {
  public Case cs { get; set; }
  public Boolean isNew {
    get {
      return (this.cs.Id == null);
    }
  }

  public CaseWrapper(Case c) {
    if (c == null) {
      throw new CaseWrapperException('Case Cannot be null');
    }
    this.cs = c;
  }

  public class CaseWrapperException extends Exception {
  }
}
