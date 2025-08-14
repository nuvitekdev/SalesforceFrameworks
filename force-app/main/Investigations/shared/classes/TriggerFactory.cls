public class TriggerFactory {
  private static final String INVALID_TYPE_MSG = 'Invalid class type';
  private static final String INVALID_INSTANCE_MSG = 'Invalid instance, must be of type TriggerHandler';

  // HandlerException to allow throwing
  public class HandlerException extends Exception {
  }

  public static void createAndExecuteHandler(System.Type handlerType) {
    TriggerHandler handler = create(handlerType);
    execute(handler);
  }

  private static TriggerHandler create(System.Type handlerType) {
    System.Type classType = handlerType;

    if (classType == null) {
      throw new HandlerException(TriggerFactory.INVALID_TYPE_MSG);
    }

    Object handler = classType.newInstance();

    if (!(handler instanceof TriggerHandler)) {
      throw new HandlerException(TriggerFactory.INVALID_INSTANCE_MSG);
    }

    return (TriggerHandler) handler;
  }

  private static void execute(TriggerHandler handler) {
    // before context
    if (Trigger.isBefore) {
      if (Trigger.isInsert) {
        handler.beforeInsert(Trigger.new);
      } else if (Trigger.isUpdate) {
        handler.beforeUpdate(Trigger.newMap, Trigger.oldMap);
      } else if (Trigger.isDelete) {
        handler.beforeDelete(Trigger.newMap, Trigger.oldMap);
      }
      // after context
    } else if (Trigger.isAfter) {
      if (Trigger.isInsert) {
        handler.afterInsert(Trigger.newMap);
      } else if (Trigger.isUpdate) {
        handler.afterUpdate(Trigger.newMap, Trigger.oldMap);
      } else if (Trigger.isDelete) {
        handler.afterDelete(Trigger.newMap, Trigger.oldMap);
      } else if (Trigger.isUndelete) {
        handler.afterUnDelete(Trigger.newMap, Trigger.oldMap);
      }
    }
  }
}
