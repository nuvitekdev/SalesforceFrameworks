({
    /**
     * Initialize the component
     */
    init: function(component, event, helper) {
        // Any initialization can go here
        console.log('Aura wrapper initialized');
    },
    
    /**
     * Handle attribute changes
     */
    handleAttributeChange: function(component, event, helper) {
        // Attributes passed to LWC will automatically update
        console.log('Attribute changed');
    }
}) 