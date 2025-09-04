     * @param priorityLevel Priority level (Standard, Expedited, Emergency)
     * @return Calculated total fee
     */
    @AuraEnabled
    public static Decimal calculateApplicationFee(String permitTypeName, String formData, String priorityLevel) {
        try {
            // Get fee configuration
            FormConfiguration config = getFormConfiguration(permitTypeName, 'FEDERAL');
            Decimal totalFee = config.feeCalculation.baseFee;
            
            // Parse form data
            Map<String, Object> dataMap = (Map<String, Object>) JSON.deserializeUntyped(formData);
            
            // Apply additional fee rules
            if (config.feeCalculation.additionalRules != null) {
                for (FeeRule rule : config.feeCalculation.additionalRules) {
                    if (dataMap.containsKey(rule.field)) {
                        Decimal fieldValue = Decimal.valueOf(String.valueOf(dataMap.get(rule.field)));
                        if (fieldValue > rule.threshold) {
                            totalFee += (fieldValue - rule.threshold) * rule.rate;
                        }
                    }
                }
            }
            
            // Apply priority multiplier
            if ('Expedited'.equals(priorityLevel)) {
                totalFee *= 1.5; // 50% increase for expedited
            } else if ('Emergency'.equals(priorityLevel)) {
                totalFee *= 2.0; // 100% increase for emergency
            }
            
            return totalFee;
            
        } catch (Exception e) {
            System.debug('Error calculating fee: ' + e.getMessage());
            throw new AuraHandledException('Unable to calculate application fee: ' + e.getMessage());
        }
    }
    
    /**
     * @description Validate form data against permit type requirements
     * @param permitTypeName Name of the permit type
     * @param formData Application form data as JSON string
     * @return Validation results
     */
    @AuraEnabled
    public static Map<String, Object> validateFormData(String permitTypeName, String formData) {
        Map<String, Object> result = new Map<String, Object>();
        List<String> errors = new List<String>();
        List<String> warnings = new List<String>();
        
        try {
            FormConfiguration config = getFormConfiguration(permitTypeName, 'FEDERAL');
            Map<String, Object> dataMap = (Map<String, Object>) JSON.deserializeUntyped(formData);
            
            // Validate required fields
            for (FormStep step : config.steps) {
                for (FormField field : step.fields) {
                    if (field.required && !dataMap.containsKey(field.name)) {
                        errors.add('Required field missing: ' + field.label);
                    }
                    
                    // Pattern validation
                    if (String.isNotBlank(field.pattern) && dataMap.containsKey(field.name)) {
                        String value = String.valueOf(dataMap.get(field.name));
                        if (!Pattern.matches(field.pattern, value)) {
                            errors.add('Invalid format for field: ' + field.label);
                        }
                    }
                }
            }
            
            result.put('isValid', errors.isEmpty());
            result.put('errors', errors);
            result.put('warnings', warnings);
            
        } catch (Exception e) {
            System.debug('Error validating form data: ' + e.getMessage());
            errors.add('Validation error: ' + e.getMessage());
            result.put('isValid', false);
            result.put('errors', errors);
            result.put('warnings', warnings);
        }
        
        return result;
    }
}
